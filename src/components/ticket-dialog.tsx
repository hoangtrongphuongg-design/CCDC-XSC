"use client";

import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TicketState } from "@/lib/ticket-state";

const initialState: TicketState = { status: "idle" };

/**
 * Nút đỏ nổi "Tạo phiếu …" (cuộn theo trang) + cửa sổ nhập phiếu. Nút gửi trong cửa sổ giữ màu xanh thương hiệu.
 * `action` là bộ bọc trong `actions/ticket-forms.ts` (trả lỗi dạng dữ liệu). Gửi xong thành công thì đóng cửa sổ;
 * thông báo "Đã tạo phiếu thành công" hiện qua flash message do hành động tạo phiếu ghi. Lỗi thì hiện ngay trong
 * cửa sổ và GIỮ nguyên dữ liệu đã nhập (không dùng `<form action>` vì React 19 tự xóa ô sau khi gửi).
 * `slot` (0, 1…) xếp chồng nhiều nút trên cùng một trang (Thanh lý có hai loại).
 */
export function TicketDialog({
  buttonLabel,
  title,
  submitLabel,
  action,
  defaultOpen = false,
  slot = 0,
  submitDisabled = false,
  variant = "fab",
  children,
}: {
  buttonLabel: string;
  title: string;
  submitLabel: string;
  action: (prev: TicketState, formData: FormData) => Promise<TicketState>;
  defaultOpen?: boolean;
  slot?: number;
  /** Khóa nút gửi khi chưa có gì để chọn (cửa sổ chỉ hiện lời giải thích). */
  submitDisabled?: boolean;
  /** "fab" = nút đỏ nổi ngoài trang; "inline" = nút nhỏ đặt ngay trong dòng (vd "Báo mất" ở danh sách kiểm kê). */
  variant?: "fab" | "inline";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, run, pending] = useActionState(action, initialState);
  const lastHandled = useRef<TicketState | null>(null);

  useEffect(() => {
    if (state.status === "success" && lastHandled.current !== state) {
      lastHandled.current = state;
      setOpen(false);
    }
  }, [state]);

  // Lỗi của lần gửi trước không hiện lại khi mở cửa sổ lần sau.
  const [dismissed, setDismissed] = useState<TicketState | null>(null);
  const close = () => { if (!pending) { setDismissed(state); setOpen(false); } };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !pending) { setDismissed(state); setOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, state]);

  return (
    <>
      {variant === "inline" ? (
        <button type="button" className="ticket-inline-btn" onClick={() => setOpen(true)}>{buttonLabel}</button>
      ) : (
        <button
          type="button"
          className="ticket-fab"
          style={{ "--ticket-slot": slot } as React.CSSProperties}
          onClick={() => setOpen(true)}
        >
          <Plus size={18} aria-hidden="true" />
          <span>{buttonLabel}</span>
        </button>
      )}
      {open ? (
        <div className="asset-modal-backdrop ticket-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section className="asset-modal ticket-modal" role="dialog" aria-modal="true" aria-label={title}>
            <header className="asset-modal-header">
              <div><span className="modal-kicker">TẠO PHIẾU</span><h2>{title}</h2></div>
              <button type="button" className="icon-button" onClick={close} aria-label="Đóng"><X size={18} /></button>
            </header>
            <form
              className="asset-modal-body ticket-form"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                startTransition(() => run(formData));
              }}
            >
              <div className="ticket-fields form-grid">{children}</div>
              {state.status === "error" && state.message && state !== dismissed ? (
                <p className="ticket-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /> {state.message}</p>
              ) : null}
              <div className="ticket-actions">
                <Button type="button" variant="secondary" onClick={close} disabled={pending}>Hủy</Button>
                <Button type="submit" disabled={pending || submitDisabled}>{pending ? "Đang gửi…" : submitLabel}</Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
