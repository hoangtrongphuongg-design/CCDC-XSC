"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { countInventoryToolAction } from "@/actions/inventory";
import { submitToolLoss } from "@/actions/ticket-forms";
import { TicketDialog } from "@/components/ticket-dialog";
import { FormField } from "@/components/ui/form-field";
import {
  TOOL_COUNT_LABELS,
  countToolFilters,
  filterToolRows,
  parseCountedQty,
  summarizeToolCounts,
  toolCountDiff,
  toolCountDrifted,
  toolCountState,
  type ToolCountState,
  type ToolFilter,
} from "@/lib/inventory";

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
  checkedByName: string | null;
  /** ISO — thời điểm đếm. */
  checkedAt: string | null;
  lossQuantity: number | null;
  lossStatus: "pending_ws" | "completed" | null;
};

const FILTERS: Array<{ key: ToolFilter; label: string }> = [
  { key: "pending", label: "Cần đếm" },
  { key: "short", label: "Thiếu" },
  { key: "ok", label: "Đủ" },
  { key: "over", label: "Thừa" },
  { key: "all", label: "Tất cả" },
];

const fmt = (value: number) => String(Math.round(value * 100) / 100);
const fmtTime = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/**
 * Khối "CCDC theo số lượng" của đợt kiểm kê: nhập số đếm thực tế cho từng CCDC; so với số hệ thống TẠI LÚC ĐẾM.
 * Thiếu → nút "Báo mất" (điền sẵn số thiếu); thừa → nhắc dùng "Hiệu chỉnh SL" ở Dụng cụ nhóm tôi.
 * Có tab lọc (Cần đếm / Thiếu / Đủ / Thừa) + ô tìm; Enter lưu và nhảy sang ô đếm kế tiếp.
 */
export function InventoryToolCounts({ sessionId, tools, canCheck, canReportLoss, open }: { sessionId: string; tools: ToolCountItem[]; canCheck: boolean; canReportLoss: boolean; open: boolean }) {
  const [rows, setRows] = useState<ToolCountItem[]>(tools);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<ToolFilter>(() => (tools.some((t) => t.counted === null) ? "pending" : "all"));
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Sau khi tạo phiếu báo mất (hoặc người khác đếm), trang tải lại: cập nhật huy hiệu báo mất, số hệ thống, người đếm; giữ số đang nhập.
  useEffect(() => {
    setRows((current) => current.map((row) => {
      const fresh = tools.find((tool) => tool.toolId === row.toolId);
      return fresh ? { ...row, lossQuantity: fresh.lossQuantity, lossStatus: fresh.lossStatus, onHand: fresh.onHand } : row;
    }));
  }, [tools]);

  const summary = useMemo(() => summarizeToolCounts(rows), [rows]);
  const counts = useMemo(() => countToolFilters(rows), [rows]);
  const visible = useMemo(() => filterToolRows(rows, filter, query), [rows, filter, query]);

  function save(row: ToolCountItem, counted: number | null) {
    setError(null);
    setBusyId(row.toolId);
    const previous = rows;
    setRows((current) => current.map((r) => (r.toolId === row.toolId
      ? { ...r, counted, expected: counted === null ? null : r.onHand, checkedAt: counted === null ? null : new Date().toISOString(), checkedByName: counted === null ? null : "Bạn" }
      : r)));
    startTransition(async () => {
      const outcome = await countInventoryToolAction({ sessionId, toolId: row.toolId, counted });
      if (!outcome.ok) {
        setRows(previous);
        setError(outcome.message);
      }
      setBusyId(null);
    });
  }

  function submitDraft(row: ToolCountItem, index: number) {
    const parsed = parseCountedQty(drafts[row.toolId] ?? "");
    if (!parsed.ok) { setError(parsed.message); return; }
    // Ô kế tiếp trong danh sách ĐANG HIỆN (tính trước khi dòng này đổi tab lọc).
    const nextId = visible[index + 1]?.toolId;
    save(row, parsed.value);
    setDrafts((current) => { const next = { ...current }; delete next[row.toolId]; return next; });
    if (nextId) window.setTimeout(() => inputs.current[nextId]?.focus(), 0);
  }

  return (
    <section className="inventory-tools" aria-label="Kiểm kê CCDC theo số lượng">
      <div className="inventory-sticky">
        <div className="inventory-progress">
          <strong>{summary.counted}/{summary.total}</strong>
          <span>CCDC đã đếm ({summary.progress}%)</span>
          <span className="inventory-progress-detail">{summary.ok} đủ · <b className={summary.short ? "inventory-missing" : ""}>{summary.short} thiếu</b> · {summary.over} thừa</span>
        </div>
        <div className="inventory-bar" aria-hidden="true"><i style={{ width: `${summary.progress}%` }} /></div>
        <input
          className="inventory-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm mã, tên, quy cách CCDC…"
          aria-label="Tìm trong danh sách CCDC theo số lượng"
          autoComplete="off"
        />
        <div className="inventory-tabs" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={filter === f.key ? "is-active" : ""} onClick={() => setFilter(f.key)}>
              {f.label} <b>{counts[f.key]}</b>
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="notice danger" role="alert">{error}</p> : null}
      <div className="inventory-items">
        {visible.map((row, index) => {
          const state: ToolCountState = toolCountState(row);
          const diff = toolCountDiff(row);
          const editable = canCheck && open;
          const drifted = toolCountDrifted(row);
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
                {state !== "pending" && row.checkedAt ? <small className="inventory-tool-meta">Đếm bởi {row.checkedByName ?? "—"} lúc {fmtTime(row.checkedAt)}</small> : null}
                {drifted ? <small className="inventory-tool-drift">Số hệ thống đã đổi từ {fmt(row.expected ?? 0)} sang {fmt(row.onHand)} sau khi đếm — nên đếm lại.</small> : null}
                {row.lossStatus ? <small className="inventory-loss-badge">{row.lossStatus === "completed" ? `Đã duyệt mất ${fmt(row.lossQuantity ?? 0)} ${row.unit}` : `Đã báo mất ${fmt(row.lossQuantity ?? 0)} ${row.unit} — chờ duyệt`}</small> : null}
              </div>
              <div className="inventory-actions">
                {editable ? (
                  <div className="inventory-count-form">
                    <input
                      ref={(element) => { inputs.current[row.toolId] = element; }}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      aria-label={`Số đếm thực tế ${row.name}`}
                      placeholder={row.counted !== null ? fmt(row.counted) : "Đếm"}
                      value={drafts[row.toolId] ?? ""}
                      onChange={(event) => setDrafts((current) => ({ ...current, [row.toolId]: event.target.value }))}
                      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submitDraft(row, index); } }}
                    />
                    <button type="button" className="inventory-btn is-found" disabled={busyId === row.toolId || !(drafts[row.toolId] ?? "").trim()} onClick={() => submitDraft(row, index)}>Lưu</button>
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
        {!visible.length ? <p className="muted inventory-empty">{rows.length ? "Không có CCDC nào ở mục này." : "Nhóm chưa có CCDC theo số lượng nào đang hoạt động."}</p> : null}
      </div>
    </section>
  );
}
