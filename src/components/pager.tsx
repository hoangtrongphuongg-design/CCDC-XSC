import Link from "next/link";
import { pageWindow, type PageInfo } from "@/lib/pagination";
import { cn } from "@/lib/utils";

/** Thanh phân trang: « 1 2 … 25 » + "Hiển thị 1–50 / 1.240". `hrefFor` dựng liên kết giữ nguyên bộ lọc. */
export function Pager({ info, hrefFor, unit }: { info: PageInfo; hrefFor: (page: number) => string; unit: string }) {
  if (info.total === 0) return null;
  return (
    <div className="pager">
      <span className="pager-range">Hiển thị <b>{info.from.toLocaleString("vi-VN")}–{info.to.toLocaleString("vi-VN")}</b> / {info.total.toLocaleString("vi-VN")} {unit}</span>
      {info.pageCount > 1 ? (
        <nav className="pager-pages" aria-label="Phân trang">
          {info.page > 1 ? <Link href={hrefFor(info.page - 1)} aria-label="Trang trước">«</Link> : <span className="is-disabled">«</span>}
          {pageWindow(info.page, info.pageCount).map((page, index) => page === null
            ? <span key={`gap-${index}`} className="is-gap">…</span>
            : <Link key={page} href={hrefFor(page)} className={cn(page === info.page && "is-active")} aria-current={page === info.page ? "page" : undefined}>{page}</Link>)}
          {info.page < info.pageCount ? <Link href={hrefFor(info.page + 1)} aria-label="Trang sau">»</Link> : <span className="is-disabled">»</span>}
        </nav>
      ) : null}
    </div>
  );
}
