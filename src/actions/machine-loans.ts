"use server";

import { setFlashMessage } from "@/lib/auth/session";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { equipment, groups, machineLoans } from "@/lib/db/schema";
import { requireGroupPermission } from "@/lib/auth/guards";
import { assertEquipmentHasNoOtherOpenWorkflow, lockEquipment, nextWorkflowCode } from "@/lib/workflows";
import { writeAudit } from "@/lib/audit";

const refresh = () => {
  revalidatePath("/machine-loans");
  revalidatePath("/equipment");
  revalidatePath("/my-equipment");
  revalidatePath("/dashboard");
};

/**
 * Mọi thành viên đang hoạt động của nhóm mượn, kể cả quyền viewer, đều được
 * lập đề nghị. Kỹ sư giám sát hoặc Đốc công của nhóm đang quản lý máy đều có quyền duyệt.
 */
export async function createMachineLoanAction(formData: FormData) {
  const equipmentId = String(formData.get("equipmentId") || "");
  const borrowerGroupId = String(formData.get("borrowerGroupId") || "");
  const purpose = String(formData.get("purpose") || "").trim();
  const workLocation = String(formData.get("workLocation") || "").trim();
  const receiverName = String(formData.get("receiverName") || "").trim();
  const expectedReturnDate = String(formData.get("expectedReturnDate") || "");

  if (!equipmentId || !borrowerGroupId || !purpose || !expectedReturnDate) {
    throw new Error("Vui lòng nhập đủ thông tin mượn máy.");
  }

  const auth = await requireGroupPermission(borrowerGroupId, "viewer");
  const [borrowerGroup] = await db.select().from(groups).where(eq(groups.id, borrowerGroupId)).limit(1);
  if (!borrowerGroup || borrowerGroup.isSystem || !borrowerGroup.isActive) {
    throw new Error("Nhóm mượn không hợp lệ.");
  }

  await db.transaction(async (tx) => {
    const item = await lockEquipment(tx, equipmentId);
    if (item.record_status !== "active") {
      throw new Error("Dụng cụ chưa hoàn thành hồ sơ nên chưa thể thực hiện nghiệp vụ.");
    }
    if (item.owner_group_id === borrowerGroupId) {
      throw new Error("Không cần lập phiếu mượn cho máy thuộc chính nhóm.");
    }
    if (item.status !== "in_use_owner" || item.condition !== "good") {
      throw new Error("Máy hiện không còn ở trạng thái Sẵn sàng/Tốt để cho mượn. Vui lòng tải lại và chọn máy khác.");
    }

    await assertEquipmentHasNoOtherOpenWorkflow(tx, equipmentId);
    const code = await nextWorkflowCode(tx, "PM");
    const [created] = await tx.insert(machineLoans).values({
      code,
      equipmentId,
      ownerGroupId: item.owner_group_id,
      borrowerGroupId,
      requestedBy: auth.userId,
      purpose,
      workLocation: workLocation || null,
      receiverName: receiverName || null,
      expectedReturnDate,
      status: "pending_owner",
    }).returning();

    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: borrowerGroupId,
      action: "machine_loan.create",
      entityType: "machine_loan",
      entityId: created.id,
      description: `Tạo đề nghị mượn máy ${item.code}`,
      afterData: created,
    });
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: borrowerGroupId,
      action: "equipment.loan_requested",
      entityType: "equipment",
      entityId: equipmentId,
      description: `Tạo đề nghị mượn ${item.code} theo phiếu ${created.code}`,
      afterData: { loanId: created.id, loanCode: created.code, borrowerGroupId },
    });
  });

  refresh();

  await setFlashMessage("success", 'Đã gửi đề nghị mượn');
}

/**
 * Kỹ sư giám sát hoặc Đốc công nhóm cho mượn duyệt.
 * Theo quy trình rút gọn: Duyệt = đã bàn giao + phía mượn được xem là đã nhận.
 * Phiếu chuyển thẳng sang Đang mượn, không còn bước bàn giao/nhận riêng.
 */
