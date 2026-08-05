import Link from "next/link";
import { ArrowLeftRight, Boxes, Gauge, Handshake, Zap } from "lucide-react";
import type { AuthContext } from "@/lib/auth/session";

const items = [
  ["/dashboard", "Trang chủ", Gauge],
  ["/equipment", "Dụng cụ", Boxes],
  ["/quick-loans", "Mượn nhanh", Zap],
  ["/machine-loans", "Mượn máy", Handshake],
  ["/transfers", "Điều chuyển", ArrowLeftRight],
] as const;

export function MobileNav({ auth }: { auth: AuthContext }) {
  void auth;
  return (
    <nav className="mobile-nav" aria-label="Điều hướng điện thoại">
      {items.map(([href, label, Icon]) => <Link href={href} key={href}><Icon size={20} /><span>{label}</span></Link>)}
    </nav>
  );
}
