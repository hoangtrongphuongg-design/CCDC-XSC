"use server";

import { setFlashMessage } from "@/lib/auth/session";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { equipment, groups, machineLoans, transfers } from "@/lib/db/schema";
import { requireGroupPermission, requireWsManager } from "@/lib/auth/guards";
import { assertEquipmentHasNoOtherOpenWorkflow, lockEquipment, nextWorkflowCode } from "@/lib/workflows";
import { writeAudit } from "@/lib/audit";

function refresh() {
  revalidatePath("/transfers");
  revalidatePath("/equipment");
  revalidatePath("/my-equipment");
  revalidatePath("/dashboard");
}

export async function createTransferAction(formData: FormData) {
  const equipmentId = String(formData.get("equipmentId") || "");
  const actingGroupId = String(formData.get("actingGroupId") || "");
  const targetGroupId = String(formData.get("targetGroupId") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!equipmentId || !actingGroupId || !targetGroupId || !reason) throw new Error("Thiếu thông tin điều chuyển.");
  const auth = await requireGroupPermission(actingGroupId, "manager");
  const [targetGroup] = await db.select().from(groups).where(eq(groups.id, targetGroupId)).limit(1);
  if (!targetGroup || targetGroup.isSystem || !targetGroup.isActive) throw new Error("Nhóm nhận không hợp lệ.");

  await db.transaction(async (tx) => {
    const item = await lockEquipment(tx, equipmentId);
    if (item.record_status !== "active") throw new Error("Dụng cụ chưa hoàn thành hồ sơ nên chưa thể thực hiện nghiệp vụ.");
    const sourceGroupId = item.owner_group_id;
    if (actingGroupId !== sourceGroupId) {
      throw new Error("Bạn chỉ được đề xuất điều chuyển máy thuộc nhóm mình đang quản lý.");
    }
    if (sourceGroupId === targetGroupId) throw new Error("Nhóm nhận phải khác nhóm quản lý hiện tại.");
    if (item.status !== "in_use_owner") throw new Error("Máy hiện không sẵn sàng để điều chuyển.");
    await assertEquipmentHasNoOtherOpenWorkflow(tx, equipmentId);

    const linkedLoanId: string | null = null;
    const code = await nextWorkflowCode(tx, "DC");
    const initialStatus = "pending_target";
    const [created] = await tx.insert(transfers).values({
      code,
      equipmentId,
      sourceGroupId,
      targetGroupId,
      proposedByGroupId: actingGroupId,
      proposedBy: auth.userId,
      reason,
      status: initialStatus,
      linkedLoanId,
    }).returning();
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: actingGroupId,
      action: "transfer.create",
      entityType: "transfer",
      entityId: created.id,
      description: `Tạo đề xuất điều chuyển ${code}`,
      afterData: created,
    });
  });
  refresh();

  await setFlashMessage("success", 'Đã gửi đề nghị điều chuyển');
}

export async function acceptTransferCounterpartAction(formData: FormData) {
  const transferId = String(formData.get("transferId") || "");
  const [transfer] = await db.select().from(transfers).where(eq(transfers.id, transferId)).limit(1);
  if (!transfer) throw new Error("Không tìm thấy phiếu điều chuyển.");
  if (transfer.status !== "pending_target" && transfer.status !== "pending_source") throw new Error("Phiếu không ở bước chờ nhóm đối ứng.");
  const requiredGroup = transfer.status === "pending_target" ? transfer.targetGroupId : transfer.sourceGroupId;
  const auth = await requireGroupPermission(requiredGroup, "manager");
  if (transfer.proposedBy === auth.userId) throw new Error("Người tạo phiếu không được tự xác nhận phía đối ứng.");
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(transfers).set({
      status: "pending_ws",
      counterpartAcceptedBy: auth.userId,
      counterpartAcceptedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(transfers.id, transferId), eq(transfers.status, transfer.status))).returning();
    if (!updated) throw new Error("Phiếu đã được người khác xử lý.");
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: requiredGroup,
      action: "transfer.counterpart_accept",
      entityType: "transfer",
      entityId: transfer.id,
      description: `Nhóm đối ứng đồng ý phiếu ${transfer.code}`,
      afterData: updated,
    });
  });
  refresh();

  await setFlashMessage("success", 'Đã xác nhận điều chuyển');
}

