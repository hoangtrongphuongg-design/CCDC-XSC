import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function StatCard({ title, value, note, icon: Icon }: { title: string; value: string | number; note?: string; icon: LucideIcon }) {
  return (
    <Card className="stat-card">
      <div className="stat-icon"><Icon size={20} aria-hidden="true" /></div>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        {note ? <small>{note}</small> : null}
      </div>
    </Card>
  );
}
