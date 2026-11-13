import Link from "next/link";
import { cn } from "@/lib/utils";
import type { EquipmentTab } from "@/lib/equipment-filter";

const TABS: Array<{ key: EquipmentTab; label: string }> = [
  { key: "machines", label: "Máy có mã" },
  { key: "tools", label: "CCDC theo số lượng" },
  { key: "disposal", label: "Thanh lý" },
  { key: "lost", label: "Đã mất" },
];

/** Tab của Dụng cụ toàn xưởng (kèm số lượng): Máy có mã | CCDC theo số lượng | Thanh lý | Đã mất; chỉ một bảng hiện một lúc. */
export function EquipmentTabs({ active, counts, hrefFor }: {
  active: EquipmentTab;
  counts: Record<EquipmentTab, number>;
  hrefFor: (tab: EquipmentTab) => string;
}) {
  return (
    <nav className="loan-tabs equipment-tabs" aria-label="Chọn loại dụng cụ">
      {TABS.map((tab) => (
        <Link key={tab.key} href={hrefFor(tab.key)} className={cn(active === tab.key && "is-active")} aria-current={active === tab.key ? "page" : undefined}>
          {tab.label} <b>{counts[tab.key]}</b>
        </Link>
      ))}
    </nav>
  );
}