export async function approveMachineLoanAction(formData: FormData) {
  const loanId = String(formData.get("loanId") || "");
  const handoverCondition = String(formData.get("handoverCondition") || "").trim();
  const [loan] = await db.select().from(machineLoans).where(eq(machineLoans.id, loanId)).limit(1);
  if (!loan) throw new Error("Không tìm thấy phiếu mượn.");

  const auth = await requireGroupPermission(loan.ownerGroupId, "operator");
  if (loan.requestedBy === auth.userId) {
    throw new Error("Người tạo phiếu không được tự duyệt phiếu.");
  }

  await db.transaction(async (tx) => {
    const item = await lockEquipment(tx, loan.equipmentId);
    await assertEquipmentHasNoOtherOpenWorkflow(tx, loan.equipmentId, { machineLoanId: loan.id });
    if (item.status !== "in_use_owner" || item.condition !== "good") {
      throw new Error("Máy không còn ở trạng thái Sẵn sàng/Tốt để bàn giao.");
    }

    const now = new Date();
    const [updated] = await tx.update(machineLoans).set({
      status: "on_loan",
      approvedBy: auth.userId,
      approvedAt: now,
      handedOverBy: auth.userId,
      handedOverAt: now,
      receivedBy: loan.requestedBy,
      receivedAt: now,
      handoverCondition: handoverCondition || null,
      updatedAt: now,
    }).where(and(eq(machineLoans.id, loan.id), eq(machineLoans.status, "pending_owner"))).returning();

    if (!updated) throw new Error("Phiếu đã được người khác xử lý. Vui lòng tải lại.");

    await tx.update(equipment).set({
      status: "on_loan",
      currentGroupId: loan.borrowerGroupId,
      currentHolderId: loan.requestedBy,
      updatedAt: now,
    }).where(eq(equipment.id, loan.equipmentId));

    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: loan.ownerGroupId,
      action: "machine_loan.approve_and_handover",
      entityType: "machine_loan",
      entityId: loan.id,
      description: `Duyệt và bàn giao máy theo phiếu ${loan.code}; phiếu chuyển sang Đang mượn`,
      beforeData: loan,
      afterData: updated,
    });
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: loan.ownerGroupId,
      action: "equipment.loan_started",
      entityType: "equipment",
      entityId: loan.equipmentId,
      description: `Máy ${item.code} được bàn giao cho nhóm mượn theo phiếu ${loan.code}`,
      afterData: { loanId: loan.id, loanCode: loan.code, ownerGroupId: loan.ownerGroupId, borrowerGroupId: loan.borrowerGroupId },
    });
  });

  refresh();
  await setFlashMessage("success", "Đã duyệt và bàn giao CCDC");
}

/** Từ chối đề nghị trước khi máy được bàn giao. */
export async function rejectMachineLoanAction(formData: FormData) {
  const loanId = String(formData.get("loanId") || "");
  const rejectionReason = String(formData.get("rejectionReason") || "").trim();
  const [loan] = await db.select().from(machineLoans).where(eq(machineLoans.id, loanId)).limit(1);
  if (!loan) throw new Error("Không tìm thấy phiếu mượn.");

  const auth = await requireGroupPermission(loan.ownerGroupId, "operator");
  if (loan.requestedBy === auth.userId) throw new Error("Người tạo phiếu không được tự xử lý phiếu.");

  await db.transaction(async (tx) => {
    const [updated] = await tx.update(machineLoans).set({
      status: "rejected",
      rejectionReason: rejectionReason || "Nhóm quản lý không đồng ý cho mượn",
      updatedAt: new Date(),
    }).where(and(eq(machineLoans.id, loan.id), eq(machineLoans.status, "pending_owner"))).returning();
    if (!updated) throw new Error("Phiếu đã được người khác xử lý. Vui lòng tải lại.");

    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: loan.ownerGroupId,
      action: "machine_loan.reject",
      entityType: "machine_loan",
      entityId: loan.id,
      description: `Từ chối đề nghị mượn ${loan.code}`,
      beforeData: loan,
      afterData: updated,
      reason: rejectionReason || null,
    });
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: loan.ownerGroupId,
      action: "equipment.loan_rejected",
      entityType: "equipment",
      entityId: loan.equipmentId,
      description: `Đề nghị mượn ${loan.code} bị từ chối`,
      reason: rejectionReason || null,
    });
  });

  refresh();
  await setFlashMessage("success", "Đã từ chối đề nghị mượn");
}

