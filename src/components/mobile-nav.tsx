"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Boxes,
  CheckCircle2,
  Gauge,
  Handshake,
  Plus,
  RotateCcw,
  UserRound,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import type { AuthContext, FlashMessage } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export function MobileNav({ auth, flash }: { auth: AuthContext; flash?: FlashMessage | null }) {
  const [toast, setToast] = useState<FlashMessage | null>(flash || null);
  const [quickOpen, setQuickOpen] = useState(false);
  const pathname = usePathname();
  const canOperate = !auth.isReadOnlyViewer && (auth.isWorkshopAdmin || auth.permissions.length > 0);

  useEffect(() => {
    if (!flash) return;
    setToast(flash);
    document.cookie = "ccdc_xsc_flash=; Max-Age=0; path=/; SameSite=Lax";
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [flash?.id]);

  const navItems = [
    ["/dashboard", "Trang chủ", Gauge],
    [auth.isReadOnlyViewer ? "/equipment" : "/my-equipment", "CCDC", Boxes],
    ["/machine-loans", "Mượn/Trả", Handshake],
    ["/profile", "Cá nhân", UserRound],
  ] as const;

  return (
    <>
      {toast ? (
        <div className="app-toast-backdrop" role="presentation" onClick={() => setToast(null)}>
          <div className={`app-toast app-toast-${toast.type}`} role="status" aria-live="polite" onClick={(event) => event.stopPropagation()}>
            <span className="app-toast-icon">{toast.type === "error" ? <XCircle size={34} /> : <CheckCircle2 size={34} />}</span>
            <span className="app-toast-copy"><strong>{toast.message}</strong>{toast.detail ? <small>{toast.detail}</small> : null}</span>
            <button type="button" className="app-toast-close" aria-label="Đóng thông báo" onClick={() => setToast(null)}>Đóng</button>
          </div>
        </div>
      ) : null}

      {quickOpen ? (
        <div className="mobile-quick-sheet-backdrop" role="presentation" onClick={() => setQuickOpen(false)}>
          <section className="mobile-quick-sheet" role="dialog" aria-modal="true" aria-label="Thao tác nhanh" onClick={(event) => event.stopPropagation()}>
            <div className="mobile-quick-sheet-head">
              <div><strong>Thao tác nhanh</strong><small>Chọn việc cần thực hiện</small></div>
              <button type="button" onClick={() => setQuickOpen(false)} aria-label="Đóng"><X size={20} /></button>
            </div>
            <div className="mobile-quick-sheet-actions">
              <Link href="/machine-loans#new-loan" onClick={() => setQuickOpen(false)}>
                <span><Handshake size={21} /></span><div><strong>Mượn CCDC</strong><small>Tạo đề nghị mượn mới</small></div>
              </Link>
              <Link href="/repairs#new-repair" onClick={() => setQuickOpen(false)}>
                <span><Wrench size={21} /></span><div><strong>Báo hỏng</strong><small>Tạo báo hư nhanh</small></div>
              </Link>
              <Link href="/machine-loans#mobile-active-loans" onClick={() => setQuickOpen(false)}>
                <span><RotateCcw size={21} /></span><div><strong>Trả CCDC</strong><small>Chọn CCDC đang mượn để trả</small></div>
              </Link>
            </div>
          </section>
        </div>
      ) : null}

      <nav className="mobile-nav mobile-nav-v2" aria-label="Điều hướng điện thoại">
        {navItems.slice(0, 2).map(([href, label, Icon]) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link href={href} key={href} className={cn(active && "is-active")} aria-current={active ? "page" : undefined}>
              <span className="mobile-nav-icon"><Icon size={20} strokeWidth={2} /></span><span>{label}</span>
            </Link>
          );
        })}

        {canOperate ? (
          <button type="button" className="mobile-nav-quick" onClick={() => setQuickOpen(true)} aria-label="Thao tác nhanh">
            <span className="mobile-nav-icon"><Plus size={25} strokeWidth={2.2} /></span>
          </button>
        ) : <span className="mobile-nav-spacer" aria-hidden="true" />}

        {navItems.slice(2).map(([href, label, Icon]) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link href={href} key={href} className={cn(active && "is-active")} aria-current={active ? "page" : undefined}>
              <span className="mobile-nav-icon"><Icon size={20} strokeWidth={2} /></span><span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
