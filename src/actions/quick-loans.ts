"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { groups, quickLoans, toolCatalog } from "@/lib/db/schema";
import { requireGroupPermission } from "@/lib/auth/guards";
import { nextWorkflowCode } from "@/lib/workflows";
import { writeAudit } from "@/lib/audit";

function refresh() {
  revalidatePath("/quick-loans");
  revalidatePath("/my-equipment");
  revalidatePath("/dashboard");
}

/**
 * Thành viên nghiệp vụ của nhóm mượn lập đề nghị. Chưa trừ tồn kho tại bước này vì
 * Kỹ sư giám sát hoặc Đốc công nhóm cho mượn vẫn phải kiểm tra và duyệt.
 */
export async function createQuickLoanAction(formData: FormData) {
  const sourceGroupId = String(formData.get("sourceGroupId") || "");
  const borrowerGroupId = String(formData.get("borrowerGroupId") || "");
  const toolId = String(formData.get("toolId") || "") || null;
  const itemName = String(formData.get("itemName") || "").trim();
  const specification = String(formData.get("specification") || "").trim();
  const unit = String(formData.get("unit") || "cái").trim();
  const quantityBorrowed = Number(formData.get("quantityBorrowed") || 0);
  const expectedReturnAtRaw = String(formData.get("expectedReturnAt") || "");
  const borrowerNote = String(formData.get("borrowerNote") || "").trim();

  if (!sourceGroupId || !borrowerGroupId || (!toolId && !itemName) || quantityBorrowed <= 0) {
    throw new Error("Thông tin mượn nhanh chưa đầy đủ.");
  }
  if (sourceGroupId === borrowerGroupId) {
    throw new Error("Nhóm mượn phải khác nhóm cho.");
  }

  const auth = await requireGroupPermission(borrowerGroupId, "viewer");
  const groupRows = await db.select().from(groups).where(eq(groups.isActive, true));
  const sourceGroup = groupRows.find((group) => group.id === sourceGroupId);
  const borrowerGroup = groupRows.find((group) => group.id === borrowerGroupId);
  if (!sourceGroup || !borrowerGroup || sourceGroup.isSystem || borrowerGroup.isSystem) {
    throw new Error("Nhóm cho/mượn không hợp lệ.");
  }

  await db.transaction(async (tx) => {
    let resolvedItemName = itemName;
    let resolvedSpecification = specification;
    let resolvedUnit = unit;

    if (toolId) {
      const [tool] = await tx.select().from(toolCatalog)
        .where(and(eq(toolCatalog.id, toolId), eq(toolCatalog.groupId, sourceGroupId)))
        .limit(1);
      if (!tool || !tool.isActive || tool.recordStatus !== "active") {
        throw new Error("Dụng cụ không còn sẵn sàng trong danh mục nhóm cho. Vui lòng tải lại.");
      }
      if (Number(tool.quantityOnHand) <= 0 || Number(tool.quantityOnHand) < quantityBorrowed) {
        throw new Error("Số lượng dụng cụ còn lại không đủ để lập đề nghị. Vui lòng chọn lại.");
      }
      resolvedItemName = tool.name;
      resolvedSpecification = tool.specification || "";
      resolvedUnit = tool.unit;
    }

    const code = await nextWorkflowCode(tx, "CM");
    const [created] = await tx.insert(quickLoans).values({
      code,
      toolId,
      itemName: resolvedItemName,
      specification: resolvedSpecification || null,
      unit: resolvedUnit,
      quantityBorrowed: String(quantityBorrowed),
      sourceGroupId,
      borrowerGroupId,
      requestedBy: auth.userId,
      expectedReturnAt: expectedReturnAtRaw ? new Date(expectedReturnAtRaw) : null,
      borrowerNote: borrowerNote || null,
      status: "pending_approval",
    }).returning();

    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: borrowerGroupId,
      action: "quick_loan.create",
      entityType: "quick_loan",
      entityId: created.id,
      description: `Tạo đề nghị mượn nhanh ${resolvedItemName} - ${quantityBorrowed} ${resolvedUnit}`,
      afterData: created,
    });
  });

  refresh();
}

/** Kỹ sư giám sát hoặc Đốc công nhóm cho mượn đều có quyền duyệt. */
export async function approveQuickLoanAction(formData: FormData) {
  const loanId = String(formData.get("loanId") || "");
  const lenderNote = String(formData.get("lenderNote") || "").trim();
  const [loan] = await db.select().from(quickLoans).where(eq(quickLoans.id, loanId)).limit(1);
  if (!loan) throw new Error("Không tìm thấy giao dịch.");

  const auth = await requireGroupPermission(loan.sourceGroupId, "operator");
  if (loan.requestedBy === auth.userId) {
    throw new Error("Người tạo phiếu không được tự duyệt phiếu.");
  }

  await db.transaction(async (tx) => {
    if (loan.toolId) {
      const [tool] = await tx.select().from(toolCatalog)
        .where(and(eq(toolCatalog.id, loan.toolId), eq(toolCatalog.groupId, loan.sourceGroupId)))
        .limit(1);
      if (!tool || !tool.isActive || tool.recordStatus !== "active") {
        throw new Error("Dụng cụ không còn sẵn sàng trong danh mục nhóm cho.");
      }
      if (Number(tool.quantityOnHand) < Number(loan.quantityBorrowed)) {
        throw new Error("Số lượng còn lại không đủ để duyệt phiếu.");
      }

      await tx.update(toolCatalog).set({
        quantityOnHand: sql`${toolCatalog.quantityOnHand} - ${Number(loan.quantityBorrowed)}`,
        updatedAt: new Date(),
      }).where(eq(toolCatalog.id, loan.toolId));
    }

    const [updated] = await tx.update(quickLoans).set({
      status: "pending_receipt",
      approvedBy: auth.userId,
      approvedAt: new Date(),
      lenderUserId: auth.userId,
      lenderNote: lenderNote || loan.lenderNote,
      updatedAt: new Date(),
    }).where(and(eq(quickLoans.id, loan.id), eq(quickLoans.status, "pending_approval"))).returning();

    if (!updated) throw new Error("Phiếu đã được người khác xử lý. Vui lòng tải lại.");

    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: loan.sourceGroupId,
      action: "quick_loan.approve",
      entityType: "quick_loan",
      entityId: loan.id,
      description: `Nhóm cho mượn duyệt phiếu ${loan.code}`,
      beforeData: loan,
      afterData: updated,
    });
  });

  refresh();
}

