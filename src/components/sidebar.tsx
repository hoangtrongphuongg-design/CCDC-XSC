"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  ChevronRight,
  ClipboardList,
  Gauge,
  Handshake,
  Network,
  Recycle,
  ShieldCheck,
  Wrench,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AuthContext } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { getRoleSummary } from "@/lib/auth/roles";

type NavItem = readonly [href: string, label: string, icon: LucideIcon];

const operationItems = [
  ["/dashboard", "Tổng quan", Gauge],
  ["/equipment", "Dụng cụ toàn xưởng", Boxes],
  ["/my-equipment", "Dụng cụ nhóm tôi", ClipboardList],
] as const satisfies readonly NavItem[];

const workflowItems = [
  ["/machine-loans", "Mượn máy", Handshake],
  ["/quick-loans", "Cho mượn nhanh", Zap],
  ["/transfers", "Điều chuyển", ArrowLeftRight],
  ["/repairs", "Sửa chữa", Wrench],
  ["/disposals", "Thanh lý", Recycle],
] as const satisfies readonly NavItem[];

const insightItems = [
  ["/reports", "Báo cáo", BarChart3],
  ["/activities", "Lịch sử hoạt động", Activity],
] as const satisfies readonly NavItem[];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase()).join("") || "XS";
}

export function Sidebar({ auth }: { auth: AuthContext }) {
  const pathname = usePathname();
  const roleLabel = getRoleSummary(auth);

  const renderGroup = (label: string, items: readonly NavItem[]) => (
    <div className="nav-section" key={label}>
      <p className="nav-section-label">{label}</p>
      <div className="nav-section-list">
        {items.map(([href, itemLabel, Icon]) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link href={href} key={href} className={cn("nav-link", active && "is-active")} aria-current={active ? "page" : undefined}>
              <span className="nav-icon"><Icon size={18} strokeWidth={1.9} aria-hidden="true" /></span>
              <span className="nav-label">{itemLabel}</span>
              <ChevronRight className="nav-chevron" size={15} aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <aside className="sidebar" data-slot="sidebar">
      <div className="brand-block">
        <div className="brand-symbol" aria-hidden="true"><Image src="/brand/company-symbol.png" alt="" width={38} height={50} /></div>
        <div className="brand-copy"><strong>{APP_NAME}</strong><span>Hệ thống quản lý dụng cụ xưởng</span></div>
      </div>

      <nav aria-label="Điều hướng chính" className="sidebar-nav">
        {renderGroup("TỔNG QUAN", operationItems)}
        {renderGroup("NGHIỆP VỤ", workflowItems)}
        {renderGroup("THEO DÕI", insightItems)}
        {auth.isAdmin ? renderGroup("QUẢN TRỊ", [
          ["/groups", "Cơ cấu nhóm Xưởng", Network],
          ["/users", "Người dùng & phân quyền", ShieldCheck],
        ]) : null}
      </nav>

      <div className="sidebar-footer">
        <div className="workshop-signature"><span className="signature-dot" /><div><strong>Xưởng Sửa chữa</strong><span>Hệ thống đang hoạt động</span></div></div>
        <div className="sidebar-user">
          <div className="user-avatar">{initials(auth.fullName)}</div>
          <div className="user-meta"><strong>{auth.fullName}</strong><span>{auth.primaryGroupName || "Chưa gán nhóm"} · {roleLabel}</span></div>
        </div>
      </div>
    </aside>
  );
}
