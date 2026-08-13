"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Boxes, CheckCircle2, Gauge, Handshake, Plus, UserRound, XCircle } from "lucide-react";
import type { AuthContext, FlashMessage } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export function MobileNav({ auth, flash }: { auth: AuthContext; flash?: FlashMessage | null }) {
  const [toast, setToast] = useState<FlashMessage | null>(flash || null);

  useEffect(() => {
    if (!flash) return;
    setToast(flash);
    document.cookie = "ccdc_xsc_flash=; Max-Age=0; path=/; SameSite=Lax";
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [flash?.id]);
  const pathname = usePathname();
  const canBorrow = !auth.isReadOnlyViewer && (auth.isWorkshopAdmin || auth.permissions.length > 0);
  const items = [
    ["/dashboard", "Trang chủ", Gauge, false],
    [auth.isReadOnlyViewer ? "/equipment" : "/my-equipment", "CCDC", Boxes, false],
    ...(canBorrow ? [["/dashboard#mobile-actions", "", Plus, true], ["/machine-loans", "Mượn/Trả", Handshake, false]] as const : []),
    ["/profile", "Cá nhân", UserRound, false],
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
    <nav className="mobile-nav" aria-label="Điều hướng điện thoại">
      {items.map(([href, label, Icon, primary], index) => {
        const active = !primary && (pathname === href || pathname.startsWith(`${href}/`));
        return (
          <Link href={href} key={`${href}-${index}`} className={cn(primary && "is-primary-action", active && "is-active")} aria-current={active ? "page" : undefined} aria-label={primary ? "Thao tác nhanh" : label}>
            <span className="mobile-nav-icon"><Icon size={primary ? 24 : 20} strokeWidth={2} /></span>
            {label ? <span>{label}</span> : null}
          </Link>
        );
      })}
    </nav>
    </>
  );
}
