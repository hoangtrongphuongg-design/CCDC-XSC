/**
 * Phân loại cột bảng theo tiêu đề để `DataTable` chia độ rộng theo nội dung thay vì chia đều
 * (trước đây `table-layout: fixed` làm cột Tên máy bị bó còn cột Tem nhôm / Trạng thái thừa chỗ).
 * Hàm thuần: so khớp tiêu đề không phân biệt hoa/thường và dấu.
 *
 *  - "fit"     : mã, số, ngày ngắn — vừa nội dung, không xuống dòng.
 *  - "status"  : Trạng thái / Tình trạng (huy hiệu) — vừa nội dung nhưng được xuống dòng trong huy hiệu khi thiếu chỗ.
 *  - "wide"    : tên máy / nội dung / lý do — nhận phần rộng nhất, canh trái, được xuống dòng.
 *  - "text"    : nhóm, vị trí, loại… — chữ ngắn đến vừa, canh trái, được xuống dòng.
 *  - "actions" : nút thao tác — bề rộng tối thiểu để nút xếp gọn, nút được xuống hàng.
 */
import { foldText } from "@/lib/global-search";

export type ColumnKind = "fit" | "status" | "wide" | "text" | "actions";
export type ColumnAlign = "left" | "center" | "right";

const WIDE_EXACT = new Set(["may", "vat dung", "ccdc", "nhan vien", "may / ccdc", "ghi chu", "mo ta"]);
const WIDE_PREFIX = ["ten ", "noi dung", "ly do"];

const FIT_EXACT = new Set(["stt", "ma", "phieu", "tem nhom", "serial", "sl", "chi phi", "thang", "han tra", "tinh tu", "ket qua", "may/ccdc", "cap nhat", "thoi gian"]);
// "ma " (mã hệ thống, mã phiếu, mã nhóm), "so " (số phiếu, số lượng), "tre " (trễ (ngày)), "nam " (nằm không (ngày))…
const FIT_PREFIX = ["ma ", "sl ", "so ", "tre ", "nam "];
const STATUS_PREFIX = ["trang thai", "tinh trang"];

export function columnKind(header: string): ColumnKind {
  const key = foldText(header);
  if (key.includes("thao tac")) return "actions";
  if (WIDE_EXACT.has(key) || WIDE_PREFIX.some((prefix) => key.startsWith(prefix))) return "wide";
  if (STATUS_PREFIX.some((prefix) => key.startsWith(prefix))) return "status";
  if (FIT_EXACT.has(key) || FIT_PREFIX.some((prefix) => key.startsWith(prefix))) return "fit";
  return "text";
}

export function alignOf(header: string): ColumnAlign {
  const kind = columnKind(header);
  if (kind === "wide" || kind === "text") return "left";
  return foldText(header) === "chi phi" ? "right" : "center";
}
