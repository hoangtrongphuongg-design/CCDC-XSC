"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { equipment, groups, machineLoans, repairs } from "@/lib/db/schema";
import { requireGroupPermission, requireWsManager } from "@/lib/auth/guards";
import { assertEquipmentHasNoOtherOpenWorkflow, lockEquipment, nextWorkflowCode } from "@/lib/workflows";
import { writeAudit } from "@/lib/audit";

function refresh() {
  revalidatePath("/repairs");
  revalidatePath("/equipment");
  revalidatePath("/dashboard");
}

export async function createRepairAction(formData: FormData) {
  const equipmentId = String(formData.get("equipmentId") || "");
  const reportingGroupId = String(formData.get("reportingGroupId") || "");
  const issueDescription = String(formData.get("issueDescription") || "").trim();
  if (!equipmentId || !reportingGroupId || !issueDescription) throw new Error("Thiếu thông tin báo hư.");
  const auth = await requireGroupPermission(reportingGroupId, "operator");
  const [reportingGroup] = await db.select().from(groups).where(eq(groups.id, reportingGroupId)).limit(1);
  if (!reportingGroup || reportingGroup.isSystem || !reportingGroup.isActive) throw new Error("Nhóm báo hư không hợp lệ.");

  await db.transaction(async (tx) => {
    const item = await lockEquipment(tx, equipmentId);
    if (item.record_status !== "active") throw new Error("Dụng cụ chưa hoàn thành hồ sơ nên chưa thể thực hiện nghiệp vụ.");
    const raw = item as unknown as { owner_group_id: string; current_group_id: string; status: string; code: string };
    if (reportingGroupId !== raw.owner_group_id && reportingGroupId !== raw.current_group_id) throw new Error("Nhóm này không đang quản lý hoặc sử dụng máy.");
    if (!["in_use_owner", "on_loan", "return_requested", "wait_inspection"].includes(raw.status)) throw new Error("Trạng thái máy hiện tại không cho phép tạo phiếu sửa chữa.");
    let sourceLoanId: string | null = null;
    if (raw.status === "on_loan" || raw.status === "return_requested") {
      const [loan] = await tx.select().from(machineLoans).where(and(eq(machineLoans.equipmentId, equipmentId), eq(machineLoans.status, raw.status === "on_loan" ? "on_loan" : "return_requested"))).limit(1);
      sourceLoanId = loan?.id || null;
      if (loan) await tx.update(machineLoans).set({ status: "incident", incidentNotes: issueDescription, updatedAt: new Date() }).where(eq(machineLoans.id, loan.id));
    }
    await assertEquipmentHasNoOtherOpenWorkflow(tx, equipmentId, sourceLoanId ? { machineLoanId: sourceLoanId } : undefined);
    const code = await nextWorkflowCode(tx, "SC");
    const [created] = await tx.insert(repairs).values({
      code,
      equipmentId,
      sourceLoanId,
      reportedByGroupId: reportingGroupId,
      reportedBy: auth.userId,
      issueDescription,
      status: "pending_acceptance",
    }).returning();
    await tx.update(equipment).set({ status: "wait_inspection", condition: "awaiting_assessment", updatedAt: new Date() }).where(eq(equipment.id, equipmentId));
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: reportingGroupId,
      action: "repair.create",
      entityType: "repair",
      entityId: created.id,
      description: `Báo sửa chữa máy ${raw.code}`,
      afterData: created,
    });
  });
  refresh();
}

export async function acceptRepairAction(formData: FormData) {
  const repairId = String(formData.get("repairId") || "");
  const auth = await requireWsManager();
  const [repair] = await db.select().from(repairs).where(eq(repairs.id, repairId)).limit(1);
  if (!repair) throw new Error("Không tìm thấy phiếu sửa chữa.");
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(repairs).set({ status: "repairing", repairType: "internal", receivedBy: auth.userId, receivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(repairs.id, repair.id), eq(repairs.status, "pending_acceptance"))).returning();
    if (!updated) throw new Error("Phiếu đã được xử lý.");
    await tx.update(equipment).set({ status: "repairing", updatedAt: new Date() }).where(eq(equipment.id, repair.equipmentId));
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      action: "repair.accept",
      entityType: "repair",
      entityId: repair.id,
      description: `WS tiếp nhận phiếu sửa ${repair.code}`,
      afterData: updated,
    });
  });
  refresh();
}

