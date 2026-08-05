import Link from "next/link";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CircleUserRound,
  ClipboardList,
  Gauge,
  Handshake,
  Recycle,
  ShieldCheck,
  Wrench,
  Zap,
} from "lucide-react";
import type { AuthContext } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";

const baseItems = [
  ["/dashboard", "Tổng quan", Gauge],
  ["/equipment", "Dụng cụ toàn xưởng", Boxes],
  ["/my-equipment", "Dụng cụ nhóm tôi", ClipboardList],
  ["/machine-loans", "Mượn máy", Handshake],
  ["/transfers", "Điều chuyển", ArrowLeftRight],
  ["/quick-loans", "Cho mượn nhanh", Zap],
  ["/repairs", "Sửa chữa", Wrench],
  ["/disposals", "Thanh lý", Recycle],
  ["/reports", "Báo cáo", BarChart3],
  ["/activities", "Lịch sử hoạt động", Activity],
] as const;

export function Sidebar({ auth }: { auth: AuthContext }) {
  const items = auth.isAdmin ? [...baseItems, ["/users", "Người dùng", ShieldCheck] as const] : baseItems;
  return (
    <aside className="sidebar">
      <div className="brand-block">
        <div className="brand-mark">XSC</div>
        <div><strong>{APP_NAME}</strong><span>Quản lý công cụ dụng cụ</span></div>
      </div>
      <nav aria-label="Điều hướng chính">
        {items.map(([href, label, Icon]) => (
          <Link href={href} key={href} className="nav-link"><Icon size={18} aria-hidden="true" />{label}</Link>
        ))}
      </nav>
      <div className="sidebar-user">
        <CircleUserRound size={20} aria-hidden="true" />
        <div><strong>{auth.fullName}</strong><span>{auth.primaryGroupName || "Chưa gán nhóm"}</span></div>
      </div>
    </aside>
  );
}
