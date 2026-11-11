/**
 * "Việc chờ tôi xử lý": quy tắc thuần (không DB) cho biết phiếu nào đang chờ CHÍNH người dùng.
 * Dùng cho chuông trên thanh trên, số trên menu và thẻ ở Tổng quan.
 *
 * Nguyên tắc: một phiếu chỉ tính là "việc của tôi" khi tôi thật sự là người ở bước đó —
 *  - bước cấp nhóm: tôi phải là THÀNH VIÊN nhóm đó đủ bậc (đúng bậc mà Server Action đòi);
 *    Admin / Quản lý Xưởng không tự nhiên có việc của mọi nhóm (họ vẫn thao tác được ở trang
 *    nghiệp vụ, chỉ là không bị tính vào số "chờ tôi");
 *  - bước cấp Xưởng (tiếp nhận sửa, duyệt điều chuyển/thanh lý): Quản lý Xưởng hoặc Admin;
 *  - người tạo phiếu không tự thấy việc duyệt phiếu của chính mình (khớp chặn tự duyệt ở backend);
 *  - Người xem toàn xưởng không có việc nào (luôn bị chặn ghi).
 * Backend vẫn tự kiểm tra quyền độc lập; đây chỉ là gợi ý hiển thị.
 */
import type { AuthContext } from "@/lib/auth/session";
import { vnDate } from "@/lib/export/equipment-export";

export type TaskSubject = Pick<AuthContext, "userId" | "isAdmin" | "isWsManager" | "isReadOnlyViewer" | "permissions">;

/** Mục menu mà số đếm hiển thị cạnh. */
export type TaskSection = "loans" | "transfers" | "repairs" | "disposals";
export const TASK_SECTIONS: readonly TaskSection[] = ["loans", "transfers", "repairs", "disposals"];

export type TaskTone = "blue" | "red" | "orange" | "sky";

export type MyTask = {
  key: string;
  section: TaskSection;
  /** Việc cần làm, vd "Duyệt và bàn giao". */
  action: string;
  /** Máy / CCDC / mã phiếu. */
  label: string;
  /** Mô tả nhóm liên quan, vd "Nhóm A mượn của Nhóm B". */
  detail: string;
  since: Date;
  href: string;
  tone: TaskTone;
};

type Base = { id: string; code: string; label: string; updatedAt: Date };

export type MachineLoanTaskRow = Base & {
  status: string;
  ownerGroupId: string;
  borrowerGroupId: string;
  requestedBy: string;
  expectedReturnDate: string;
};
export type QuickLoanTaskRow = Base & {
  status: string;
  sourceGroupId: string;
  borrowerGroupId: string;
  requestedBy: string;
  expectedReturnAt: Date | null;
};
export type TransferTaskRow = Base & {
  status: string;
  sourceGroupId: string;
  targetGroupId: string;
  proposedBy: string;
  handedOver: boolean;
};
export type RepairTaskRow = Base & { status: string; ownerGroupId: string };
export type DisposalTaskRow = Base & { status: string; ownerGroupId: string; proposedBy: string };

export type MyTaskInput = {
  loans: readonly MachineLoanTaskRow[];
  quickLoans: readonly QuickLoanTaskRow[];
  transfers: readonly TransferTaskRow[];
  repairs: readonly RepairTaskRow[];
  /** Thanh lý máy + thanh lý CCDC theo số lượng (CCDC không có bước chờ nhập kho). */
  disposals: readonly DisposalTaskRow[];
  warehouseGroupId: string | null;
  groupNames: ReadonlyMap<string, string>;
  /** Ngày "hôm nay" theo giờ Việt Nam, YYYY-MM-DD. */
  today?: string;
};

const RANK = { viewer: 0, operator: 1, manager: 2 } as const;
type Level = keyof typeof RANK;

/** Thành viên nhóm với bậc tối thiểu (KHÔNG áp quyền toàn Xưởng của Admin/Quản lý Xưởng). */
export function isGroupMember(subject: TaskSubject, groupId: string | null | undefined, min: Level): boolean {
  if (!groupId || subject.isReadOnlyViewer) return false;
  return subject.permissions.some((p) => p.groupId === groupId && RANK[p.level] >= RANK[min]);
}

export function isWsLevel(subject: TaskSubject): boolean {
  return (subject.isAdmin || subject.isWsManager) && !subject.isReadOnlyViewer;
}

