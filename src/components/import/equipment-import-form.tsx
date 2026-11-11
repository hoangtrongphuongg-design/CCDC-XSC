"use client";

import Link from "next/link";
import { useActionState, useRef, useState, startTransition } from "react";
import { CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { importEquipmentAction, type ImportPreviewRow, type ImportState } from "@/actions/import";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATE_LABEL: Record<ImportPreviewRow["state"], string> = { ok: "Hợp lệ", skip: "Bỏ qua (trùng)", error: "Lỗi" };
const initialState: ImportState = { status: "idle" };

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/**
 * Hai bước trong một màn: Kiểm tra → Nhập. File giữ trong state (không dựa vào ô input vì React
 * làm sạch form sau mỗi action) và gửi lại cả khi kiểm tra lẫn khi nhập; server kiểm tra lại
 * với dữ liệu mới nhất trước khi ghi.
 */
export function EquipmentImportForm() {
  const [state, formAction, pending] = useActionState(importEquipmentAction, initialState);
  const [file, setFile] = useState<File | null>(null);
  const checkedKey = useRef<string | null>(null);
  const [filter, setFilter] = useState<"all" | ImportPreviewRow["state"]>("all");

  function submit(mode: "check" | "commit") {
    if (!file) return;
    if (mode === "commit" && !window.confirm(`Nhập ${state.summary?.ok ?? 0} máy vào hệ thống? Việc này tạo máy mới và không tự hoàn tác được.`)) return;
    const data = new FormData();
    data.set("file", file);
    data.set("mode", mode);
    if (mode === "check") checkedKey.current = fileKey(file);
    setFilter("all");
    startTransition(() => formAction(data));
  }

  const summary = state.summary;
  const stale = Boolean(file && checkedKey.current !== fileKey(file));
  const canCommit = state.status === "checked" && Boolean(summary) && summary!.error === 0 && summary!.ok > 0 && !stale && !pending;
  const rows = (state.rows ?? []).filter((row) => filter === "all" || row.state === filter);

  return (
    <Card>
      <CardHeader><CardTitle>Tải file lên</CardTitle><FileSpreadsheet size={18} /></CardHeader>
      <CardContent>
        <div className="import-picker">
          <label className="import-file">
            <Upload size={16} />
            <span>{file ? file.name : "Chọn file Excel (.xlsx)"}</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={pending}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <Button type="button" variant="secondary" disabled={!file || pending} onClick={() => submit("check")}>
            {pending && state.status !== "checked" ? "Đang xử lý…" : "Kiểm tra file"}
          </Button>
          <Button type="button" disabled={!canCommit} onClick={() => submit("commit")}>
            {summary && summary.ok > 0 ? `Nhập ${summary.ok} máy vào hệ thống` : "Nhập vào hệ thống"}
          </Button>
        </div>

        {stale && state.status === "checked" ? <p className="notice warning">Bạn đã đổi file sau lần kiểm tra — hãy bấm “Kiểm tra file” lại.</p> : null}
        {state.status === "error" ? <p className="notice danger" role="alert">{state.message}</p> : null}

        {state.status === "imported" ? (
          <div className="notice success" role="status">
            <CheckCircle2 size={16} /> <b>{state.message}</b>{summary?.skip ? ` Bỏ qua ${summary.skip} dòng trùng.` : ""}{" "}
            <Link href="/equipment">Xem danh sách dụng cụ toàn xưởng</Link>
          </div>
        ) : null}

        {state.status === "checked" ? <p className={summary?.error ? "notice danger" : "notice success"} role="status">{state.message}</p> : null}

        {summary ? (
          <>
            <div className="import-summary" role="group" aria-label="Lọc kết quả">
              <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>Tất cả <b>{summary.total}</b></button>
              <button type="button" className={filter === "ok" ? "is-active" : ""} onClick={() => setFilter("ok")}>Hợp lệ <b>{summary.ok}</b></button>
              <button type="button" className={filter === "skip" ? "is-active" : ""} onClick={() => setFilter("skip")}>Bỏ qua (trùng) <b>{summary.skip}</b></button>
              <button type="button" className={filter === "error" ? "is-active is-error" : "is-error"} onClick={() => setFilter("error")}>Lỗi <b>{summary.error}</b></button>
            </div>
            <div className="import-rows">
              {rows.map((row) => (
                <div className="import-row" data-state={row.state} key={row.rowNumber}>
                  <span className="import-row-no">Dòng {row.rowNumber}</span>
                  <span className="import-row-state">{STATE_LABEL[row.state]}</span>
                  <div className="import-row-main">
                    <strong>{row.name || "(chưa có tên)"}</strong>
                    <span>{[row.group, row.type, row.legacyCode && `Tem nhôm ${row.legacyCode}`, row.serial && `Serial ${row.serial}`].filter(Boolean).join(" · ")}</span>
                    {row.messages.map((message) => <small key={message}>{message}</small>)}
                  </div>
                </div>
              ))}
              {!rows.length ? <p className="muted">Không có dòng nào ở mục này.</p> : null}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
