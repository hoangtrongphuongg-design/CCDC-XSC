/**
 * Kiểm kê định kỳ hàng tháng (hàm thuần, không DB — dễ kiểm thử).
 *
 * Quy tắc: ngày 1 hệ thống tự mở một đợt cho mỗi nhóm nghiệp vụ có máy; Đốc công của nhóm kiểm trong tháng; hết ngày 15
 * (chạy lúc 0h05 ngày 16 giờ VN) đợt tự đóng. Mỗi nhóm đúng MỘT đợt định kỳ mỗi tháng (`period` = "YYYY-MM").
 * Mọi ngày là chuỗi YYYY-MM-DD theo giờ Việt Nam (`vnDate`), không dùng UTC.
 */

/** Hạn kiểm kê: hết ngày này của tháng thì tự đóng. */
export const INVENTORY_DEADLINE_DAY = 15;

/** "2026-11-12" → "2026-11". */
export function periodOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Hạn của một kỳ: "2026-11" → "2026-11-15". */
export function deadlineOf(period: string): string {
  return `${period}-${pad2(INVENTORY_DEADLINE_DAY)}`;
}

/** "Kiểm kê định kỳ tháng 11/2026". */
export function periodTitle(period: string): string {
  const [year, month] = period.split("-");
  return `Kiểm kê định kỳ tháng ${Number(month)}/${year}`;
}

/** "15/11" — hạn hiển thị cho người dùng. */
export function deadlineLabel(period: string): string {
  const [, month] = period.split("-");
  return `${INVENTORY_DEADLINE_DAY}/${Number(month)}`;
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Số ngày từ `today` đến hạn của kỳ (âm = đã quá hạn, 0 = hôm nay là hạn chót). */
export function daysUntilDeadline(period: string, today: string): number {
  return dayNumber(deadlineOf(period)) - dayNumber(today);
}

export type ScheduleGroup = { groupId: string; machineCount: number };
export type ScheduleSession = { id: string; groupId: string; status: "open" | "closed"; period: string | null };

export type ScheduleAction =
  | { type: "close"; sessionId: string; groupId: string; period: string }
  | { type: "adopt"; sessionId: string; groupId: string; period: string }
  | { type: "create"; groupId: string; period: string };

/**
 * Việc cần làm của lần chạy hôm nay. `sessions` gồm mọi đợt đang mở + mọi đợt của kỳ hiện tại (kể cả đã đóng).
 * Thứ tự trả về: đóng trước, rồi nhận đợt thủ công, rồi tạo mới (đóng đợt cũ xong nhóm mới được mở đợt khác).
 * Chạy lặp trong cùng ngày cho kết quả rỗng (idempotent).
 */
export function plan(input: { today: string; groups: readonly ScheduleGroup[]; sessions: readonly ScheduleSession[] }): ScheduleAction[] {
  const { today } = input;
  const period = periodOf(today);
  const day = Number(today.slice(8, 10));
  const actions: ScheduleAction[] = [];

  // 1) Đóng đợt định kỳ đã quá hạn (hết ngày 15 của kỳ của nó).
  const closing = new Set<string>();
  for (const session of input.sessions) {
    if (session.status === "open" && session.period && deadlineOf(session.period) < today) {
      closing.add(session.id);
      actions.push({ type: "close", sessionId: session.id, groupId: session.groupId, period: session.period });
    }
  }

  // 2) Chỉ mở/nhận đợt trong khoảng ngày 1–15 (chạy bù nếu hôm 1 lỡ).
  if (day > INVENTORY_DEADLINE_DAY) return actions;

  for (const group of input.groups) {
    if (group.machineCount <= 0) continue;
    const ofGroup = input.sessions.filter((s) => s.groupId === group.groupId);
    if (ofGroup.some((s) => s.period === period)) continue; // đã có đợt kỳ này (mở hoặc đã đóng)
    const stillOpen = ofGroup.filter((s) => s.status === "open" && !closing.has(s.id));
    const manual = stillOpen.find((s) => s.period === null);
    if (manual) actions.push({ type: "adopt", sessionId: manual.id, groupId: group.groupId, period });
    else if (!stillOpen.length) actions.push({ type: "create", groupId: group.groupId, period });
  }
  return actions;
}