export async function approveTransferByWsAction(formData: FormData) {
  const transferId = String(formData.get("transferId") || "");
  const auth = await requireWsManager();
  const [transfer] = await db.select().from(transfers).where(eq(transfers.id, transferId)).limit(1);
  if (!transfer || transfer.status !== "pending_ws") throw new Error("Phiếu chưa sẵn sàng để WS duyệt.");

  await db.transaction(async (tx) => {
    await lockEquipment(tx, transfer.equipmentId);
    await assertEquipmentHasNoOtherOpenWorkflow(tx, transfer.equipmentId, {
      transferId: transfer.id,
      machineLoanId: transfer.linkedLoanId || undefined,
    });
    const [updated] = await tx.update(transfers).set({
      status: "wait_handover",
      wsApprovedBy: auth.userId,
      wsApprovedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(transfers.id, transfer.id), eq(transfers.status, "pending_ws"))).returning();
    if (!updated) throw new Error("Phiếu đã được xử lý.");
    await tx.update(equipment).set({ status: "wait_handover", updatedAt: new Date() }).where(eq(equipment.id, transfer.equipmentId));
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      action: "transfer.ws_approve",
      entityType: "transfer",
      entityId: transfer.id,
      description: `WS duyệt điều chuyển ${transfer.code}`,
      afterData: updated,
    });
  });
  refresh();

  await setFlashMessage("success", 'Đã duyệt điều chuyển');
}

export async function confirmTransferHandoverAction(formData: FormData) {
  const transferId = String(formData.get("transferId") || "");
  const handoverCondition = String(formData.get("handoverCondition") || "").trim();
  const [transfer] = await db.select().from(transfers).where(eq(transfers.id, transferId)).limit(1);
  if (!transfer) throw new Error("Không tìm thấy phiếu.");
  const auth = await requireGroupPermission(transfer.sourceGroupId, "manager");
  if (transfer.status !== "wait_handover") throw new Error("Phiếu chưa ở bước bàn giao.");
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(transfers).set({ handedOverBy: auth.userId, handedOverAt: new Date(), handoverCondition: handoverCondition || null, updatedAt: new Date() })
      .where(and(eq(transfers.id, transfer.id), eq(transfers.status, "wait_handover"))).returning();
    if (!updated) throw new Error("Phiếu đã được người khác xử lý.");
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: transfer.sourceGroupId,
      action: "transfer.handover",
      entityType: "transfer",
      entityId: transfer.id,
      description: `Xác nhận bàn giao điều chuyển ${transfer.code}`,
      afterData: updated,
    });
  });
  refresh();

  await setFlashMessage("success", 'Đã xác nhận bàn giao điều chuyển');
}

export async function confirmTransferReceiptAction(formData: FormData) {
  const transferId = String(formData.get("transferId") || "");
  const [transfer] = await db.select().from(transfers).where(eq(transfers.id, transferId)).limit(1);
  if (!transfer) throw new Error("Không tìm thấy phiếu.");
  const auth = await requireGroupPermission(transfer.targetGroupId, "manager");
  if (!transfer.handedOverAt || transfer.status !== "wait_handover") throw new Error("Nhóm giao chưa xác nhận bàn giao.");

  await db.transaction(async (tx) => {
    await lockEquipment(tx, transfer.equipmentId);
    const [updated] = await tx.update(transfers).set({ status: "completed", receivedBy: auth.userId, receivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(transfers.id, transfer.id), eq(transfers.status, "wait_handover"))).returning();
    if (!updated) throw new Error("Phiếu đã được xử lý.");
    await tx.update(equipment).set({
      ownerGroupId: transfer.targetGroupId,
      currentGroupId: transfer.targetGroupId,
      currentHolderId: auth.userId,
      status: "in_use_owner",
      updatedAt: new Date(),
    }).where(eq(equipment.id, transfer.equipmentId));
    if (transfer.linkedLoanId) {
      await tx.update(machineLoans).set({ status: "completed", closedBy: auth.userId, closedAt: new Date(), incidentNotes: "Kết thúc do chuyển thành điều chuyển cố định.", updatedAt: new Date() })
        .where(eq(machineLoans.id, transfer.linkedLoanId));
    }
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: transfer.targetGroupId,
      action: "transfer.complete",
      entityType: "transfer",
      entityId: transfer.id,
      description: `Hoàn tất điều chuyển ${transfer.code}; mã máy giữ nguyên`,
      afterData: updated,
    });
  });
  refresh();

  await setFlashMessage("success", 'Đã xác nhận nhận điều chuyển');
}