/** Mọi thành viên nhóm mượn được xác nhận đã nhận. */
export async function confirmQuickLoanReceiptAction(formData: FormData) {
  const loanId = String(formData.get("loanId") || "");
  const borrowerNote = String(formData.get("borrowerNote") || "").trim();
  const [loan] = await db.select().from(quickLoans).where(eq(quickLoans.id, loanId)).limit(1);
  if (!loan) throw new Error("Không tìm thấy giao dịch.");

  const auth = await requireGroupPermission(loan.borrowerGroupId, "viewer");

  await db.transaction(async (tx) => {
    const [updated] = await tx.update(quickLoans).set({
      status: "borrowed",
      borrowerUserId: auth.userId,
      borrowerNote: borrowerNote || loan.borrowerNote,
      receivedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(quickLoans.id, loanId), eq(quickLoans.status, "pending_receipt"))).returning();

    if (!updated) throw new Error("Giao dịch chưa được nhóm cho mượn duyệt hoặc đã được xử lý.");

    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: loan.borrowerGroupId,
      action: "quick_loan.receive",
      entityType: "quick_loan",
      entityId: loan.id,
      description: `Nhóm mượn xác nhận nhận vật dụng theo phiếu ${loan.code}`,
      afterData: updated,
    });
  });

  refresh();
}

/** Mọi thành viên nhóm mượn được báo đã mang trả. */
export async function reportQuickLoanReturnAction(formData: FormData) {
  const loanId = String(formData.get("loanId") || "");
  const [loan] = await db.select().from(quickLoans).where(eq(quickLoans.id, loanId)).limit(1);
  if (!loan) throw new Error("Không tìm thấy giao dịch.");

  const auth = await requireGroupPermission(loan.borrowerGroupId, "viewer");

  await db.transaction(async (tx) => {
    const [updated] = await tx.update(quickLoans).set({
      status: "return_reported",
      returnReportedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(quickLoans.id, loanId), eq(quickLoans.status, "borrowed"))).returning();

    if (!updated) throw new Error("Giao dịch chưa ở trạng thái đang mượn.");

    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: loan.borrowerGroupId,
      action: "quick_loan.return_report",
      entityType: "quick_loan",
      entityId: loan.id,
      description: `Nhóm mượn báo đã mang trả phiếu ${loan.code}`,
      afterData: updated,
    });
  });

  refresh();
}

/**
 * Nhận lại là thao tác thực địa, không phải bước phê duyệt. Vì vậy mọi nhân viên
 * thuộc nhóm cho (viewer/operator/manager) đều được chốt số lượng thực nhận.
 */
export async function closeQuickLoanAction(formData: FormData) {
  const loanId = String(formData.get("loanId") || "");
  const returnedGood = Number(formData.get("returnedGood") || 0);
  const returnedDamaged = Number(formData.get("returnedDamaged") || 0);
  const lostQuantity = Number(formData.get("lostQuantity") || 0);
  const returnNote = String(formData.get("returnNote") || "").trim();
  const [loan] = await db.select().from(quickLoans).where(eq(quickLoans.id, loanId)).limit(1);
  if (!loan) throw new Error("Không tìm thấy giao dịch.");

  const auth = await requireGroupPermission(loan.sourceGroupId, "viewer");
  if ([returnedGood, returnedDamaged, lostQuantity].some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Số lượng nhận lại không hợp lệ.");
  }

  const total = returnedGood + returnedDamaged + lostQuantity;
  if (Math.abs(total - Number(loan.quantityBorrowed)) > 0.0001) {
    throw new Error("Tổng trả tốt + trả hư + mất phải bằng số lượng đã mượn.");
  }

  await db.transaction(async (tx) => {
    const [updated] = await tx.update(quickLoans).set({
      status: "completed",
      returnedGood: String(returnedGood),
      returnedDamaged: String(returnedDamaged),
      lostQuantity: String(lostQuantity),
      returnNote: returnNote || null,
      closedBy: auth.userId,
      closedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(quickLoans.id, loanId), eq(quickLoans.status, "return_reported"))).returning();

    if (!updated) throw new Error("Bên mượn chưa báo trả hoặc giao dịch đã đóng.");

    if (loan.toolId && returnedGood > 0) {
      await tx.update(toolCatalog).set({
        quantityOnHand: sql`${toolCatalog.quantityOnHand} + ${returnedGood}`,
        updatedAt: new Date(),
      }).where(eq(toolCatalog.id, loan.toolId));
    }

    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: loan.sourceGroupId,
      action: "quick_loan.complete",
      entityType: "quick_loan",
      entityId: loan.id,
      description: `Thành viên nhóm cho mượn xác nhận nhận lại phiếu ${loan.code}`,
      afterData: { returnedGood, returnedDamaged, lostQuantity, returnNote },
    });
  });

  refresh();
}
