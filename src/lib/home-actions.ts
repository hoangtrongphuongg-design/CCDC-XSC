/**
 * Trang chủ theo vai trò (hàm thuần): lời chào, các nút hành động lớn và đường dẫn của ô số liệu.
 * Nguyên tắc "việc trước, số liệu sau": ai mở web cũng thấy ngay việc họ hay làm nhất.
 * Backend vẫn tự kiểm tra quyền; đây chỉ quyết định hiện nút nào.
 */
import { canViewWholeWorkshop } from "@/lib/auth/roles";
import type { AuthContext } from "@/lib/auth/session";

export type HomeSubject = Pick<AuthContext, "isAdmin" | "isWsManager" | "isReadOnlyViewer" | "permissions">;

export type HomeActionIcon = "loan" | "return" | "repair" | "search" | "inventory" | "approve" | "report" | "import" | "equipment";

export type HomeAction = {
  key: string;
  icon: HomeActionIcon;
  label: string;
  hint: string;
  href: string;
  /** Số hiện ở góc nút (vd số việc chờ). */
  badge?: number;
};

const isWorkshopLevel = (s: HomeSubject) => (s.isAdmin || s.isWsManager) && !s.isReadOnlyViewer;
const hasLevel = (s: HomeSubject, level: "operator" | "manager") =>
  s.permissions.some((p) => (level === "operator" ? p.level !== "viewer" : p.level === "manager"));

export const HOME_ACTION_LIMIT = 4;

/** Các nút hành động lớn ở đầu trang chủ, tối đa HOME_ACTION_LIMIT, theo vai trò. */
export function buildHomeActions(subject: HomeSubject, ctx: { pendingTasks: number; inventoryTasks?: number }): HomeAction[] {
  const search: HomeAction = { key: "search", icon: "search", label: "Tìm máy", hint: "Mã, tem nhôm, serial, mã phiếu", href: "/search" };
  const loan: HomeAction = { key: "loan", icon: "loan", label: "Mượn CCDC", hint: "Tạo đề nghị mượn", href: "/machine-loans?mode=create#new-loan" };
  const giveBack: HomeAction = { key: "return", icon: "return", label: "Trả CCDC", hint: "Chọn máy đang mượn để trả", href: "/machine-loans?mode=return#mobile-active-loans" };
  const repair: HomeAction = { key: "repair", icon: "repair", label: "Báo hỏng", hint: "Báo máy hư để sửa chữa", href: "/repairs?mode=create#new-repair" };
  const inventoryDue = ctx.inventoryTasks ?? 0;
  const inventory: HomeAction = {
    key: "inventory", icon: "inventory", label: "Kiểm kê",
    hint: inventoryDue ? "Đang có đợt kiểm kê định kỳ cần làm" : "Kiểm CCDC của nhóm tại chỗ",
    href: "/inventory", badge: inventoryDue || undefined,
  };
  const approve: HomeAction = {
    key: "approve", icon: "approve", label: "Việc chờ xử lý",
    hint: ctx.pendingTasks ? `${ctx.pendingTasks} việc đang chờ bạn` : "Không có việc đang chờ",
    href: "#viec-cho-toi", badge: ctx.pendingTasks || undefined,
  };

  if (subject.isReadOnlyViewer) {
    return [
      search,
      { key: "equipment", icon: "equipment", label: "Dụng cụ toàn xưởng", hint: "Xem và tra cứu", href: "/equipment" },
      { key: "report", icon: "report", label: "Báo cáo", hint: "Quá hạn, chi phí sửa, máy nằm không", href: "/reports" },
    ];
  }
  if (isWorkshopLevel(subject)) {
    const list: HomeAction[] = [
      approve,
      { key: "report", icon: "report", label: "Quá hạn & báo cáo", hint: "Phiếu quá hạn, chi phí sửa chữa", href: "/reports#qua-han" },
      inventory,
      subject.isAdmin ? { key: "import", icon: "import", label: "Nhập máy từ Excel", hint: "Nạp danh sách máy có sẵn", href: "/import" } : search,
    ];
    return list.slice(0, HOME_ACTION_LIMIT);
  }
  if (hasLevel(subject, "manager")) {
    return [approve, loan, repair, inventory].slice(0, HOME_ACTION_LIMIT);
  }
  if (hasLevel(subject, "operator")) {
    return [loan, giveBack, repair, search].slice(0, HOME_ACTION_LIMIT);
  }
  if (subject.permissions.length) {
    // Công nhân kỹ thuật: được mượn / trả / kiểm kê, chưa được báo hỏng.
    return [loan, giveBack, inventory, search].slice(0, HOME_ACTION_LIMIT);
  }
  return [search];
}

export type KpiLinks = { tasks: string; total: string; ready: string; loans: string | null; repairs: string | null; transfers: string | null };

/** Đường dẫn của các ô số liệu trên trang chủ (null = không có trang để mở với vai trò này). */
export function kpiLinks(subject: HomeSubject): KpiLinks {
  const whole = canViewWholeWorkshop(subject);
  const canWork = !subject.isReadOnlyViewer && (isWorkshopLevel(subject) || subject.permissions.length > 0);
  return {
    tasks: "#viec-cho-toi",
    total: whole ? "/equipment" : "/my-equipment",
    ready: whole ? `/equipment?q=${encodeURIComponent("Sẵn sàng")}` : "/my-equipment",
    loans: canWork ? "/machine-loans" : null,
    repairs: canWork ? "/repairs" : null,
    transfers: !subject.isReadOnlyViewer && (isWorkshopLevel(subject) || hasLevel(subject, "manager")) ? "/transfers" : null,
  };
}

/** Lời chào theo giờ Việt Nam. */
export function greetingFor(now: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" }).format(now)) % 24;
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 14) return "Chào buổi trưa";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

/** Tên gọi: từ cuối của họ tên ("Nguyễn Văn Ánh" → "Ánh"). */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "bạn";
}
