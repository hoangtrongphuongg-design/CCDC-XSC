"use server";

/**
 * Bộ bọc cho cửa sổ "Tạo phiếu" (`components/ticket-dialog.tsx`). Các hành động tạo phiếu gốc báo lỗi bằng
 * `throw new Error("thông báo tiếng Việt")`, nhưng ở production Next che nội dung lỗi ném từ Server Action;
 * nên ở đây bắt lỗi và trả về dạng dữ liệu để cửa sổ hiện đúng thông báo mà không mất dữ liệu đã nhập.
 * Không đổi nghiệp vụ / quyền / kiểm tra: mọi thứ vẫn do hành động gốc làm.
 */
import { createDisposalAction, createToolDisposalAction } from "@/actions/disposals";
import { createLossReportAction, createToolLossReportAction } from "@/actions/loss";
import { createMachineLoanAction } from "@/actions/machine-loans";
import { createQuickLoanAction } from "@/actions/quick-loans";
import { createRepairAction } from "@/actions/repairs";
import { createTransferAction } from "@/actions/transfers";
import { ticketErrorMessage, type TicketState } from "@/lib/ticket-state";

async function run(action: (formData: FormData) => Promise<void>, formData: FormData): Promise<TicketState> {
  try {
    await action(formData);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: ticketErrorMessage(error) };
  }
}

export async function submitMachineLoan(_prev: TicketState, formData: FormData): Promise<TicketState> {
  return run(createMachineLoanAction, formData);
}

export async function submitQuickLoan(_prev: TicketState, formData: FormData): Promise<TicketState> {
  return run(createQuickLoanAction, formData);
}

export async function submitTransfer(_prev: TicketState, formData: FormData): Promise<TicketState> {
  return run(createTransferAction, formData);
}

export async function submitRepair(_prev: TicketState, formData: FormData): Promise<TicketState> {
  return run(createRepairAction, formData);
}

export async function submitDisposal(_prev: TicketState, formData: FormData): Promise<TicketState> {
  return run(createDisposalAction, formData);
}

export async function submitToolDisposal(_prev: TicketState, formData: FormData): Promise<TicketState> {
  return run(createToolDisposalAction, formData);
}

export async function submitLoss(_prev: TicketState, formData: FormData): Promise<TicketState> {
  return run(createLossReportAction, formData);
}

export async function submitToolLoss(_prev: TicketState, formData: FormData): Promise<TicketState> {
  return run(createToolLossReportAction, formData);
}
