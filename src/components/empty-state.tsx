import { Inbox } from "lucide-react";

export function EmptyState({ title = "Chưa có dữ liệu", description }: { title?: string; description?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon"><Inbox size={24} aria-hidden="true" /></div>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
