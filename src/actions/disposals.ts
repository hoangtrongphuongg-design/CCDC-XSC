"use server";

import { setFlashMessage } from "@/lib/auth/session";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { disposals, equipment, groups, toolCatalog, toolDisposals } from "@/lib/db/schema";
import { requireGroupPermission, requireUser, requireWsManager } from "@/lib/auth/guards";
import { assertEquipmentHasNoOtherOpenWorkflow, lockEquipment, nextWorkflowCode } from "@/lib/workflows";
import { writeAudit } from "@/lib/audit";
import { canProposeDisposal } from "@/lib/disposal-rule";

/**
 * Luồng thanh lý (máy có mã và CCDC theo số lượng): nhóm quản lý tạo phiếu → Quản lý Xưởng/Admin duyệt (hoặc từ chối,
 * người tạo hủy được khi còn chờ) → [máy] chờ nhập kho → Quản lý Xưởng/Admin xác nhận nhập Kho thanh lý.
 * Không còn bước "Nhóm xác nhận"; phiếu cũ còn `pending_group` vẫn được duyệt như `pending_ws`.
 */
const AWAITING_WS = ["pending_ws", "pending_group"] as const;

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
  if (!canProposeDisposal({ status: item.status, condition: item.condition })) {
    throw new Error("Chỉ thanh lý máy có tình trạng Hư hỏng hoặc Không thể phục hồi và chưa nằm trong quy trình khác.");
  }

  await db.transaction(async (tx) => {
    await lockEquipment(tx, item.id);
    await assertEquipmentHasNoOtherOpenWorkflow(tx, item.id);
    const code = await nextWorkflowCode(tx, "TL");
    const [created] = await tx.insert(disposals).values({ code, equipmentId: item.id, ownerGroupId: item.ownerGroupId, proposedBy: auth.userId, reason, conditionSummary, status: "pending_ws" }).returning();
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

  await setFlashMessage("success", "Đã tạo phiếu thành công", "Đề xuất thanh lý máy đã gửi Quản lý Xưởng duyệt");
}

export async function approveDisposalByWsAction(formData: FormData) {
  const disposalId = String(formData.get("disposalId") || "");
  const auth = await requireWsManager();
  const [item] = await db.select().from(disposals).where(eq(disposals.id, disposalId)).limit(1);
  if (!item || !(AWAITING_WS as readonly string[]).includes(item.status)) throw new Error("Phiếu chưa sẵn sàng để duyệt.");
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(disposals).set({ status: "wait_warehouse", wsApprovedBy: auth.userId, wsApprovedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(disposals.id, item.id), inArray(disposals.status, [...AWAITING_WS]))).returning();
    if (!updated) throw new Error("Phiếu đã được xử lý.");
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      action: "disposal.ws_approve",
      entityType: "disposal",
      entityId: item.id,
      description: `Quản lý Xưởng duyệt đề xuất thanh lý ${item.code}`,
      afterData: updated,
    });
  });
  refresh();

  await setFlashMessage("success", 'Đã duyệt thanh lý', 'Nhóm mang máy tới kho; Quản lý Xưởng xác nhận nhập kho');
}

/** Quản lý Xưởng / Admin từ chối đề xuất (bắt buộc lý do): phiếu đóng, máy về Chờ kiểm tra, giữ nguyên tình trạng. */
export async function rejectDisposalAction(formData: FormData) {
  const disposalId = String(formData.get("disposalId") || "");
  const reason = String(formData.get("rejectionReason") || "").trim();
  const auth = await requireWsManager();
  if (!reason) throw new Error("Vui lòng nhập lý do từ chối.");
  const [item] = await db.select().from(disposals).where(eq(disposals.id, disposalId)).limit(1);
  if (!item || !(AWAITING_WS as readonly string[]).includes(item.status)) throw new Error("Phiếu chưa ở bước chờ duyệt.");
  await db.transaction(async (tx) => {
    await lockEquipment(tx, item.equipmentId);
    const [updated] = await tx.update(disposals).set({ status: "rejected", rejectionReason: reason, updatedAt: new Date() })
      .where(and(eq(disposals.id, item.id), inArray(disposals.status, [...AWAITING_WS]))).returning();
    if (!updated) throw new Error("Phiếu đã được xử lý.");
    await tx.update(equipment).set({ status: "wait_inspection", updatedAt: new Date() }).where(and(eq(equipment.id, item.equipmentId), eq(equipment.status, "wait_disposal")));
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      action: "disposal.reject",
      entityType: "disposal",
      entityId: item.id,
      description: `Từ chối đề xuất thanh lý ${item.code}: ${reason}`,
      afterData: updated,
    });
  });
  refresh();

  await setFlashMessage("success", "Đã từ chối đề xuất thanh lý", item.code);
}

