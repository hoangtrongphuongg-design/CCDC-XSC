"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Gauge, Handshake, Plus, UserRound } from "lucide-react";
import type { AuthContext } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export function MobileNav({ auth }: { auth: AuthContext }) {
  const pathname = usePathname();
  const canBorrow = !auth.isReadOnlyViewer && (auth.isWorkshopAdmin || auth.permissions.length > 0);
  const items = [
    ["/dashboard", "Trang chủ", Gauge, false],
    [auth.isReadOnlyViewer ? "/equipment" : "/my-equipment", "Dụng cụ", Boxes, false],
    ...(canBorrow ? [["/machine-loans", "", Plus, true], ["/machine-loans", "Phiếu mượn", Handshake, false]] as const : []),
    ["/profile", "Cá nhân", UserRound, false],
  ] as const;

  return (
    <nav className="mobile-nav" aria-label="Điều hướng điện thoại">
      {items.map(([href, label, Icon, primary], index) => {
        const active = !primary && (pathname === href || pathname.startsWith(`${href}/`));
        return (
          <Link href={href} key={`${href}-${index}`} className={cn(primary && "is-primary-action", active && "is-active")} aria-current={active ? "page" : undefined} aria-label={primary ? "Tạo phiếu mượn" : label}>
            <span className="mobile-nav-icon"><Icon size={primary ? 24 : 20} strokeWidth={2} /></span>
            {label ? <span>{label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
