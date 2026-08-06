import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";

type Tone = "primary" | "success" | "warning" | "danger" | "violet" | "cyan";

export function StatCard({
  title,
  value,
  note,
  icon: Icon,
  tone = "primary",
}: {
  title: string;
  value: string | number;
  note?: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  return (
    <Card className="stat-card" data-tone={tone}>
      <div className="stat-card-top">
        <div className="stat-icon" aria-hidden="true">
          <span className="stat-icon-ring" />
          <Icon size={19} strokeWidth={2} />
        </div>
        <ArrowUpRight className="stat-corner" size={15} aria-hidden="true" />
      </div>
      <div className="stat-copy">
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{note || "Dữ liệu cập nhật theo hệ thống"}</small>
      </div>
    </Card>
  );
}
