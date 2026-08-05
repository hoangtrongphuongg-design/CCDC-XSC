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
        <div className="stat-icon"><Icon size={20} strokeWidth={2} aria-hidden="true" /></div>
        <ArrowUpRight className="stat-corner" size={16} aria-hidden="true" />
      </div>
      <div className="stat-copy">
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{note || "Dữ liệu cập nhật theo hệ thống"}</small>
      </div>
    </Card>
  );
}
