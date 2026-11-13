"use server";

import { setFlashMessage } from "@/lib/auth/session";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { equipment, lossReports, machineLoans, toolCatalog } from "@/lib/db/schema";
import { hasGroupPermission, requireUser, requireWsManager } from "@/lib/auth/guards";
import { assertEquipmentHasNoOtherOpenWorkflow, lockEquipment, nextWorkflowCode } from "@/lib/workflows";
import { writeAudit } from "@/lib/audit";
import { LOSS_LOAN_STATUSES, canReportLoss, parseLossCircumstances, parseLossQuantity, remainingAfterLoss } from "@/lib/loss-rule";
import { isUuid } from "@/lib/machine-profile";

/**
 * Báo mất (máy có mã / CCDC theo số lượng): người của nhóm quản lý (hoặc nhóm đang mượn giữ máy) tạo phiếu →
 * Quản lý Xưởng/Admin duyệt (máy → "Đã mất", phiếu mượn đang mở tự đóng; CCDC → trừ tồn) hoặc từ chối;
 * người tạo (hoặc Quản lý Xưởng) hủy được khi còn chờ. Quản lý Xưởng/Admin khôi phục máy khi tìm lại được.
 */
function refresh() {
  for (const path of ["/losses", "/equipment", "/my-equipment", "/dashboard", "/machine-loans", "/inventory", "/reports"]) revalidatePath(path);
}

function optionalSession(raw: unknown): string | null {
  const value = String(raw || "");
  return isUuid(value) ? value : null;
}

export async function createLossReportAction(formData: FormData) {
  const equipmentId = String(formData.get("equipmentId") || "");
  if (!isUuid(equipmentId)) throw new Error("Vui lòng chọn máy báo mất.");
  const circumstances = parseLossCircumstances(formData.get("circumstances"));
  if (!circumstances.ok) throw new Error(circumstances.message);
  const sessionId = optionalSession(formData.get("sourceSessionId"));
  const auth = await requireUser();
  if (auth.isReadOnlyViewer) throw new Error("Tài khoản chỉ xem không được báo mất.");

  const created = await db.transaction(async (tx) => {
    const item = await lockEquipment(tx, equipmentId);
    if (item.record_status !== "active") throw new Error("Dụng cụ chưa hoàn thành hồ sơ nên chưa thể báo mất.");
    if (!canReportLoss(item.status)) throw new Error("Máy đang trong quy trình khác hoặc đã xử lý nên chưa báo mất được. Hãy hoàn tất/hủy phiếu hiện tại trước.");

    const [loan] = await tx.select().from(machineLoans).where(and(eq(machineLoans.equipmentId, equipmentId), inArray(machineLoans.status, [...LOSS_LOAN_STATUSES]))).limit(1);
    const allowed = auth.isWorkshopAdmin || hasGroupPermission(auth, item.owner_group_id, "operator") || (loan ? hasGroupPermission(auth, loan.borrowerGroupId, "operator") : false);
    if (!allowed) throw new Error("Chỉ Kỹ sư giám sát trở lên của nhóm quản lý (hoặc nhóm đang mượn máy) mới báo mất được.");
    await assertEquipmentHasNoOtherOpenWorkflow(tx, equipmentId, loan ? { machineLoanId: loan.id } : undefined);

    const code = await nextWorkflowCode(tx, "BM");
    const [row] = await tx.insert(lossReports).values({
      code,
      equipmentId,
      ownerGroupId: item.owner_group_id,
      reportedBy: auth.userId,
      circumstances: circumstances.value,
      sourceInventorySessionId: sessionId,
      status: "pending_ws",
    }).returning();
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: item.owner_group_id,
      action: "loss.create",
      entityType: "loss_report",
      entityId: row.id,
      description: `Báo mất máy ${item.code}: ${circumstances.value}`,
      afterData: row,
    });
    return row;
  });
  refresh();
  await setFlashMessage("success", "Đã tạo phiếu thành công", `Phiếu báo mất ${created.code} đã gửi Quản lý Xưởng duyệt`);
}

