import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Thanh "Xuất Excel" ở đầu trang nghiệp vụ: form GET tới route tải file (trình duyệt tải về, trang giữ nguyên).
 * Để trống hai ô ngày = toàn bộ phiếu. Chỉ render cho Quản lý Xưởng / Admin; route tự kiểm quyền lại.
 */
export function ExportBar({ action, buttonLabel, fromLabel }: { action: string; buttonLabel: string; fromLabel: string }) {
  return (
    <form className="repair-export-bar" action={action} method="get">
      <label>{fromLabel}<input type="date" name="from" /></label>
      <label>Đến ngày<input type="date" name="to" /></label>
      <Button type="submit" variant="secondary"><FileSpreadsheet size={16} aria-hidden="true" /> {buttonLabel}</Button>
    </form>
  );
}
