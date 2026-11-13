import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { EquipmentTab } from "@/lib/equipment-filter";

const TABS: Array<{ key: EquipmentTab; label: string }> = [
  { key: "machines", label: "Máy có mã" },
  { key: "tools", label: "CCDC số lượng" },
  { key: "disposal", label: "Thanh lý" },
  { key: "lost", label: "Đã mất" },
];

/**
 * Tab của Dụng cụ toàn xưởng trên MỘT hàng: Máy có mã | CCDC số lượng | Thanh lý | Đã mất; số nằm cùng dòng dạng viên nhỏ,
 * tab rỗng hiện mờ. `summary` (vd "Hiển thị 0 / 17 máy" khi đang lọc) nằm bên phải cùng hàng.
 */
export function EquipmentTabs({ active, counts, hrefFor, summary }: {
  active: EquipmentTab;
  counts: Record<EquipmentTab, number>;
  hrefFor: (tab: EquipmentTab) => string;
  summary?: ReactNode;
}) {
  return (
    <div className="equipment-tabs-row">
      <nav className="equipment-tabs" aria-label="Chọn loại dụng cụ">
        {TABS.map((tab) => (
          <Link key={tab.key} href={hrefFor(tab.key)} className={cn(active === tab.key && "is-active", counts[tab.key] === 0 && active !== tab.key && "is-empty")} aria-current={active === tab.key ? "page" : undefined}>
            {tab.label} <b>{counts[tab.key]}</b>
          </Link>
        ))}
      </nav>
      {summary ? <span className="equipment-tabs-summary">{summary}</span> : null}
    </div>
  );
}
