"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { disposals, equipment, groups } from "@/lib/db/schema";
import { requireGroupPermission, requireWsManager } from "@/lib/auth/guards";
import { assertEquipmentHasNoOtherOpenWorkflow, lockEquipment, nextWorkflowCode } from "@/lib/workflows";
import { writeAudit } from "@/lib/audit";

function refresh() {
  revalidatePath("/disposals");
  revalidatePath("/equipment");
  revalidatePath("/dashboard");
}

export async function createDisposalAction(formData: FormData) {
  const equipmentId = String(formData.get("equipmentId") || "");
  const reason = String(formData.get("reason") || "").trim();
  const conditionSummary = String(formData.get("conditionSummary") || "").trim();
  const [item] = await db.select().from(equipment).where(eq(equipment.id, equipmentId)).limit(1);
  if (!item) throw new Error("Không tìm thấy máy.");
  const auth = await requireGroupPermission(item.ownerGroupId, "operator");
  if (!reason || !conditionSummary) throw new Error("Vui lòng ghi rõ lý do và tình trạng.");
  if (item.condition !== "irreparable" && item.status !== "wait_disposal") throw new Error("Máy chưa có kết luận không thể phục hồi/chờ thanh lý.");

  await db.transaction(async (tx) => {
    await lockEquipment(tx, item.id);
    await assertEquipmentHasNoOtherOpenWorkflow(tx, item.id);
    const code = await nextWorkflowCode(tx, "TL");
    const [created] = await tx.insert(disposals).values({ code, equipmentId: item.id, ownerGroupId: item.ownerGroupId, proposedBy: auth.userId, reason, conditionSummary, status: "pending_group" }).returning();
    await tx.update(equipment).set({ status: "wait_disposal", updatedAt: new Date() }).where(eq(equipment.id, item.id));
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: item.ownerGroupId,
      action: "disposal.create",
      entityType: "disposal",
      entityId: created.id,
      description: `Tạo đề xuất thanh lý ${item.code}`,
      afterData: created,
    });
  });
  refresh();
}

export async function confirmDisposalByGroupAction(formData: FormData) {
  const disposalId = String(formData.get("disposalId") || "");
  const [item] = await db.select().from(disposals).where(eq(disposals.id, disposalId)).limit(1);
  if (!item) throw new Error("Không tìm thấy phiếu.");
  const auth = await requireGroupPermission(item.ownerGroupId, "manager");
  if (item.proposedBy === auth.userId) throw new Error("Người tạo phiếu không được tự xác nhận đề xuất của nhóm.");
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(disposals).set({ status: "pending_ws", groupConfirmedBy: auth.userId, groupConfirmedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(disposals.id, item.id), eq(disposals.status, "pending_group"))).returning();
    if (!updated) throw new Error("Phiếu đã được xử lý.");
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: item.ownerGroupId,
      action: "disposal.group_confirm",
      entityType: "disposal",
      entityId: item.id,
      description: `Nhóm quản lý xác nhận đề xuất ${item.code}`,
      afterData: updated,
    });
  });
  refresh();
}

export async function approveDisposalByWsAction(formData: FormData) {
  const disposalId = String(formData.get("disposalId") || "");
  const auth = await requireWsManager();
  const [item] = await db.select().from(disposals).where(eq(disposals.id, disposalId)).limit(1);
  if (!item || item.status !== "pending_ws") throw new Error("Phiếu chưa sẵn sàng để duyệt.");
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(disposals).set({ status: "wait_warehouse", wsApprovedBy: auth.userId, wsApprovedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(disposals.id, item.id), eq(disposals.status, "pending_ws"))).returning();
    if (!updated) throw new Error("Phiếu đã được xử lý.");
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      action: "disposal.ws_approve",
      entityType: "disposal",
      entityId: item.id,
      description: `WS duyệt đề xuất thanh lý ${item.code}`,
      afterData: updated,
    });
  });
  refresh();
}

export async function receiveDisposalWarehouseAction(formData: FormData) {
  const disposalId = String(formData.get("disposalId") || "");
  const [warehouse] = await db.select().from(groups).where(eq(groups.code, "KHO_TL")).limit(1);
  if (!warehouse) throw new Error("Chưa có nhóm hệ thống KHO_TL.");
  const auth = await requireGroupPermission(warehouse.id, "operator");
  const [item] = await db.select().from(disposals).where(eq(disposals.id, disposalId)).limit(1);
  if (!item || item.status !== "wait_warehouse") throw new Error("Phiếu chưa chờ nhập kho.");

  await db.transaction(async (tx) => {
    const [updated] = await tx.update(disposals).set({ status: "completed", warehouseReceivedBy: auth.userId, warehouseReceivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(disposals.id, item.id), eq(disposals.status, "wait_warehouse"))).returning();
    if (!updated) throw new Error("Phiếu đã được xử lý.");
    await tx.update(equipment).set({ ownerGroupId: warehouse.id, currentGroupId: warehouse.id, currentHolderId: auth.userId, currentLocation: "Kho thanh lý", status: "disposal_warehouse", condition: "irreparable", updatedAt: new Date() }).where(eq(equipment.id, item.equipmentId));
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: warehouse.id,
      action: "disposal.warehouse_receive",
      entityType: "disposal",
      entityId: item.id,
      description: `Xác nhận nhập Kho thanh lý ${item.code}`,
      afterData: updated,
    });
  });
  refresh();
}