/** Người tạo phiếu (hoặc Quản lý Xưởng / Admin) hủy đề xuất khi còn chờ duyệt: phiếu đóng, máy về Chờ kiểm tra. */
export async function cancelDisposalAction(formData: FormData) {
  const disposalId = String(formData.get("disposalId") || "");
  const auth = await requireUser();
  const [item] = await db.select().from(disposals).where(eq(disposals.id, disposalId)).limit(1);
  if (!item) throw new Error("Không tìm thấy phiếu.");
  if (item.proposedBy !== auth.userId && !auth.isWorkshopAdmin) throw new Error("Chỉ người tạo phiếu hoặc Quản lý Xưởng mới hủy được phiếu này.");
  if (auth.isReadOnlyViewer) throw new Error("Tài khoản chỉ xem không được hủy phiếu.");
  if (!(AWAITING_WS as readonly string[]).includes(item.status)) throw new Error("Phiếu đã qua bước duyệt, không hủy được.");
  await db.transaction(async (tx) => {
    await lockEquipment(tx, item.equipmentId);
    const [updated] = await tx.update(disposals).set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(disposals.id, item.id), inArray(disposals.status, [...AWAITING_WS]))).returning();
    if (!updated) throw new Error("Phiếu đã được xử lý.");
    await tx.update(equipment).set({ status: "wait_inspection", updatedAt: new Date() }).where(and(eq(equipment.id, item.equipmentId), eq(equipment.status, "wait_disposal")));
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: item.ownerGroupId,
      action: "disposal.cancel",
      entityType: "disposal",
      entityId: item.id,
      description: `Hủy đề xuất thanh lý ${item.code}`,
      afterData: updated,
    });
  });
  refresh();

  await setFlashMessage("success", "Đã hủy phiếu thanh lý", item.code);
}

/** Quản lý Xưởng / Admin xác nhận máy đã được nhóm mang tới Kho thanh lý (bước cuối). */
export async function receiveDisposalWarehouseAction(formData: FormData) {
  const disposalId = String(formData.get("disposalId") || "");
  const auth = await requireWsManager();
  const [warehouse] = await db.select().from(groups).where(eq(groups.code, "KHO_TL")).limit(1);
  if (!warehouse) throw new Error("Chưa có nhóm hệ thống KHO_TL.");
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
      status: "pending_ws",
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
  await setFlashMessage("success", "Đã tạo phiếu thành công", "Đề xuất thanh lý CCDC đã gửi Quản lý Xưởng duyệt");
}

export async function approveToolDisposalByWsAction(formData: FormData) {
  const disposalId = String(formData.get("disposalId") || "");
  const auth = await requireWsManager();
  const [item] = await db.select().from(toolDisposals).where(eq(toolDisposals.id, disposalId)).limit(1);
  if (!item || !(AWAITING_WS as readonly string[]).includes(item.status)) throw new Error("Phiếu chưa sẵn sàng để duyệt.");

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
    }).where(and(eq(toolDisposals.id, item.id), inArray(toolDisposals.status, [...AWAITING_WS]))).returning();
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

export async function rejectToolDisposalAction(formData: FormData) {
  const disposalId = String(formData.get("disposalId") || "");
  const reason = String(formData.get("rejectionReason") || "").trim();
  const auth = await requireWsManager();
  if (!reason) throw new Error("Vui lòng nhập lý do từ chối.");
  const [item] = await db.select().from(toolDisposals).where(eq(toolDisposals.id, disposalId)).limit(1);
  if (!item || !(AWAITING_WS as readonly string[]).includes(item.status)) throw new Error("Phiếu chưa ở bước chờ duyệt.");
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(toolDisposals).set({ status: "rejected", rejectionReason: reason, updatedAt: new Date() })
      .where(and(eq(toolDisposals.id, item.id), inArray(toolDisposals.status, [...AWAITING_WS]))).returning();
    if (!updated) throw new Error("Phiếu đã được xử lý.");
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: item.ownerGroupId,
      action: "tool_disposal.reject",
      entityType: "tool_disposal",
      entityId: item.id,
      description: `Từ chối đề xuất thanh lý CCDC ${item.code}: ${reason}`,
      afterData: updated,
    });
  });
  refresh();
  await setFlashMessage("success", "Đã từ chối đề xuất thanh lý CCDC", item.code);
}

export async function cancelToolDisposalAction(formData: FormData) {
  const disposalId = String(formData.get("disposalId") || "");
  const auth = await requireUser();
  const [item] = await db.select().from(toolDisposals).where(eq(toolDisposals.id, disposalId)).limit(1);
  if (!item) throw new Error("Không tìm thấy phiếu thanh lý CCDC.");
  if (item.proposedBy !== auth.userId && !auth.isWorkshopAdmin) throw new Error("Chỉ người tạo phiếu hoặc Quản lý Xưởng mới hủy được phiếu này.");
  if (auth.isReadOnlyViewer) throw new Error("Tài khoản chỉ xem không được hủy phiếu.");
  if (!(AWAITING_WS as readonly string[]).includes(item.status)) throw new Error("Phiếu đã qua bước duyệt, không hủy được.");
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(toolDisposals).set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(toolDisposals.id, item.id), inArray(toolDisposals.status, [...AWAITING_WS]))).returning();
    if (!updated) throw new Error("Phiếu đã được xử lý.");
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: item.ownerGroupId,
      action: "tool_disposal.cancel",
      entityType: "tool_disposal",
      entityId: item.id,
      description: `Hủy đề xuất thanh lý CCDC ${item.code}`,
      afterData: updated,
    });
  });
  refresh();
  await setFlashMessage("success", "Đã hủy phiếu thanh lý CCDC", item.code);
}
