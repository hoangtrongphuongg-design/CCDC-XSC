"use server";

import { setFlashMessage } from "@/lib/auth/session";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { disposals, equipment, groups, toolCatalog, toolDisposals } from "@/lib/db/schema";
import { requireGroupPermission, requireWsManager } from "@/lib/auth/guards";
import { assertEquipmentHasNoOtherOpenWorkflow, lockEquipment, nextWorkflowCode } from "@/lib/workflows";
import { writeAudit } from "@/lib/audit";

function refresh() {
  revalidatePath("/disposals");
  revalidatePath("/equipment");
  revalidatePath("/dashboard");
  revalidatePath("/my-equipment");
}

export async function createDisposalAction(formData: FormData) {
  const equipmentId = String(formData.get("equipmentId") || "");
  const reason = String(formData.get("reason") || "").trim();
  const conditionSummary = String(formData.get("conditionSummary") || "").trim();
  const [item] = await db.select().from(equipment).where(eq(equipment.id, equipmentId)).limit(1);
  if (!item) throw new Error("Không tìm thấy máy.");
  if (item.recordStatus !== "active") throw new Error("Dụng cụ chưa hoàn thành hồ sơ nên chưa thể thanh lý.");
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

  await setFlashMessage("success", 'Đã tạo đề nghị thanh lý');
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

  await setFlashMessage("success", 'Nhóm đã xác nhận thanh lý');
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

  await setFlashMessage("success", 'Đã duyệt thanh lý');
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

  await setFlashMessage("success", 'Đã xác nhận nhập kho thanh lý');
}


/** CCDC nhỏ lẻ quản lý theo số lượng vẫn được đề xuất thanh lý một phần hoặc toàn bộ. */
export async function createToolDisposalAction(formData: FormData) {
  const toolId = String(formData.get("toolId") || "");
  const quantity = Number(formData.get("quantity") || 0);
  const reason = String(formData.get("reason") || "").trim();
  const conditionSummary = String(formData.get("conditionSummary") || "").trim();
  const [tool] = await db.select().from(toolCatalog).where(eq(toolCatalog.id, toolId)).limit(1);
  if (!tool || !tool.isActive || tool.recordStatus !== "active") throw new Error("Không tìm thấy CCDC theo số lượng.");
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Number(tool.quantityOnHand)) {
    throw new Error("Số lượng đề xuất thanh lý không hợp lệ.");
  }
  if (!reason) throw new Error("Vui lòng nhập lý do đề xuất thanh lý.");

  const auth = await requireGroupPermission(tool.groupId, "operator");
  await db.transaction(async (tx) => {
    const code = await nextWorkflowCode(tx, "TLVT");
    const [created] = await tx.insert(toolDisposals).values({
      code,
      toolId: tool.id,
      ownerGroupId: tool.groupId,
      quantity: String(quantity),
      proposedBy: auth.userId,
      reason,
      conditionSummary: conditionSummary || null,
      status: "pending_group",
    }).returning();

    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: tool.groupId,
      action: "tool_disposal.create",
      entityType: "tool_disposal",
      entityId: created.id,
      description: `Tạo đề xuất thanh lý ${quantity} ${tool.unit} ${tool.name}`,
      afterData: created,
    });
  });
  refresh();
  await setFlashMessage("success", "Đã tạo đề nghị thanh lý CCDC");
}

export async function confirmToolDisposalByGroupAction(formData: FormData) {
  const disposalId = String(formData.get("disposalId") || "");
  const [item] = await db.select().from(toolDisposals).where(eq(toolDisposals.id, disposalId)).limit(1);
  if (!item) throw new Error("Không tìm thấy phiếu thanh lý CCDC.");
  const auth = await requireGroupPermission(item.ownerGroupId, "manager");
  if (item.proposedBy === auth.userId) throw new Error("Người tạo phiếu không được tự xác nhận đề xuất của nhóm.");

  const [updated] = await db.update(toolDisposals).set({
    status: "pending_ws",
    groupConfirmedBy: auth.userId,
    groupConfirmedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(toolDisposals.id, item.id), eq(toolDisposals.status, "pending_group"))).returning();

  if (!updated) throw new Error("Phiếu đã được xử lý.");
  refresh();
  await setFlashMessage("success", "Nhóm đã xác nhận thanh lý CCDC");
}

export async function approveToolDisposalByWsAction(formData: FormData) {
  const disposalId = String(formData.get("disposalId") || "");
  const auth = await requireWsManager();
  const [item] = await db.select().from(toolDisposals).where(eq(toolDisposals.id, disposalId)).limit(1);
  if (!item || item.status !== "pending_ws") throw new Error("Phiếu chưa sẵn sàng để duyệt.");

  await db.transaction(async (tx) => {
    const [tool] = await tx.select().from(toolCatalog).where(eq(toolCatalog.id, item.toolId)).limit(1);
    if (!tool) throw new Error("Không tìm thấy CCDC.");
    const current = Number(tool.quantityOnHand);
    const disposalQty = Number(item.quantity);
    if (disposalQty <= 0 || disposalQty > current) throw new Error("Số lượng hiện tại không đủ để hoàn tất thanh lý.");
    const remaining = current - disposalQty;

    const [updated] = await tx.update(toolDisposals).set({
      status: "completed",
      wsApprovedBy: auth.userId,
      wsApprovedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(toolDisposals.id, item.id), eq(toolDisposals.status, "pending_ws"))).returning();
    if (!updated) throw new Error("Phiếu đã được xử lý.");

    await tx.update(toolCatalog).set({
      quantityOnHand: String(remaining),
      condition: remaining <= 0 ? "irreparable" : tool.condition,
      isActive: remaining > 0,
      updatedAt: new Date(),
    }).where(eq(toolCatalog.id, tool.id));

    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: item.ownerGroupId,
      action: "tool_disposal.complete",
      entityType: "tool_disposal",
      entityId: item.id,
      description: `Duyệt thanh lý ${disposalQty} ${tool.unit} ${tool.name}; còn ${remaining} ${tool.unit}`,
      afterData: { disposal: updated, remainingQuantity: remaining },
    });
  });

  refresh();
  await setFlashMessage("success", "Đã duyệt thanh lý CCDC");
}
