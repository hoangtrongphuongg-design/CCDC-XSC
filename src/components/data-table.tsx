import type { ReactNode } from "react";

export function DataTable({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty?: ReactNode }) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <div className="data-table-shell" data-slot="data-table">
      <div className="table-wrap">
        <table>
          <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, colIndex) => <td key={colIndex} data-label={headers[colIndex]}>{cell}</td>)}
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
