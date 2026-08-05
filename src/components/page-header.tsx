import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="page-header" data-slot="page-header">
      <div className="page-heading-copy">
        <div className="page-eyebrow"><span /> QUẢN LÝ CCDC · XƯỞNG SỬA CHỮA</div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
