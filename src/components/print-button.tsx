"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "In", disabled = false }: { label?: string; disabled?: boolean }) {
  return (
    <button type="button" className="btn btn-primary" disabled={disabled} onClick={() => window.print()}>
      <Printer size={16} aria-hidden="true" /> {label}
    </button>
  );
}
