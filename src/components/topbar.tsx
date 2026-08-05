import { Bell, LogOut } from "lucide-react";
import type { AuthContext } from "@/lib/auth/session";
import { logoutAction } from "@/actions/auth";

export function Topbar({ auth }: { auth: AuthContext }) {
  return (
    <header className="topbar">
      <div>
        <strong>{auth.primaryGroupName || "Toàn xưởng"}</strong>
        <span>Đang đăng nhập với {auth.permissions.length} phạm vi nhóm</span>
      </div>
      <div className="topbar-actions">
        <button className="icon-button" aria-label="Thông báo"><Bell size={19} /></button>
        <form action={logoutAction}><button className="icon-button" aria-label="Đăng xuất"><LogOut size={19} /></button></form>
      </div>
    </header>
  );
}
