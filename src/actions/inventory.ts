"use server";

import { and, asc, eq, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { setFlashMessage, type AuthContext } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { equipment, groups, inventoryItems, inventorySessions, machineLoans } from "@/lib/db/schema";
import { isOfficialOperationalGroupCode } from "@/lib/group-structure";
import {
  INVENTORY_MAX_ITEMS,
  INVENTORY_RESULT_LABELS,
  canCheckInventory,
  canManageInventory,
  canOpenInventory,
  classifyExpected,
  summarizeInventory,
  type InventoryResult,
} from "@/lib/inventory";
import { BORROWER_HOLDING_STATUSES } from "@/lib/loan-status";
import { isUuid } from "@/lib/machine-profile";
import { createInventorySession } from "@/lib/inventory-create";
import { runMonthlyInventory } from "@/lib/inventory-schedule-data";

const MAX_NOTE = 200;

function refresh(sessionId?: string, equipmentId?: string) {
  revalidatePath("/inventory");
  if (sessionId) revalidatePath(`/inventory/${sessionId}`);
  if (equipmentId) revalidatePath(`/equipment/${equipmentId}`);
  revalidatePath("/activities");
}

/** Mở đợt kiểm kê cho một nhóm: chụp danh sách máy cần kiểm (máy thuộc nhóm + máy nhóm đang mượn giữ). */
export async function createInventoryAction(formData: FormData) {
  const auth = await requireUser();
  const groupId = String(formData.get("groupId") || "");
  const title = String(formData.get("title") || "").replace(/\s+/g, " ").trim().slice(0, 180);
  if (!isUuid(groupId)) throw new Error("Hãy chọn nhóm cần kiểm kê.");
  if (!canOpenInventory(auth)) throw new Error("Chỉ Quản lý Xưởng hoặc Admin được mở đợt kiểm kê tay. Đợt định kỳ tự mở ngày 1 hằng tháng.");

  const created = await createInventorySession({ groupId, title: title || null, createdBy: auth.userId, period: null });

  refresh(created.sessionId);
  await setFlashMessage("success", "Đã mở đợt kiểm kê", `${created.machineCount} máy cần kiểm.`);
  redirect(`/inventory/${created.sessionId}`);
}

/**
 * Chạy ngay kiểm kê định kỳ của tháng (cùng hàm với cron hằng ngày; dự phòng khi cron chưa cấu hình / lỡ ngày 1).
 * Chỉ Quản lý Xưởng / Admin. Idempotent: chạy lại không tạo trùng.
 */
export async function runMonthlyInventoryAction() {
  const auth = await requireUser();
  if (auth.isReadOnlyViewer || !auth.isWorkshopAdmin) throw new Error("Chỉ Quản lý Xưởng hoặc Admin được chạy kiểm kê định kỳ.");
  const summary = await runMonthlyInventory();
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/activities");
  const nothing = !summary.created && !summary.adopted && !summary.closed;
  await setFlashMessage(
    summary.errors.length ? "error" : "success",
    nothing ? "Không có gì cần làm" : "Đã chạy kiểm kê định kỳ",
    nothing
      ? `Kỳ ${summary.period}: các nhóm có máy đều đã có đợt, hoặc đã quá ngày 15.`
      : `Mở ${summary.created} đợt, nhận ${summary.adopted} đợt đang mở, đóng ${summary.closed} đợt quá hạn.${summary.errors.length ? ` Lỗi: ${summary.errors.join("; ")}` : ""}`,
  );
}

type CheckOutcome = { ok: true } | { ok: false; message: string };

/**
 * Ghi kết quả kiểm một máy. `result = null` là hoàn tác. Máy chưa có trong danh sách chỉ được thêm
 * (là "thừa") khi `addIfMissing` và kết quả là "có mặt" — dùng cho quét QR ở hồ sơ máy.
 */
async function applyCheck(
  auth: AuthContext,
  input: { sessionId: string; equipmentId: string; result: InventoryResult | null; note?: string | null; addIfMissing: boolean },
): Promise<CheckOutcome> {
  if (!isUuid(input.sessionId) || !isUuid(input.equipmentId)) return { ok: false, message: "Dữ liệu không hợp lệ." };
  if (input.result !== null && input.result !== "found" && input.result !== "missing") return { ok: false, message: "Kết quả không hợp lệ." };
  const note = input.result === "missing" ? (input.note ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE) || null : null;

  const [session] = await db.select().from(inventorySessions).where(eq(inventorySessions.id, input.sessionId)).limit(1);
  if (!session) return { ok: false, message: "Không tìm thấy đợt kiểm kê." };
  if (!canCheckInventory(auth, session.groupId)) return { ok: false, message: "Bạn không có quyền kiểm kê cho nhóm này." };

  try {
    await db.transaction(async (tx) => {
      const [fresh] = await tx.select({ status: inventorySessions.status }).from(inventorySessions).where(eq(inventorySessions.id, session.id)).for("update");
      if (!fresh || fresh.status !== "open") throw new Error("Đợt kiểm kê đã đóng.");
      const [machine] = await tx.select({ id: equipment.id, code: equipment.code, recordStatus: equipment.recordStatus }).from(equipment).where(eq(equipment.id, input.equipmentId)).limit(1);
      if (!machine) throw new Error("Không tìm thấy máy.");

      const [item] = await tx.select({ id: inventoryItems.id }).from(inventoryItems)
        .where(and(eq(inventoryItems.sessionId, session.id), eq(inventoryItems.equipmentId, input.equipmentId))).limit(1);
      const now = new Date();
      if (!item) {
        if (!input.addIfMissing || input.result !== "found") throw new Error("Máy này không thuộc danh sách của đợt kiểm kê.");
        if (machine.recordStatus !== "active") throw new Error("Hồ sơ máy chưa hoàn thành nên chưa thể kiểm kê.");
        await tx.insert(inventoryItems).values({ sessionId: session.id, equipmentId: machine.id, unexpected: true, result: "found", checkedBy: auth.userId, checkedAt: now, expectedNote: "Không có trong danh sách (thừa)" });
      } else {
        await tx.update(inventoryItems).set({
          result: input.result,
          note,
          checkedBy: input.result ? auth.userId : null,
          checkedAt: input.result ? now : null,
        }).where(eq(inventoryItems.id, item.id));
      }
      await writeAudit(tx, {
        actorUserId: auth.userId,
        actorGroupId: session.groupId,
        action: "inventory.check",
        entityType: "equipment",
        entityId: machine.id,
        description: input.result
          ? `Kiểm kê ${session.code}: ${INVENTORY_RESULT_LABELS[input.result]} — ${machine.code}${note ? ` (${note})` : ""}${item ? "" : " [thừa]"}`
          : `Kiểm kê ${session.code}: hoàn tác kết quả — ${machine.code}`,
      });
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Không ghi được kết quả kiểm kê." };
  }
  return { ok: true };
}

/** Gọi từ danh sách kiểm kê (client): trả kết quả thay vì ném lỗi vì Next che nội dung lỗi ở production. */
export async function checkInventoryItemAction(input: { sessionId: string; equipmentId: string; result: InventoryResult | null; note?: string | null }): Promise<CheckOutcome> {
  const auth = await requireUser();
  const outcome = await applyCheck(auth, { ...input, addIfMissing: false });
  if (outcome.ok) refresh(input.sessionId, input.equipmentId);
  return outcome;
}

/** Gọi từ hồ sơ máy (quét QR bằng camera điện thoại): đánh dấu máy này; chưa có trong danh sách thì thêm là "thừa". */
export async function markInventoryFromProfileAction(formData: FormData) {
  const auth = await requireUser();
  const sessionId = String(formData.get("sessionId") || "");
  const equipmentId = String(formData.get("equipmentId") || "");
  const raw = String(formData.get("result") || "");
  if (raw !== "found" && raw !== "missing" && raw !== "undo") throw new Error("Kết quả không hợp lệ.");
  const result: InventoryResult | null = raw === "undo" ? null : raw;
  const outcome = await applyCheck(auth, { sessionId, equipmentId, result, note: null, addIfMissing: true });
  if (!outcome.ok) throw new Error(outcome.message);
  refresh(sessionId, equipmentId);
  await setFlashMessage("success", result ? `Đã ghi nhận: ${INVENTORY_RESULT_LABELS[result]}` : "Đã hoàn tác");
}

/** Đóng đợt kiểm kê (khóa kết quả). Máy chưa kiểm vẫn được ghi nhận là "chưa kiểm" trong biên bản. */
export async function closeInventoryAction(formData: FormData) {
  const auth = await requireUser();
  const sessionId = String(formData.get("sessionId") || "");
  if (!isUuid(sessionId)) throw new Error("Dữ liệu không hợp lệ.");
  const [session] = await db.select().from(inventorySessions).where(eq(inventorySessions.id, sessionId)).limit(1);
  if (!session) throw new Error("Không tìm thấy đợt kiểm kê.");
  if (!canManageInventory(auth, session.groupId)) throw new Error("Chỉ Đốc công của nhóm hoặc Quản lý Xưởng được đóng đợt kiểm kê.");

  await db.transaction(async (tx) => {
    const [updated] = await tx.update(inventorySessions).set({ status: "closed", closedBy: auth.userId, closedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(inventorySessions.id, sessionId), eq(inventorySessions.status, "open"))).returning({ id: inventorySessions.id });
    if (!updated) throw new Error("Đợt kiểm kê đã được đóng trước đó.");
    const items = await tx.select({ result: inventoryItems.result, offsite: inventoryItems.offsite, unexpected: inventoryItems.unexpected }).from(inventoryItems).where(eq(inventoryItems.sessionId, sessionId));
    const summary = summarizeInventory(items);
    await writeAudit(tx, {
      actorUserId: auth.userId,
      actorGroupId: session.groupId,
      action: "inventory.close",
      entityType: "inventory_session",
      entityId: sessionId,
      description: `Đóng đợt kiểm kê ${session.code}: ${summary.found} có mặt, ${summary.missing} không thấy, ${summary.pending} chưa kiểm, ${summary.unexpected} thừa`,
      afterData: summary,
    });
  });

  refresh(sessionId);
  await setFlashMessage("success", "Đã đóng đợt kiểm kê", "Có thể xuất biên bản Excel.");
}
