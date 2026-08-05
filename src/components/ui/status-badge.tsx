import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export function StatusBadge({ label, tone = "neutral", className }: { label: string; tone?: Tone; className?: string }) {
  return <span data-slot="status-badge" data-tone={tone} className={cn("status-badge", className)}>{label}</span>;
}