export function buildMyTasks(subject: TaskSubject, input: MyTaskInput): MyTask[] {
  const today = input.today ?? vnDate();
  const name = (id: string) => input.groupNames.get(id) ?? "—";
  const tasks: MyTask[] = [];
  const add = (task: Omit<MyTask, "key"> & { id: string; kind: string }) => {
    const { id, kind, ...rest } = task;
    tasks.push({ key: `${kind}:${id}`, ...rest });
  };

  for (const row of input.loans) {
    const base = { id: row.id, label: `${row.label} · ${row.code}`, since: row.updatedAt, href: "/machine-loans", section: "loans" as const };
    const detail = `${name(row.borrowerGroupId)} mượn của ${name(row.ownerGroupId)}`;
    if (row.status === "pending_owner" && isGroupMember(subject, row.ownerGroupId, "operator") && row.requestedBy !== subject.userId) {
      add({ ...base, kind: "loan-approve", action: "Duyệt và bàn giao", detail, tone: "blue" });
    } else if (row.status === "return_requested" && isGroupMember(subject, row.ownerGroupId, "operator")) {
      add({ ...base, kind: "loan-return", action: "Xác nhận nhận lại", detail, tone: "blue" });
    } else if (row.status === "on_loan" && row.expectedReturnDate < today && isGroupMember(subject, row.borrowerGroupId, "viewer")) {
      add({ ...base, kind: "loan-overdue", action: `Quá hạn trả (hạn ${row.expectedReturnDate})`, detail, tone: "red" });
    }
  }

  for (const row of input.quickLoans) {
    const base = { id: row.id, label: `${row.label} · ${row.code}`, since: row.updatedAt, href: "/quick-loans", section: "loans" as const };
    const detail = `${name(row.borrowerGroupId)} mượn của ${name(row.sourceGroupId)}`;
    if (row.status === "pending_approval" && isGroupMember(subject, row.sourceGroupId, "operator") && row.requestedBy !== subject.userId) {
      add({ ...base, kind: "quick-approve", action: "Duyệt cho mượn", detail, tone: "blue" });
    } else if (row.status === "pending_receipt" && isGroupMember(subject, row.borrowerGroupId, "viewer")) {
      add({ ...base, kind: "quick-receipt", action: "Xác nhận đã nhận", detail, tone: "blue" });
    } else if (row.status === "return_reported" && isGroupMember(subject, row.sourceGroupId, "operator")) {
      add({ ...base, kind: "quick-return", action: "Xác nhận nhận lại", detail, tone: "blue" });
    } else if (row.status === "borrowed" && row.expectedReturnAt && vnDate(row.expectedReturnAt) < today && isGroupMember(subject, row.borrowerGroupId, "viewer")) {
      add({ ...base, kind: "quick-overdue", action: `Quá hạn trả (hạn ${vnDate(row.expectedReturnAt)})`, detail, tone: "red" });
    }
  }

  for (const row of input.transfers) {
    const base = { id: row.id, label: `${row.label} · ${row.code}`, since: row.updatedAt, href: "/transfers", section: "transfers" as const };
    const detail = `${name(row.sourceGroupId)} → ${name(row.targetGroupId)}`;
    if (row.status === "pending_source" && isGroupMember(subject, row.sourceGroupId, "manager") && row.proposedBy !== subject.userId) {
      add({ ...base, kind: "transfer-counterpart", action: "Đồng ý điều chuyển", detail, tone: "sky" });
    } else if (row.status === "pending_target" && isGroupMember(subject, row.targetGroupId, "manager") && row.proposedBy !== subject.userId) {
      add({ ...base, kind: "transfer-counterpart", action: "Đồng ý điều chuyển", detail, tone: "sky" });
    } else if (row.status === "pending_ws" && isWsLevel(subject)) {
      add({ ...base, kind: "transfer-ws", action: "Duyệt điều chuyển", detail, tone: "sky" });
    } else if (row.status === "wait_handover" && !row.handedOver && isGroupMember(subject, row.sourceGroupId, "manager")) {
      add({ ...base, kind: "transfer-handover", action: "Bàn giao máy", detail, tone: "sky" });
    } else if (row.status === "wait_handover" && row.handedOver && isGroupMember(subject, row.targetGroupId, "manager")) {
      add({ ...base, kind: "transfer-receipt", action: "Xác nhận nhận máy", detail, tone: "sky" });
    }
  }

  for (const row of input.repairs) {
    const base = { id: row.id, label: `${row.label} · ${row.code}`, since: row.updatedAt, href: "/repairs", section: "repairs" as const };
    const detail = `Nhóm quản lý: ${name(row.ownerGroupId)}`;
    if (row.status === "pending_acceptance" && isWsLevel(subject)) {
      add({ ...base, kind: "repair-accept", action: "Tiếp nhận sửa chữa", detail, tone: "orange" });
    } else if (row.status === "wait_owner_confirm" && isGroupMember(subject, row.ownerGroupId, "manager")) {
      add({ ...base, kind: "repair-confirm", action: "Nhận lại máy đã sửa", detail, tone: "orange" });
    }
  }

  for (const row of input.disposals) {
    const base = { id: row.id, label: `${row.label} · ${row.code}`, since: row.updatedAt, href: "/disposals", section: "disposals" as const };
    const detail = `Nhóm quản lý: ${name(row.ownerGroupId)}`;
    if (row.status === "pending_group" && isGroupMember(subject, row.ownerGroupId, "manager") && row.proposedBy !== subject.userId) {
      add({ ...base, kind: "disposal-group", action: "Xác nhận đề xuất thanh lý", detail, tone: "red" });
    } else if (row.status === "pending_ws" && isWsLevel(subject)) {
      add({ ...base, kind: "disposal-ws", action: "Duyệt thanh lý", detail, tone: "red" });
    } else if (row.status === "wait_warehouse" && isGroupMember(subject, input.warehouseGroupId, "operator")) {
      add({ ...base, kind: "disposal-warehouse", action: "Xác nhận nhập Kho thanh lý", detail, tone: "red" });
    }
  }

  // Việc chờ lâu nhất lên đầu.
  return tasks.sort((a, b) => a.since.getTime() - b.since.getTime());
}

export function countBySection(tasks: readonly MyTask[]): Record<TaskSection, number> {
  const counts: Record<TaskSection, number> = { loans: 0, transfers: 0, repairs: 0, disposals: 0 };
  for (const task of tasks) counts[task.section] += 1;
  return counts;
}

export const EMPTY_TASK_COUNTS: Record<TaskSection, number> = { loans: 0, transfers: 0, repairs: 0, disposals: 0 };

/** Số hiển thị trên huy hiệu: "99+" khi quá lớn. */
export function formatBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}
