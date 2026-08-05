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
  revalidatePath("/dashboard");
}

export async function createQuickLoanAction(formData: FormData) {
  const sourceGroupId = String(formData.get("sourceGroupId") || "");
  const borrowerGroupId = String(formData.get("borrowerGroupId") || "");
  const toolId = String(formData.get("toolId") || "") || null;
  const itemName = String(formData.get("itemName") || "").trim();
  const specification = String(formData.get("specification") || "").trim();
  const unit = String(formData.get("unit") || "cái").trim();
  const quantityBorrowed = Number(formData.get("quantityBorrowed") || 0);
  const expectedReturnAtRaw = String(formData.get("expectedReturnAt") || "");
  const lenderNote = String(formData.get("lenderNote") || "").trim();
  if (!sourceGroupId || !borrowerGroupId || !itemName || quantityBorrowed <= 0) throw new Error("Thông tin mượn nhanh chưa đầy đủ.");
  if (sourceGroupId === borrowerGroupId) throw new Error("Nhóm mượn phải khác nhóm cho.");
  const auth = await requireGroupPermission(sourceGroupId, "operator");
  const groupRows = await db.select().from(groups).where(eq(groups.isActive, true));
  const sourceGroup = groupRows.find((g) => g.id === sourceGroupId);
  const borrowerGroup = groupRows.find((g) => g.id === borrowerGroupId);
  if (!sourceGroup || !borrowerGroup || sourceGroup.isSystem || borrowerGroup.isSystem) throw new Error("Nhóm cho/mượn không hợp lệ.");

  await db.transaction(async (tx) => {
    if (toolId) {
      const [tool] = await tx.select().from(toolCatalog).where(and(eq(toolCatalog.id, toolId), eq(toolCatalog.groupId, sourceGroupId))).limit(1);
      if (!tool) throw new Error("Không tìm thấy dụng cụ trong danh mục nhóm.");
      if (Number(tool.quantityOnHand) < quantityBorrowed) throw new Error("Số lượng dụng cụ còn lại không đủ.");
      await tx.update(toolCatalog).set({ quantityOnHand: sql`${toolCatalog.quantityOnHand} - ${quantityBorrowed}`, updatedAt: new Date() }).where(eq(toolCatalog.id, toolId));
    }
    const code = await nextWorkflowCode(tx, "CM");
    const [created] = await tx.insert(quickLoans).values({
      code,
      toolId,
      itemName,
      specification: specification || null,
      unit,
      quantityBorrowed: String(quantityBorrowed),
      sourceGroupId,
      borrowerGroupId,
      lenderUserId: auth.userId,
      expectedReturnAt: expectedReturnAtRaw ? new Date(expectedReturnAtRaw) : null,
      lenderNote: lenderNote || null,
      status: "pending_receipt",
    }).returning();
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: sourceGroupId,
      action: "quick_loan.create",
      entityType: "quick_loan",
      entityId: created.id,
      description: `Cho mượn nhanh ${itemName} - ${quantityBorrowed} ${unit}`,
      afterData: created,
    });
  });
  refresh();
}

export async function confirmQuickLoanReceiptAction(formData: FormData) {
  const loanId = String(formData.get("loanId") || "");
  const borrowerNote = String(formData.get("borrowerNote") || "").trim();
  const [loan] = await db.select().from(quickLoans).where(eq(quickLoans.id, loanId)).limit(1);
  if (!loan) throw new Error("Không tìm thấy giao dịch.");
  const auth = await requireGroupPermission(loan.borrowerGroupId, "operator");
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(quickLoans).set({ status: "borrowed", borrowerUserId: auth.userId, borrowerNote: borrowerNote || null, receivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(quickLoans.id, loanId), eq(quickLoans.status, "pending_receipt"))).returning();
    if (!updated) throw new Error("Giao dịch đã được xử lý.");
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: loan.borrowerGroupId,
      action: "quick_loan.receive",
      entityType: "quick_loan",
      entityId: loan.id,
      description: `Xác nhận nhận vật dụng theo phiếu ${loan.code}`,
      afterData: updated,
    });
  });
  refresh();
}

export async function reportQuickLoanReturnAction(formData: FormData) {
  const loanId = String(formData.get("loanId") || "");
  const [loan] = await db.select().from(quickLoans).where(eq(quickLoans.id, loanId)).limit(1);
  if (!loan) throw new Error("Không tìm thấy giao dịch.");
  const auth = await requireGroupPermission(loan.borrowerGroupId, "operator");
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(quickLoans).set({ status: "return_reported", returnReportedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(quickLoans.id, loanId), eq(quickLoans.status, "borrowed"))).returning();
    if (!updated) throw new Error("Giao dịch chưa ở trạng thái đang mượn.");
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: loan.borrowerGroupId,
      action: "quick_loan.return_report",
      entityType: "quick_loan",
      entityId: loan.id,
      description: `Báo đã mang trả phiếu ${loan.code}`,
      afterData: updated,
    });
  });
  refresh();
}

export async function closeQuickLoanAction(formData: FormData) {
  const loanId = String(formData.get("loanId") || "");
  const returnedGood = Number(formData.get("returnedGood") || 0);
  const returnedDamaged = Number(formData.get("returnedDamaged") || 0);
  const lostQuantity = Number(formData.get("lostQuantity") || 0);
  const returnNote = String(formData.get("returnNote") || "").trim();
  const [loan] = await db.select().from(quickLoans).where(eq(quickLoans.id, loanId)).limit(1);
  if (!loan) throw new Error("Không tìm thấy giao dịch.");
  const auth = await requireGroupPermission(loan.sourceGroupId, "operator");
  const total = returnedGood + returnedDamaged + lostQuantity;
  if (Math.abs(total - Number(loan.quantityBorrowed)) > 0.0001) throw new Error("Tổng trả tốt + trả hư + mất phải bằng số lượng đã mượn.");

  await db.transaction(async (tx) => {
    const [updated] = await tx.update(quickLoans).set({
      status: "completed",
      returnedGood: String(returnedGood),
      returnedDamaged: String(returnedDamaged),
      lostQuantity: String(lostQuantity),
      returnNote: returnNote || null,
      closedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(quickLoans.id, loanId), eq(quickLoans.status, "return_reported"))).returning();
    if (!updated) throw new Error("Bên mượn chưa báo trả hoặc giao dịch đã đóng.");
    if (loan.toolId && returnedGood > 0) {
      await tx.update(toolCatalog).set({ quantityOnHand: sql`${toolCatalog.quantityOnHand} + ${returnedGood}`, updatedAt: new Date() }).where(eq(toolCatalog.id, loan.toolId));
    }
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: loan.sourceGroupId,
      action: "quick_loan.complete",
      entityType: "quick_loan",
      entityId: loan.id,
      description: `Xác nhận đã trả ${loan.code}`,
      afterData: { returnedGood, returnedDamaged, lostQuantity, returnNote },
    });
  });
  refresh();
}