export async function createToolLossReportAction(formData: FormData) {
  const toolId = String(formData.get("toolId") || "");
  if (!isUuid(toolId)) throw new Error("Vui lòng chọn CCDC báo mất.");
  const circumstances = parseLossCircumstances(formData.get("circumstances"));
  if (!circumstances.ok) throw new Error(circumstances.message);
  const sessionId = optionalSession(formData.get("sourceSessionId"));
  const auth = await requireUser();
  if (auth.isReadOnlyViewer) throw new Error("Tài khoản chỉ xem không được báo mất.");

  const created = await db.transaction(async (tx) => {
    const [tool] = await tx.select().from(toolCatalog).where(eq(toolCatalog.id, toolId)).for("update");
    if (!tool || !tool.isActive || tool.recordStatus !== "active") throw new Error("Không tìm thấy CCDC theo số lượng.");
    if (!auth.isWorkshopAdmin && !hasGroupPermission(auth, tool.groupId, "operator")) throw new Error("Chỉ Kỹ sư giám sát trở lên của nhóm quản lý mới báo mất CCDC được.");
    const qty = parseLossQuantity(formData.get("quantity"), Number(tool.quantityOnHand));
    if (!qty.ok) throw new Error(qty.message);

    const code = await nextWorkflowCode(tx, "BM");
    const [row] = await tx.insert(lossReports).values({
      code,
      toolId,
      quantity: String(qty.value),
      ownerGroupId: tool.groupId,
      reportedBy: auth.userId,
      circumstances: circumstances.value,
      sourceInventorySessionId: sessionId,
      status: "pending_ws",
    }).returning();
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: tool.groupId,
      action: "loss.create",
      entityType: "loss_report",
      entityId: row.id,
      description: `Báo mất ${qty.value} ${tool.unit} ${tool.name}: ${circumstances.value}`,
      afterData: row,
    });
    return row;
  });
  refresh();
  await setFlashMessage("success", "Đã tạo phiếu thành công", `Phiếu báo mất ${created.code} đã gửi Quản lý Xưởng duyệt`);
}

/** Quản lý Xưởng / Admin duyệt: máy → Đã mất (đóng phiếu mượn đang mở); CCDC → trừ tồn. */
export async function approveLossAction(formData: FormData) {
  const lossId = String(formData.get("lossId") || "");
  if (!isUuid(lossId)) throw new Error("Dữ liệu không hợp lệ.");
  const auth = await requireWsManager();

  await db.transaction(async (tx) => {
    const [report] = await tx.select().from(lossReports).where(eq(lossReports.id, lossId)).for("update");
    if (!report || report.status !== "pending_ws") throw new Error("Phiếu đã được xử lý hoặc không còn chờ duyệt.");

    if (report.equipmentId) {
      const item = await lockEquipment(tx, report.equipmentId);
      if (!canReportLoss(item.status)) throw new Error("Máy đã đổi trạng thái (đang trong quy trình khác). Hãy từ chối phiếu này và báo mất lại sau.");
      const [loan] = await tx.select().from(machineLoans).where(and(eq(machineLoans.equipmentId, item.id), inArray(machineLoans.status, [...LOSS_LOAN_STATUSES]))).limit(1);
      await assertEquipmentHasNoOtherOpenWorkflow(tx, item.id, { lossId: report.id, ...(loan ? { machineLoanId: loan.id } : {}) });
      if (loan) {
        const [closed] = await tx.update(machineLoans).set({
          status: "completed",
          closedBy: auth.userId,
          closedAt: new Date(),
          incidentNotes: `Kết thúc do máy được báo mất (phiếu ${report.code}).`,
          updatedAt: new Date(),
        }).where(and(eq(machineLoans.id, loan.id), inArray(machineLoans.status, [...LOSS_LOAN_STATUSES]))).returning();
        if (closed) {
          await writeAudit(tx as never, {
            actorUserId: auth.userId,
            actorGroupId: closed.ownerGroupId,
            action: "machine_loan.complete",
            entityType: "machine_loan",
            entityId: closed.id,
            description: `Đóng phiếu mượn ${closed.code} vì máy được báo mất (${report.code})`,
            afterData: closed,
          });
        }
      }
      await tx.update(equipment).set({ status: "lost", currentGroupId: item.owner_group_id, currentHolderId: null, updatedAt: new Date() }).where(eq(equipment.id, item.id));
      await writeAudit(tx as never, {
        actorUserId: auth.userId,
        actorGroupId: item.owner_group_id,
        action: "loss.apply",
        entityType: "equipment",
        entityId: item.id,
        description: `Duyệt báo mất máy ${item.code} theo phiếu ${report.code}`,
        beforeData: { status: item.status },
        afterData: { status: "lost", lossCode: report.code },
      });
    } else if (report.toolId) {
      const [tool] = await tx.select().from(toolCatalog).where(eq(toolCatalog.id, report.toolId)).for("update");
      if (!tool) throw new Error("Không tìm thấy CCDC.");
      const current = Number(tool.quantityOnHand);
      const qty = Number(report.quantity);
      if (!(qty > 0) || qty > current + 1e-9) throw new Error("Số lượng tồn hiện tại không đủ để trừ phần báo mất. Hãy từ chối phiếu và báo lại đúng số lượng.");
      const remaining = remainingAfterLoss(current, qty);
      await tx.update(toolCatalog).set({ quantityOnHand: String(remaining), isActive: remaining > 0, updatedAt: new Date() }).where(eq(toolCatalog.id, tool.id));
      await writeAudit(tx as never, {
        actorUserId: auth.userId,
        actorGroupId: report.ownerGroupId,
        action: "loss.apply",
        entityType: "tool_catalog",
        entityId: tool.id,
        description: `Duyệt báo mất ${qty} ${tool.unit} ${tool.name} (${report.code}); còn ${remaining} ${tool.unit}`,
        beforeData: { quantityOnHand: current },
        afterData: { quantityOnHand: remaining, lossCode: report.code },
      });
    } else {
      throw new Error("Phiếu báo mất không hợp lệ.");
    }

    const [updated] = await tx.update(lossReports).set({ status: "completed", wsApprovedBy: auth.userId, wsApprovedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(lossReports.id, report.id), eq(lossReports.status, "pending_ws"))).returning();
    if (!updated) throw new Error("Phiếu đã được xử lý.");
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: report.ownerGroupId,
      action: "loss.approve",
      entityType: "loss_report",
      entityId: report.id,
      description: `Quản lý Xưởng duyệt báo mất ${report.code}`,
      afterData: updated,
    });
  });
  refresh();
  await setFlashMessage("success", "Đã duyệt báo mất");
}

