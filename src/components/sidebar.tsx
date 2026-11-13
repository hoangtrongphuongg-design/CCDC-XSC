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
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  Gauge,
  Handshake,
  Network,
  QrCode,
  Recycle,
  SearchX,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AuthContext } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { canViewWholeWorkshop, getRoleSummary } from "@/lib/auth/roles";
import { isActivePath } from "@/lib/nav-active";
import { canPrintLabels } from "@/lib/labels";
import { EMPTY_TASK_COUNTS, formatBadge, type TaskSection } from "@/lib/my-tasks";

type NavItem = readonly [href: string, label: string, icon: LucideIcon];

function hasAnyGroupPermission(auth: AuthContext) {
  return auth.permissions.length > 0;
}

function hasManagerGroupPermission(auth: AuthContext) {
  return auth.permissions.some((permission) => permission.level === "manager");
}

const operationItems = [
  ["/dashboard", "Tổng quan", Gauge],
  ["/equipment", "Dụng cụ toàn xưởng", Boxes],
  ["/my-equipment", "Dụng cụ nhóm tôi", ClipboardList],
  ["/inventory", "Kiểm kê", ClipboardCheck],
] as const satisfies readonly NavItem[];

const labelsItem = ["/labels", "In tem QR", QrCode] as const satisfies NavItem;

const workflowItems = [
  ["/machine-loans", "Mượn – Trả", Handshake],
  ["/transfers", "Điều chuyển", ArrowLeftRight],
  ["/repairs", "Sửa chữa", Wrench],
  ["/disposals", "Thanh lý", Recycle],
  ["/losses", "Báo mất", SearchX],
] as const satisfies readonly NavItem[];

/** Mục menu nào hiện số "việc chờ tôi". */
const TASK_SECTION_BY_HREF: Record<string, TaskSection> = {
  "/machine-loans": "loans",
  "/transfers": "transfers",
  "/repairs": "repairs",
  "/disposals": "disposals",
  "/losses": "losses",
  "/inventory": "inventory",
};

const reportsItem = ["/reports", "Báo cáo", BarChart3] as const satisfies NavItem;
const activitiesItem = ["/activities", "Lịch sử hoạt động", Activity] as const satisfies NavItem;

function initials(name: string) {
  return name.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase()).join("") || "XS";
}

export function Sidebar({ auth, taskCounts = EMPTY_TASK_COUNTS }: { auth: AuthContext; taskCounts?: Record<TaskSection, number> }) {
  const pathname = usePathname();
  const roleLabel = getRoleSummary(auth);
  const canUseGroupWorkflows = !auth.isReadOnlyViewer && (auth.isWorkshopAdmin || hasAnyGroupPermission(auth));
  const canTransfer = !auth.isReadOnlyViewer && (auth.isWorkshopAdmin || hasManagerGroupPermission(auth));
  const canReportLoss = !auth.isReadOnlyViewer && (auth.isWorkshopAdmin || auth.permissions.some((permission) => permission.level !== "viewer"));
  const canDispose = !auth.isReadOnlyViewer && (auth.isWorkshopAdmin || hasManagerGroupPermission(auth));

  // "Báo cáo" tổng hợp toàn Xưởng chỉ cho vai trò xem toàn Xưởng; "Lịch sử hoạt động"
  // hiện cho mọi người nhưng nội dung đã được lọc theo nhóm ở trang.
  const insightItems: readonly NavItem[] = canViewWholeWorkshop(auth)
    ? [reportsItem, activitiesItem]
    : [activitiesItem];

  const visibleOperationItems: readonly NavItem[] = [
    ...operationItems.filter(([href]) => href !== "/my-equipment" || (!auth.isReadOnlyViewer && (auth.isWorkshopAdmin || hasAnyGroupPermission(auth)))),
    ...(canPrintLabels(auth) ? [labelsItem] : []),
  ];
  const visibleWorkflowItems = workflowItems.filter(([href]) => {
    if (href === "/transfers") return canTransfer;
    if (href === "/disposals") return canDispose;
    if (href === "/losses") return canReportLoss;
    if (["/machine-loans", "/repairs"].includes(href)) return canUseGroupWorkflows;
    return false;
  });

  const renderGroup = (label: string, items: readonly NavItem[]) => (
    <div className="nav-section" key={label}>
      <p className="nav-section-label">{label}</p>
      <div className="nav-section-list">
        {items.map(([href, itemLabel, Icon]) => {
          const active = isActivePath(pathname, href);
          const section = TASK_SECTION_BY_HREF[href];
          const pending = section ? taskCounts[section] : 0;
          return (
            <Link href={href} key={href} className={cn("nav-link", active && "is-active")} aria-current={active ? "page" : undefined}>
              <span className="nav-icon"><Icon size={18} strokeWidth={1.9} aria-hidden="true" /></span>
              <span className="nav-label">{itemLabel}</span>
              {pending > 0 ? <span className="nav-badge" title={`${pending} việc chờ bạn xử lý`} aria-label={`${pending} việc chờ bạn xử lý`}>{formatBadge(pending)}</span> : null}
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
        {renderGroup("TỔNG QUAN", visibleOperationItems)}
        {visibleWorkflowItems.length ? renderGroup("NGHIỆP VỤ", visibleWorkflowItems) : null}
        {renderGroup("THEO DÕI", insightItems)}
        {auth.isAdmin ? renderGroup("QUẢN TRỊ", [
          ["/groups", "Cơ cấu nhóm Xưởng", Network],
          ["/users", "Người dùng & phân quyền", ShieldCheck],
          ["/import", "Nhập dữ liệu", FileSpreadsheet],
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
