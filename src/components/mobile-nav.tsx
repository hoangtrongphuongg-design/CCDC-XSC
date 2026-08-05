"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Boxes, Gauge, Handshake, Zap } from "lucide-react";
import type { AuthContext } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const items = [
  ["/dashboard", "Tổng quan", Gauge],
  ["/equipment", "Dụng cụ", Boxes],
  ["/quick-loans", "Mượn nhanh", Zap],
  ["/machine-loans", "Mượn máy", Handshake],
  ["/transfers", "Điều chuyển", ArrowLeftRight],
] as const;

export function MobileNav({ auth }: { auth: AuthContext }) {
  void auth;
  const pathname = usePathname();
  return (
    <nav className="mobile-nav" aria-label="Điều hướng điện thoại">
      {items.map(([href, label, Icon]) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link href={href} key={href} className={cn(active && "is-active")} aria-current={active ? "page" : undefined}>
            <span className="mobile-nav-icon"><Icon size={20} strokeWidth={2} /></span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
