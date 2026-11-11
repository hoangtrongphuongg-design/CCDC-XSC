import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "machine", href: "/machine-loans", label: "Máy có mã" },
  { key: "quick", href: "/quick-loans", label: "CCDC lặt vặt" },
] as const;

/** Thanh chuyển giữa hai loại Mượn – Trả (máy có mã / CCDC lặt vặt), dùng chung cho hai trang. */
export function LoanTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="loan-tabs" aria-label="Chọn kiểu mượn">
      {TABS.map((tab) => (
        <Link key={tab.key} href={tab.href} className={cn(active === tab.key && "is-active")} aria-current={active === tab.key ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
