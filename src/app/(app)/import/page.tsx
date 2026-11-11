import Link from "next/link";
import { Download } from "lucide-react";
import { EquipmentImportForm } from "@/components/import/equipment-import-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";
import { IMPORT_MAX_ROWS } from "@/lib/import/equipment-import";

export const dynamic = "force-dynamic";
/** Nhập hàng trăm máy trong một transaction cần nhiều thời gian hơn mặc định. */
export const maxDuration = 60;

export default async function ImportPage() {
  await requireAdmin();

  return (
    <div className="import-page">
      <PageHeader
        title="Nhập máy từ Excel"
        description="Nạp danh sách máy có sẵn vào hệ thống một lần, thay vì thêm từng máy bằng tay."
        actions={<a className="btn btn-secondary" href="/import/template"><Download size={16} /> Tải file mẫu</a>}
      />

      <Card>
        <CardHeader><CardTitle>Cách làm</CardTitle></CardHeader>
        <CardContent>
          <ol className="import-steps">
            <li><b>Tải file mẫu</b>, điền mỗi máy một dòng (tối đa {IMPORT_MAX_ROWS} máy/lần, file .xlsx ≤ 2 MB).</li>
            <li>Chọn file rồi bấm <b>Kiểm tra file</b> — hệ thống báo từng dòng hợp lệ, lỗi hay trùng, chưa ghi gì.</li>
            <li>Hết dòng lỗi thì bấm <b>Nhập vào hệ thống</b>. Việc nhập làm một lần: được thì được hết, lỗi thì không nhập gì.</li>
          </ol>
          <p className="muted import-note">
            Chỉ <b>tạo máy mới</b> (mã hệ thống tự cấp). Dòng trùng <b>Tem nhôm</b> hoặc <b>Serial</b> với máy đã có sẽ bị bỏ qua và báo rõ.
            Muốn sửa máy đã có, vào <Link href="/my-equipment">Dụng cụ nhóm tôi</Link>. Chưa hỗ trợ nhập CCDC theo số lượng.
          </p>
        </CardContent>
      </Card>

      <EquipmentImportForm />
    </div>
  );
}
