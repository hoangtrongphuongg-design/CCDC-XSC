import { Inbox } from "lucide-react";

export function EmptyState({ title = "Chưa có dữ liệu", description }: { title?: string; description?: string }) {
  return (
    <div className="empty-state">
      <Inbox size={32} aria-hidden="true" />
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
