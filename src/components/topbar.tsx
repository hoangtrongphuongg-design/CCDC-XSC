import { Bell, CalendarDays, LogOut, ShieldCheck } from "lucide-react";
import type { AuthContext } from "@/lib/auth/session";
import { logoutAction } from "@/actions/auth";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "XS";
}

export function Topbar({ auth }: { auth: AuthContext }) {
  const today = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  const roleLabel = auth.isAdmin ? "Quản trị hệ thống" : auth.isWsManager ? "Quản lý Xưởng" : "Thành viên";

  return (
    <header className="topbar" data-slot="topbar">
      <div className="topbar-context">
        <div className="context-icon"><ShieldCheck size={18} aria-hidden="true" /></div>
        <div>
          <strong>{auth.primaryGroupName || "Toàn xưởng"}</strong>
          <span>{roleLabel} · {auth.permissions.length} phạm vi được phân quyền</span>
        </div>
      </div>

      <div className="topbar-actions">
        <div className="today-chip" title={today}>
          <CalendarDays size={16} aria-hidden="true" />
          <span>{today}</span>
        </div>
        <button className="icon-button notification-button" type="button" aria-label="Thông báo">
          <Bell size={18} />
          <span className="notification-dot" aria-hidden="true" />
        </button>
        <div className="topbar-user">
          <div className="topbar-avatar">{initials(auth.fullName)}</div>
          <div><strong>{auth.fullName}</strong><span>{auth.primaryGroupName || "Chưa gán nhóm"}</span></div>
        </div>
        <form action={logoutAction}>
          <button className="icon-button" aria-label="Đăng xuất" title="Đăng xuất"><LogOut size={18} /></button>
        </form>
      </div>
    </header>
  );
}
