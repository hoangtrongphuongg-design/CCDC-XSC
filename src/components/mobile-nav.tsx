"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Gauge, Handshake, Plus, UserRound } from "lucide-react";
import type { AuthContext } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const items = [
  ["/dashboard", "Trang chủ", Gauge],
  ["/my-equipment", "Dụng cụ", Boxes],
  ["/machine-loans", "", Plus],
  ["/machine-loans", "Phiếu mượn", Handshake],
  ["/profile", "Cá nhân", UserRound],
] as const;

export function MobileNav({ auth }: { auth: AuthContext }) {
  void auth;
  const pathname = usePathname();
  return (
    <nav className="mobile-nav" aria-label="Điều hướng điện thoại">
      {items.map(([href, label, Icon], index) => {
        const active = index !== 2 && (pathname === href || pathname.startsWith(`${href}/`));
        return (
          <Link href={href} key={`${href}-${index}`} className={cn(index === 2 && "is-primary-action", active && "is-active")} aria-current={active ? "page" : undefined} aria-label={index === 2 ? "Tạo phiếu mượn" : label}>
            <span className="mobile-nav-icon"><Icon size={index === 2 ? 24 : 20} strokeWidth={2} /></span>
            {label ? <span>{label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
