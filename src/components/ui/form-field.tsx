import * as React from "react";
import { cn } from "@/lib/utils";

export function FormField({ label, required, hint, children, className }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("form-field", className)}>
      <span className="form-label">{label}{required ? <span aria-hidden="true"> *</span> : null}</span>
      {children}
      {hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  );
}