/** Mọi thành viên của nhóm mượn được báo trả. */
export async function requestMachineReturnAction(formData: FormData) {
  const loanId = String(formData.get("loanId") || "");
  const [loan] = await db.select().from(machineLoans).where(eq(machineLoans.id, loanId)).limit(1);
  if (!loan) throw new Error("Không tìm thấy phiếu.");

  const auth = await requireGroupPermission(loan.borrowerGroupId, "viewer");

  await db.transaction(async (tx) => {
    await lockEquipment(tx, loan.equipmentId);
    await assertEquipmentHasNoOtherOpenWorkflow(tx, loan.equipmentId, { machineLoanId: loan.id });

    const [updated] = await tx.update(machineLoans).set({
      status: "return_requested",
      returnRequestedBy: auth.userId,
      returnRequestedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(machineLoans.id, loan.id), eq(machineLoans.status, "on_loan"))).returning();

    if (!updated) throw new Error("Phiếu không ở trạng thái đang mượn.");

    await tx.update(equipment)
      .set({ status: "return_requested", updatedAt: new Date() })
      .where(eq(equipment.id, loan.equipmentId));

    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: loan.borrowerGroupId,
      action: "machine_loan.return_request",
      entityType: "machine_loan",
      entityId: loan.id,
      description: `Nhóm mượn báo trả máy theo phiếu ${loan.code}`,
      afterData: updated,
    });
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: loan.borrowerGroupId,
      action: "equipment.return_requested",
      entityType: "equipment",
      entityId: loan.equipmentId,
      description: `Nhóm mượn gửi trả máy theo phiếu ${loan.code}`,
      afterData: { loanId: loan.id, loanCode: loan.code },
    });
  });

  refresh();

  await setFlashMessage("success", 'Đã gửi yêu cầu trả CCDC');
}

/**
 * Bước nhận lại không phải là phê duyệt: bất kỳ nhân viên đang có quyền trong
 * nhóm cho mượn đều được xác nhận thực nhận và tình trạng máy.
 */
export async function confirmMachineReturnAction(formData: FormData) {
  const loanId = String(formData.get("loanId") || "");
  const returnCondition = String(formData.get("returnCondition") || "").trim();
  type EquipmentCondition = typeof equipment.$inferSelect["condition"];
  const condition = String(formData.get("condition") || "good") as EquipmentCondition;
  const validConditions: EquipmentCondition[] = ["good", "limited", "minor_damage", "major_damage", "awaiting_assessment", "irreparable", "unknown"];
  if (!validConditions.includes(condition)) throw new Error("Tình trạng nhận lại không hợp lệ.");

  const [loan] = await db.select().from(machineLoans).where(eq(machineLoans.id, loanId)).limit(1);
  if (!loan) throw new Error("Không tìm thấy phiếu.");

  const auth = await requireGroupPermission(loan.ownerGroupId, "viewer");

  await db.transaction(async (tx) => {
    await lockEquipment(tx, loan.equipmentId);
    await assertEquipmentHasNoOtherOpenWorkflow(tx, loan.equipmentId, { machineLoanId: loan.id });

    const [updated] = await tx.update(machineLoans).set({
      status: "completed",
      closedBy: auth.userId,
      closedAt: new Date(),
      returnCondition: returnCondition || null,
      updatedAt: new Date(),
    }).where(and(eq(machineLoans.id, loan.id), eq(machineLoans.status, "return_requested"))).returning();

    if (!updated) throw new Error("Phiếu chưa ở bước xác nhận trả.");

    await tx.update(equipment).set({
      status: condition === "good" || condition === "limited" ? "in_use_owner" : "wait_inspection",
      condition,
      currentGroupId: loan.ownerGroupId,
      currentHolderId: null,
      updatedAt: new Date(),
    }).where(eq(equipment.id, loan.equipmentId));

    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: loan.ownerGroupId,
      action: "machine_loan.complete",
      entityType: "machine_loan",
      entityId: loan.id,
      description: `Thành viên nhóm cho mượn xác nhận nhận lại máy theo phiếu ${loan.code}`,
      afterData: { ...updated, equipmentCondition: condition },
    });
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: loan.ownerGroupId,
      action: "equipment.loan_completed",
      entityType: "equipment",
      entityId: loan.equipmentId,
      description: `Hoàn tất mượn/trả theo phiếu ${loan.code}`,
      afterData: { loanId: loan.id, loanCode: loan.code, condition, returnCondition: returnCondition || null },
    });
  });

  refresh();

  await setFlashMessage("success", 'Đã xác nhận nhận lại CCDC');
}
