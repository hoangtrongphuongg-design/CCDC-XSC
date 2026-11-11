/**
 * Mục menu nào sáng ở đường dẫn hiện tại (hàm thuần, dùng được ở client). Một mục có thể gồm
 * nhiều trang: "Mượn – Trả" (`/machine-loans`) cũng sáng khi đang ở Mượn nhanh (`/quick-loans`).
 */
const ACTIVE_ALIASES: Record<string, readonly string[]> = {
  "/machine-loans": ["/quick-loans"],
};

export function isActivePath(pathname: string, href: string): boolean {
  return [href, ...(ACTIVE_ALIASES[href] ?? [])].some((base) => pathname === base || pathname.startsWith(`${base}/`));
}
