/**
 * Mở một đợt kiểm kê cho một nhóm: chụp danh sách máy cần kiểm (máy thuộc nhóm + máy nhóm đang mượn giữ).
 * Dùng chung cho đợt mở TAY (`createInventoryAction`) và đợt TỰ ĐỘNG hàng tháng (`runMonthlyInventory`), nên không đặt
 * trong file "use server". Không kiểm quyền ở đây: nơi gọi tự kiểm.
 */
import { and, asc, eq, inArray, ne, or } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { equipment, groups, inventoryItems, inventorySessions, machineLoans, toolCatalog } from "@/lib/db/schema";
import { isOfficialOperationalGroupCode } from "@/lib/group-structure";
import { INVENTORY_MAX_ITEMS, classifyExpected, isToolQuarter } from "@/lib/inventory";
import { BORROWER_HOLDING_STATUSES } from "@/lib/loan-status";
import { nextWorkflowCode } from "@/lib/workflows";

const INSERT_CHUNK = 400;

export type CreatedInventory = { sessionId: string; code: string; groupName: string; machineCount: number };

export async function createInventorySession(input: {
  groupId: string;
  title: string | null;
  /** null = do hệ thống tự mở. */
  createdBy: string | null;
  /** "YYYY-MM" cho đợt định kỳ; null cho đợt mở tay. */
  period: string | null;
}): Promise<CreatedInventory> {
  const { groupId, createdBy, period } = input;
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group || group.isSystem || !group.isActive || !isOfficialOperationalGroupCode(group.code)) throw new Error("Nhóm quản lý không hợp lệ.");

  const [existing] = await db.select({ code: inventorySessions.code }).from(inventorySessions)
    .where(and(eq(inventorySessions.groupId, groupId), eq(inventorySessions.status, "open"))).limit(1);
  if (existing) throw new Error(`Nhóm đang có đợt kiểm kê ${existing.code} chưa đóng. Hãy đóng đợt đó trước khi mở đợt mới.`);

  const [ownedRows, holdingLoans, groupRows] = await Promise.all([
    db.select({ id: equipment.id, ownerGroupId: equipment.ownerGroupId, status: equipment.status }).from(equipment)
      .where(and(eq(equipment.ownerGroupId, groupId), eq(equipment.recordStatus, "active"), ne(equipment.status, "lost"))).orderBy(asc(equipment.code)),
    db.select({ equipmentId: machineLoans.equipmentId, ownerGroupId: machineLoans.ownerGroupId, borrowerGroupId: machineLoans.borrowerGroupId })
      .from(machineLoans)
      .where(and(inArray(machineLoans.status, [...BORROWER_HOLDING_STATUSES]), or(eq(machineLoans.ownerGroupId, groupId), eq(machineLoans.borrowerGroupId, groupId)))),
    db.select({ id: groups.id, name: groups.name }).from(groups),
  ]);
  const heldBy = new Map(holdingLoans.map((loan) => [loan.equipmentId, loan.borrowerGroupId]));
  const ownedIds = new Set(ownedRows.map((row) => row.id));
  const borrowedInIds = holdingLoans.filter((loan) => loan.borrowerGroupId === groupId && !ownedIds.has(loan.equipmentId)).map((loan) => loan.equipmentId);
  const borrowedInRows = borrowedInIds.length
    ? await db.select({ id: equipment.id, ownerGroupId: equipment.ownerGroupId, status: equipment.status }).from(equipment)
      .where(and(inArray(equipment.id, borrowedInIds), eq(equipment.recordStatus, "active")))
    : [];

  const machines = [...ownedRows, ...borrowedInRows];
  if (!machines.length) throw new Error("Nhóm chưa có máy nào hoàn thành hồ sơ để kiểm kê.");
  if (machines.length > INVENTORY_MAX_ITEMS) throw new Error(`Nhóm có ${machines.length} máy, vượt giới hạn ${INVENTORY_MAX_ITEMS} máy mỗi đợt.`);
  const groupName = new Map(groupRows.map((row) => [row.id, row.name]));
  const nameOf = (id: string) => groupName.get(id) ?? "—";

  // Kỳ quý (tháng 1/4/7/10): đợt kèm đếm CCDC theo số lượng nếu nhóm có CCDC đang hoạt động.
  const includesTools = isToolQuarter(period) && (await groupHasActiveTools(groupId));

  let sessionId = "";
  let code = "";
  try {
    await db.transaction(async (tx) => {
      code = await nextWorkflowCode(tx, "KK");
      const [session] = await tx.insert(inventorySessions).values({ code, groupId, title: input.title, createdBy, period, includesTools }).returning({ id: inventorySessions.id });
      sessionId = session.id;
      const values = machines.map((machine) => {
        const { offsite, note } = classifyExpected({ groupId, ownerGroupId: machine.ownerGroupId, heldByGroupId: heldBy.get(machine.id) ?? null, status: machine.status }, nameOf);
        return { sessionId: session.id, equipmentId: machine.id, offsite, expectedNote: note };
      });
      for (let start = 0; start < values.length; start += INSERT_CHUNK) await tx.insert(inventoryItems).values(values.slice(start, start + INSERT_CHUNK));
      await writeAudit(tx, {
        actorUserId: createdBy,
        actorGroupId: groupId,
        actorRole: createdBy ? null : "Hệ thống",
        // Đợt tự động ghi theo nhóm (mirror, ẩn khỏi bảng tin); bảng tin chỉ có dòng tổng hợp mỗi lần chạy.
        action: period ? "inventory.schedule_create" : "inventory.create",
        entityType: "inventory_session",
        entityId: session.id,
        description: period
          ? `Tự mở đợt kiểm kê ${code} cho ${group.name} (${machines.length} máy${includesTools ? " + CCDC theo số lượng" : ""}) — kỳ ${period}`
          : `Mở đợt kiểm kê ${code} cho ${group.name} (${machines.length} máy)${input.title ? `: ${input.title}` : ""}`,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error("Nhóm vừa có đợt kiểm kê khác (hoặc đã có đợt của kỳ này). Hãy tải lại trang.");
    throw error;
  }
  return { sessionId, code, groupName: group.name, machineCount: machines.length };
}

/** Nhóm có ít nhất một CCDC theo số lượng đang hoạt động (hồ sơ hoàn tất) — điều kiện để kỳ quý có khối đếm CCDC. */
export async function groupHasActiveTools(groupId: string): Promise<boolean> {
  const [row] = await db.select({ id: toolCatalog.id }).from(toolCatalog)
    .where(and(eq(toolCatalog.groupId, groupId), eq(toolCatalog.isActive, true), eq(toolCatalog.recordStatus, "active"))).limit(1);
  return Boolean(row);
}
