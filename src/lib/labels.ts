/**
 * Tem QR dán máy (hàm thuần): lưới A4 3 cột × 8 hàng (tem decal 70 × 37 mm, loại phổ biến),
 * địa chỉ trong mã QR, chia trang, bỏ qua các ô đã dùng trên tờ in dở.
 */
import { isUuid } from "@/lib/machine-profile";

export const LABEL_COLUMNS = 3;
export const LABEL_ROWS = 8;
export const LABELS_PER_PAGE = LABEL_COLUMNS * LABEL_ROWS;
/** Tối đa 10 trang A4 mỗi lần in để trang không quá nặng. */
export const MAX_LABELS = LABELS_PER_PAGE * 10;
export const MAX_IDS = 100;

/**
 * Chỉ lấy phần gốc (https://tên-miền) của địa chỉ người dùng nhập; sai dạng hoặc không phải http(s)
 * thì dùng `fallback`. Tránh in QR trỏ tới địa chỉ lạ do gõ nhầm / chèn đường dẫn.
 */
export function normalizeBaseUrl(input: string | null | undefined, fallback: string): string {
  const text = (input ?? "").trim();
  if (!text) return fallback;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    if (url.username || url.password) return fallback;
    return url.origin;
  } catch {
    return fallback;
  }
}

/** Địa chỉ mặc định theo yêu cầu hiện tại (tên miền đang mở trang; localhost dùng http). */
export function defaultBaseUrl(host: string | null | undefined, forwardedProto: string | null | undefined): string {
  const cleanHost = (host ?? "").split(",")[0].trim();
  if (!cleanHost) return "https://localhost";
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(cleanHost);
  const proto = (forwardedProto ?? "").split(",")[0].trim() || (isLocal ? "http" : "https");
  return normalizeBaseUrl(`${proto}://${cleanHost}`, "https://localhost");
}

/** Chỉ Quản lý Xưởng và Admin in tem QR (Người xem toàn xưởng không, kể cả khi mang cờ Admin). */
export function canPrintLabels(subject: { isAdmin: boolean; isWsManager: boolean; isReadOnlyViewer: boolean }): boolean {
  return (subject.isAdmin || subject.isWsManager) && !subject.isReadOnlyViewer;
}

/**
 * Địa chỉ gốc mặc định của mã QR. Có cấu hình `APP_BASE_URL` (địa chỉ chính thức) thì LUÔN dùng nó, để tem in lại
 * ở đâu cũng ra đúng mã QR cũ; chưa cấu hình thì dùng tên miền đang mở trang như trước. `mismatch` = đang mở trang
 * từ tên miền khác địa chỉ chính thức (vd bản xem thử) — trang hiện cảnh báo.
 */
export function resolveBaseUrl(input: { configured: string | null | undefined; host: string | null | undefined; proto: string | null | undefined }): { baseUrl: string; fromConfig: boolean; mismatch: boolean } {
  const requested = defaultBaseUrl(input.host, input.proto);
  const configured = normalizeBaseUrl(input.configured, "");
  if (!configured) return { baseUrl: requested, fromConfig: false, mismatch: false };
  return { baseUrl: configured, fromConfig: true, mismatch: configured !== requested };
}

export function machineUrl(baseUrl: string, equipmentId: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/equipment/${equipmentId}`;
}

/** Danh sách id máy (phân tách bằng dấu phẩy): chỉ giữ UUID hợp lệ, bỏ trùng, tối đa MAX_IDS. */
export function parseIds(value: string | null | undefined): string[] {
  return [...new Set((value ?? "").split(",").map((part) => part.trim()).filter(isUuid))].slice(0, MAX_IDS);
}

/** Ô bắt đầu (1–24) trên tờ in dở; ngoài khoảng → 1. */
export function parseStart(value: string | null | undefined): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isInteger(n) && n >= 1 && n <= LABELS_PER_PAGE ? n : 1;
}

/** Chia thành các trang 24 ô; `start` > 1 chèn ô trống ở đầu trang đầu (null) để tránh các tem đã bóc. */
export function paginateLabels<T>(items: readonly T[], start = 1): Array<Array<T | null>> {
  const cells: Array<T | null> = [...Array.from({ length: Math.max(0, start - 1) }, () => null), ...items];
  const pages: Array<Array<T | null>> = [];
  for (let index = 0; index < cells.length; index += LABELS_PER_PAGE) pages.push(cells.slice(index, index + LABELS_PER_PAGE));
  return pages;
}