export async function completeRepairAction(formData: FormData) {
  const repairId = String(formData.get("repairId") || "");
  const workDescription = String(formData.get("workDescription") || "").trim();
  const resultNotes = String(formData.get("resultNotes") || "").trim();
  const cost = Number(formData.get("cost") || 0);
  const auth = await requireWsManager();
  const [repair] = await db.select().from(repairs).where(eq(repairs.id, repairId)).limit(1);
  if (!repair || repair.status !== "repairing") throw new Error("Phiếu chưa ở trạng thái đang sửa.");

  await db.transaction(async (tx) => {
    await tx.update(repairs).set({
      status: "wait_owner_confirm",
      repairType: repair.repairType || "internal",
      workDescription: workDescription || null,
      resultNotes: resultNotes || null,
      cost: String(Math.max(0, cost)),
      completedBy: auth.userId,
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(repairs.id, repair.id));
    await tx.update(equipment).set({ status: "wait_repair_confirm", condition: "good", updatedAt: new Date() }).where(eq(equipment.id, repair.equipmentId));
    await writeAudit(tx as never, { actorUserId: auth.userId, action: "repair.complete", entityType: "repair", entityId: repair.id, description: `Hoàn tất sửa chữa ${repair.code}`, afterData: { repairType: repair.repairType || "internal", workDescription, resultNotes, cost } });
  });
  refresh();
}

export async function sendExternalRepairAction(formData: FormData) {
  const repairId = String(formData.get("repairId") || "");
  const vendor = String(formData.get("vendor") || "").trim();
  const reason = String(formData.get("reason") || "").trim();
  if (!vendor || !reason) throw new Error("Cần nhập đơn vị sửa ngoài và lý do thuê ngoài.");
  const auth = await requireWsManager();
  const [repair] = await db.select().from(repairs).where(eq(repairs.id, repairId)).limit(1);
  if (!repair || repair.status !== "repairing") throw new Error("Phiếu chưa ở trạng thái đang sửa.");
  await db.transaction(async (tx) => {
    await tx.update(repairs).set({ repairType: "external", vendor, workDescription: reason, resultNotes: "Đã chuyển thuê ngoài sửa chữa", updatedAt: new Date() }).where(eq(repairs.id, repair.id));
    await writeAudit(tx as never, { actorUserId: auth.userId, action: "repair.external", entityType: "repair", entityId: repair.id, description: `Chuyển thuê ngoài sửa chữa ${repair.code} tại ${vendor}`, afterData: { repairType: "external", vendor, reason } });
  });
  refresh();
}

export async function markExternalIrreparableAction(formData: FormData) {
  const repairId = String(formData.get("repairId") || "");
  const resultNotes = String(formData.get("resultNotes") || "").trim();
  const cost = Number(formData.get("cost") || 0);
  const auth = await requireWsManager();
  const [repair] = await db.select().from(repairs).where(eq(repairs.id, repairId)).limit(1);
  if (!repair || repair.status !== "repairing" || repair.repairType !== "external") throw new Error("Phiếu chưa ở trạng thái thuê ngoài sửa chữa.");
  await db.transaction(async (tx) => {
    await tx.update(repairs).set({ status: "irreparable", resultNotes: resultNotes || "Đơn vị sửa ngoài kết luận không thể phục hồi", cost: String(Math.max(0, cost)), completedBy: auth.userId, completedAt: new Date(), updatedAt: new Date() }).where(eq(repairs.id, repair.id));
    await tx.update(equipment).set({ status: "wait_disposal", condition: "irreparable", updatedAt: new Date() }).where(eq(equipment.id, repair.equipmentId));
    await writeAudit(tx as never, { actorUserId: auth.userId, action: "repair.irreparable", entityType: "repair", entityId: repair.id, description: `Sửa ngoài kết luận không thể phục hồi ${repair.code}`, afterData: { resultNotes, cost } });
  });
  refresh();
}

export async function confirmRepairByOwnerAction(formData: FormData) {
  const repairId = String(formData.get("repairId") || "");
  const [repair] = await db.select().from(repairs).where(eq(repairs.id, repairId)).limit(1);
  if (!repair) throw new Error("Không tìm thấy phiếu.");
  const [item] = await db.select().from(equipment).where(eq(equipment.id, repair.equipmentId)).limit(1);
  if (!item) throw new Error("Không tìm thấy máy.");
  const auth = await requireGroupPermission(item.ownerGroupId, "manager");
  if (repair.status !== "wait_owner_confirm") throw new Error("Phiếu chưa chờ nhóm xác nhận.");

  await db.transaction(async (tx) => {
    await tx.update(repairs).set({ status: "completed", ownerConfirmedBy: auth.userId, ownerConfirmedAt: new Date(), updatedAt: new Date() }).where(eq(repairs.id, repair.id));
    await tx.update(equipment).set({ status: "in_use_owner", condition: "good", currentGroupId: item.ownerGroupId, currentHolderId: auth.userId, updatedAt: new Date() }).where(eq(equipment.id, item.id));
    if (repair.sourceLoanId) {
      await tx.update(machineLoans).set({ status: "completed", closedBy: auth.userId, closedAt: new Date(), incidentNotes: "Kết thúc sau sự cố và sửa chữa; máy trả về nhóm quản lý.", updatedAt: new Date() }).where(eq(machineLoans.id, repair.sourceLoanId));
    }
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: item.ownerGroupId,
      action: "repair.owner_confirm",
      entityType: "repair",
      entityId: repair.id,
      description: `Nhóm quản lý xác nhận nhận lại máy sau sửa ${repair.code}`,
      afterData: { status: "completed" },
    });
  });
  refresh();
}
