"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Check, Undo2, X } from "lucide-react";
import { checkInventoryItemAction } from "@/actions/inventory";
import {
  INVENTORY_RESULT_LABELS,
  filterChecklist,
  sectionOf,
  summarizeInventory,
  type ChecklistFilter,
  type ChecklistItem,
  type InventoryResult,
} from "@/lib/inventory";

type Item = ChecklistItem & { note: string | null };

const FILTERS: Array<{ key: ChecklistFilter; label: string }> = [
  { key: "pending", label: "Cần kiểm" },
  { key: "missing", label: "Không thấy" },
  { key: "found", label: "Có mặt" },
  { key: "offsite", label: "Nơi khác" },
  { key: "unexpected", label: "Thừa" },
  { key: "all", label: "Tất cả" },
];

/**
 * Danh sách kiểm kê dùng trên điện thoại: bấm "Có mặt" / "Không thấy" cho từng máy; cập nhật ngay trên
 * màn hình (lạc quan) và hoàn lại nếu máy chủ từ chối (đợt đã đóng, mất quyền…).
 */
export function InventoryChecklist({ sessionId, items, canCheck, open }: { sessionId: string; items: Item[]; canCheck: boolean; open: boolean }) {
  const [rows, setRows] = useState<Item[]>(items);
  const [filter, setFilter] = useState<ChecklistFilter>("pending");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const summary = useMemo(() => summarizeInventory(rows), [rows]);
  const counts = useMemo(() => {
    const result: Record<ChecklistFilter, number> = { pending: 0, missing: 0, found: 0, offsite: 0, unexpected: 0, all: rows.length };
    for (const row of rows) result[sectionOf(row)] += 1;
    return result;
  }, [rows]);
  const visible = useMemo(() => filterChecklist(rows, filter, query), [rows, filter, query]);

  function mark(item: Item, result: InventoryResult | null) {
    let note: string | null = null;
    if (result === "missing") {
      const typed = window.prompt(`Ghi chú cho ${item.code} (có thể bỏ trống):`, "");
      if (typed === null) return; // người dùng hủy
      note = typed;
    }
    setError(null);
    setBusyId(item.equipmentId);
    const previous = rows;
    setRows((current) => current.map((row) => (row.equipmentId === item.equipmentId ? { ...row, result, note: result === "missing" ? note?.trim() || null : null } : row)));
    startTransition(async () => {
      const outcome = await checkInventoryItemAction({ sessionId, equipmentId: item.equipmentId, result, note });
      if (!outcome.ok) {
        setRows(previous);
        setError(outcome.message);
      }
      setBusyId(null);
    });
  }

  return (
    <div className="inventory-checklist">
      <div className="inventory-sticky">
        <div className="inventory-progress">
          <strong>{summary.checkedOnsite}/{summary.onsite}</strong>
          <span>máy đã kiểm ({summary.progress}%)</span>
          <span className="inventory-progress-detail">{summary.found} có mặt · <b className={summary.missing ? "inventory-missing" : ""}>{summary.missing} không thấy</b>{summary.unexpected ? ` · ${summary.unexpected} thừa` : ""}</span>
        </div>
        <div className="inventory-bar" aria-hidden="true"><i style={{ width: `${summary.progress}%` }} /></div>
        <input
          className="inventory-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm mã, tem nhôm, tên máy…"
          aria-label="Tìm trong danh sách kiểm kê"
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
      {!open ? <p className="notice warning">Đợt kiểm kê đã đóng — kết quả chỉ để xem.</p> : null}
      {open && !canCheck ? <p className="notice warning">Bạn chỉ có quyền xem đợt kiểm kê này.</p> : null}

      <div className="inventory-items">
        {visible.map((item) => (
          <article className="inventory-item" key={item.equipmentId} data-result={item.result ?? "none"} data-offsite={item.offsite ? "1" : "0"}>
            <div className="inventory-item-main">
              <Link href={`/equipment/${item.equipmentId}`}><strong>{item.code}</strong></Link>
              {item.legacyCode ? <span className="inventory-legacy">Tem nhôm {item.legacyCode}</span> : null}
              <span className="inventory-name">{item.name}</span>
              <small>{item.type}</small>
              {item.expectedNote ? <small className="inventory-expected">{item.expectedNote}</small> : null}
              {item.result === "missing" && item.note ? <small className="inventory-expected">Ghi chú: {item.note}</small> : null}
            </div>
            {canCheck ? (
              <div className="inventory-actions">
                {item.result ? (
                  <>
                    <span className={`inventory-result is-${item.result}`}>{INVENTORY_RESULT_LABELS[item.result]}</span>
                    <button type="button" className="inventory-undo" disabled={busyId === item.equipmentId} onClick={() => mark(item, null)}><Undo2 size={14} /> Hoàn tác</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="inventory-btn is-found" disabled={busyId === item.equipmentId} onClick={() => mark(item, "found")}><Check size={18} /> Có mặt</button>
                    <button type="button" className="inventory-btn is-missing" disabled={busyId === item.equipmentId} onClick={() => mark(item, "missing")}><X size={18} /> Không thấy</button>
                  </>
                )}
              </div>
            ) : item.result ? <span className={`inventory-result is-${item.result}`}>{INVENTORY_RESULT_LABELS[item.result]}</span> : null}
          </article>
        ))}
        {!visible.length ? <p className="muted inventory-empty">{rows.length ? "Không có máy nào ở mục này." : "Đợt kiểm kê chưa có máy nào."}</p> : null}
      </div>
    </div>
  );
}
