import type { ReactNode } from "react";
import { alignOf, columnKind } from "@/lib/table-columns";

/**
 * Bảng dữ liệu. Độ rộng cột chia theo loại nội dung (`columnKind` đoán từ tiêu đề): cột mã / ngày /
 * trạng thái vừa chữ, cột tên / nội dung nhận phần còn lại. Trên điện thoại bảng chuyển thành thẻ
 * (xem `.table-wrap td::before` trong globals.css).
 */
export function DataTable({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty?: ReactNode }) {
  if (rows.length === 0) return <>{empty}</>;
  const columns = headers.map((header) => ({ kind: columnKind(header), align: alignOf(header) }));
  return (
    <div className="data-table-shell" data-slot="data-table">
      <div className="table-wrap">
        <table data-sizing="auto">
          <thead><tr>{headers.map((h, index) => <th key={h} data-col={columns[index].kind} data-align={columns[index].align}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, colIndex) => <td key={colIndex} data-label={headers[colIndex]} data-col={columns[colIndex]?.kind} data-align={columns[colIndex]?.align}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-summary">
        <span>Hiển thị <strong>{rows.length}</strong> bản ghi</span>
        <span className="table-summary-status"><i /> Dữ liệu trực tiếp</span>
      </div>
    </div>
  );
}
