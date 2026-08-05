import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

export function Button({ className, variant = "primary", size = "md", ...props }: Props) {
  return (
    <button
      data-slot="button"
      data-variant={variant}
      className={cn("btn", `btn-${variant}`, `btn-${size}`, className)}
      {...props}
    />
  );
}
