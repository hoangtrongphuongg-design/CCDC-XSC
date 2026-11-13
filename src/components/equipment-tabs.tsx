import Link from "next/link";
import { cn } from "@/lib/utils";

/** Tab "Máy có mã | CCDC theo số lượng" của Dụng cụ toàn xưởng (kèm số lượng); chỉ một bảng hiện một lúc. */
export function EquipmentTabs({ active, machinesCount, toolsCount, machinesHref, toolsHref }: {
  active: "machines" | "tools";
  machinesCount: number;
  toolsCount: number;
  machinesHref: string;
  toolsHref: string;
}) {
  return (
    <nav className="loan-tabs equipment-tabs" aria-label="Chọn loại dụng cụ">
      <Link href={machinesHref} className={cn(active === "machines" && "is-active")} aria-current={active === "machines" ? "page" : undefined}>Máy có mã <b>{machinesCount}</b></Link>
      <Link href={toolsHref} className={cn(active === "tools" && "is-active")} aria-current={active === "tools" ? "page" : undefined}>CCDC theo số lượng <b>{toolsCount}</b></Link>
    </nav>
  );
}
