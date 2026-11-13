"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { countInventoryToolAction } from "@/actions/inventory";
import { submitToolLoss } from "@/actions/ticket-forms";
import { TicketDialog } from "@/components/ticket-dialog";
import { FormField } from "@/components/ui/form-field";
import { TOOL_COUNT_LABELS, summarizeToolCounts, toolCountDiff, toolCountState, parseCountedQty, type ToolCountState } from "@/lib/inventory";

export type ToolCountItem = {
  toolId: string;
  code: string | null;
  name: string;
  specification: string | null;
  unit: string;
  onHand: number;
  counted: number | null;
  expected: number | null;
  note: string | null;
  lossQuantity: number | null;
  lossStatus: "pending_ws" | "completed" | null;
};

const fmt = (value: number) => String(Math.round(value * 100) / 100);

/**
 * Khối "CCDC theo số lượng" của đợt kiểm kê quý: nhập số đếm thực tế cho từng CCDC; so với số hệ thống TẠI LÚC ĐẾM.
 * Thiếu → nút "Báo mất" (điền sẵn số thiếu); thừa → nhắc dùng "Hiệu chỉnh SL" ở Dụng cụ nhóm tôi.
 */
export function InventoryToolCounts({ sessionId, tools, canCheck, canReportLoss, open }: { sessionId: string; tools: ToolCountItem[]; canCheck: boolean; canReportLoss: boolean; open: boolean }) {
  const [rows, setRows] = useState<ToolCountItem[]>(tools);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Sau khi tạo phiếu báo mất, trang tải lại: cập nhật huy hiệu báo mất mà giữ số đang nhập.
  useEffect(() => {
    setRows((current) => current.map((row) => {
      const fresh = tools.find((tool) => tool.toolId === row.toolId);
      return fresh ? { ...row, lossQuantity: fresh.lossQuantity, lossStatus: fresh.lossStatus } : row;
    }));
  }, [tools]);

  const summary = useMemo(() => summarizeToolCounts(rows), [rows]);

  function save(row: ToolCountItem, counted: number | null) {
    setError(null);
    setBusyId(row.toolId);
    const previous = rows;
    setRows((current) => current.map((r) => (r.toolId === row.toolId ? { ...r, counted, expected: counted === null ? null : r.onHand } : r)));
    startTransition(async () => {
      const outcome = await countInventoryToolAction({ sessionId, toolId: row.toolId, counted });
      if (!outcome.ok) {
        setRows(previous);
        setError(outcome.message);
      }
      setBusyId(null);
    });
  }

  function submitDraft(row: ToolCountItem) {
    const parsed = parseCountedQty(drafts[row.toolId] ?? "");
    if (!parsed.ok) { setError(parsed.message); return; }
    save(row, parsed.value);
    setDrafts((current) => { const next = { ...current }; delete next[row.toolId]; return next; });
  }

  return (
    <section className="inventory-tools" aria-label="Kiểm kê CCDC theo số lượng">
      <div className="inventory-progress">
        <strong>{summary.counted}/{summary.total}</strong>
        <span>CCDC theo số lượng đã đếm ({summary.progress}%)</span>
        <span className="inventory-progress-detail">{summary.ok} đủ · <b className={summary.short ? "inventory-missing" : ""}>{summary.short} thiếu</b> · {summary.over} thừa</span>
      </div>
      {error ? <p className="notice danger" role="alert">{error}</p> : null}
      <div className="inventory-items">
        {rows.map((row) => {
          const state: ToolCountState = toolCountState(row);
          const diff = toolCountDiff(row);
          const editable = canCheck && open;
          return (
            <article className="inventory-item inventory-tool" key={row.toolId} data-state={state}>
              <div className="inventory-item-main">
                <strong>{row.code ?? "Không mã"}</strong>
                <span className="inventory-name">{row.name}</span>
                <small>{[row.specification, `Hệ thống: ${fmt(row.onHand)} ${row.unit}`].filter(Boolean).join(" · ")}</small>
                {state !== "pending" ? (
                  <small className={`inventory-tool-result is-${state}`}>
                    Đếm {fmt(row.counted ?? 0)} {row.unit} — {TOOL_COUNT_LABELS[state]}{diff ? ` ${fmt(Math.abs(diff))} ${row.unit}` : ""}
                    {state === "over" ? " (dùng “Hiệu chỉnh SL” ở Dụng cụ nhóm tôi)" : ""}
                  </small>
                ) : null}
                {row.lossStatus ? <small className="inventory-loss-badge">{row.lossStatus === "completed" ? `Đã duyệt mất ${fmt(row.lossQuantity ?? 0)} ${row.unit}` : `Đã báo mất ${fmt(row.lossQuantity ?? 0)} ${row.unit} — chờ duyệt`}</small> : null}
              </div>
              <div className="inventory-actions">
                {editable ? (
                  <div className="inventory-count-form">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      aria-label={`Số đếm thực tế ${row.name}`}
                      placeholder={row.counted !== null ? fmt(row.counted) : "Đếm"}
                      value={drafts[row.toolId] ?? ""}
                      onChange={(event) => setDrafts((current) => ({ ...current, [row.toolId]: event.target.value }))}
                      onKeyDown={(event) => { if (event.key === "Enter") submitDraft(row); }}
                    />
                    <button type="button" className="inventory-btn is-found" disabled={busyId === row.toolId || !(drafts[row.toolId] ?? "").trim()} onClick={() => submitDraft(row)}>Lưu</button>
                    {row.counted !== null ? <button type="button" className="inventory-undo" disabled={busyId === row.toolId} onClick={() => save(row, null)}>Hoàn tác</button> : null}
                  </div>
                ) : null}
                {state === "short" && canReportLoss && !row.lossStatus ? (
                  <TicketDialog
                    variant="inline"
                    buttonLabel={`Báo mất ${fmt(Math.abs(diff ?? 0))}`}
                    title={`Báo mất ${row.name}`}
                    submitLabel="Gửi báo mất"
                    action={submitToolLoss}
                  >
                    <input type="hidden" name="toolId" value={row.toolId} />
                    <input type="hidden" name="sourceSessionId" value={sessionId} />
                    <FormField label={`Số lượng mất (${row.unit})`} required><input name="quantity" type="number" min="0.01" step="0.01" required defaultValue={fmt(Math.abs(diff ?? 0))} /></FormField>
                    <FormField label="Hoàn cảnh mất" required><textarea name="circumstances" required minLength={5} defaultValue={`Thiếu so với hệ thống khi kiểm kê (đếm ${fmt(row.counted ?? 0)}, hệ thống ${fmt(row.expected ?? 0)}).`} /></FormField>
                  </TicketDialog>
                ) : null}
              </div>
            </article>
          );
        })}
        {!rows.length ? <p className="muted inventory-empty">Nhóm chưa có CCDC theo số lượng nào đang hoạt động.</p> : null}
      </div>
    </section>
  );
}