export async function rejectLossAction(formData: FormData) {
  const lossId = String(formData.get("lossId") || "");
  const reason = String(formData.get("rejectionReason") || "").trim();
  if (!isUuid(lossId)) throw new Error("Dữ liệu không hợp lệ.");
  const auth = await requireWsManager();
  if (!reason) throw new Error("Vui lòng nhập lý do từ chối.");
  const [updated] = await db.update(lossReports).set({ status: "rejected", rejectionReason: reason, updatedAt: new Date() })
    .where(and(eq(lossReports.id, lossId), eq(lossReports.status, "pending_ws"))).returning();
  if (!updated) throw new Error("Phiếu đã được xử lý hoặc không còn chờ duyệt.");
  await writeAudit(db as never, {
    actorUserId: auth.userId,
    actorGroupId: updated.ownerGroupId,
    action: "loss.reject",
    entityType: "loss_report",
    entityId: updated.id,
    description: `Từ chối báo mất ${updated.code}: ${reason}`,
    afterData: updated,
  });
  refresh();
  await setFlashMessage("success", "Đã từ chối báo mất", updated.code);
}

export async function cancelLossAction(formData: FormData) {
  const lossId = String(formData.get("lossId") || "");
  if (!isUuid(lossId)) throw new Error("Dữ liệu không hợp lệ.");
  const auth = await requireUser();
  if (auth.isReadOnlyViewer) throw new Error("Tài khoản chỉ xem không được hủy phiếu.");
  const [report] = await db.select().from(lossReports).where(eq(lossReports.id, lossId)).limit(1);
  if (!report) throw new Error("Không tìm thấy phiếu.");
  if (report.reportedBy !== auth.userId && !auth.isWorkshopAdmin) throw new Error("Chỉ người tạo phiếu hoặc Quản lý Xưởng mới hủy được phiếu này.");
  const [updated] = await db.update(lossReports).set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(lossReports.id, report.id), eq(lossReports.status, "pending_ws"))).returning();
  if (!updated) throw new Error("Phiếu đã qua bước duyệt, không hủy được.");
  await writeAudit(db as never, {
    actorUserId: auth.userId,
    actorGroupId: updated.ownerGroupId,
    action: "loss.cancel",
    entityType: "loss_report",
    entityId: updated.id,
    description: `Hủy phiếu báo mất ${updated.code}`,
    afterData: updated,
  });
  refresh();
  await setFlashMessage("success", "Đã hủy phiếu báo mất", updated.code);
}

/** Máy đã mất nay tìm lại được: Quản lý Xưởng / Admin đưa về Chờ kiểm tra (bắt buộc lý do). */
export async function restoreLostEquipmentAction(formData: FormData) {
  const equipmentId = String(formData.get("equipmentId") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!isUuid(equipmentId)) throw new Error("Dữ liệu không hợp lệ.");
  const auth = await requireWsManager();
  if (reason.length < 5) throw new Error("Vui lòng ghi rõ máy được tìm thấy ở đâu / trong hoàn cảnh nào (ít nhất 5 ký tự).");
  await db.transaction(async (tx) => {
    const item = await lockEquipment(tx, equipmentId);
    if (item.status !== "lost") throw new Error("Máy không ở trạng thái Đã mất.");
    await tx.update(equipment).set({ status: "wait_inspection", updatedAt: new Date() }).where(eq(equipment.id, item.id));
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: item.owner_group_id,
      action: "equipment.restore_lost",
      entityType: "equipment",
      entityId: item.id,
      description: `Khôi phục máy ${item.code} đã tìm thấy: ${reason}`,
      beforeData: { status: "lost" },
      afterData: { status: "wait_inspection", reason },
    });
  });
  refresh();
  await setFlashMessage("success", "Đã khôi phục máy", "Máy về trạng thái Chờ kiểm tra");
}
