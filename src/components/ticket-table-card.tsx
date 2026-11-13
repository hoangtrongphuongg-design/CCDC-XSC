import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Khung một bảng phiếu trên các trang nghiệp vụ: tiêu đề + số phiếu. Mỗi trang dùng hai khung:
 * "Chờ xử lý" (phiếu đang mở, có cột Thao tác) và "Đã hoàn thành" (phiếu đã đóng, không có Thao tác).
 */
export function TicketTableCard({ id, title, count, tone = "open", children }: { id?: string; title: string; count: number; tone?: "open" | "done"; children: React.ReactNode }) {
  return (
    <Card className={`table-card ticket-table is-${tone}`} id={id}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <span className="ticket-count" aria-label={`${count} phiếu`}>{count}</span>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
