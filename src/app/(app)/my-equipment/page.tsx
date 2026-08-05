import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipment, groups, toolCatalog } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guards";
import { EQUIPMENT_STATUS_LABELS, CONDITION_LABELS } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function MyEquipmentPage() {
  const auth = await requireUser();
  const groupIds = auth.permissions.map((p) => p.groupId);
  const [rows, tools] = groupIds.length
    ? await Promise.all([
        db.select({ code: equipment.code, name: equipment.name, type: equipment.equipmentType, ownerGroup: groups.name, status: equipment.status, condition: equipment.condition, location: equipment.currentLocation })
          .from(equipment).innerJoin(groups, eq(equipment.ownerGroupId, groups.id)).where(inArray(equipment.ownerGroupId, groupIds)).orderBy(asc(equipment.code)),
        db.select({ name: toolCatalog.name, specification: toolCatalog.specification, unit: toolCatalog.unit, quantity: toolCatalog.quantityOnHand, groupName: groups.name })
          .from(toolCatalog).innerJoin(groups, eq(toolCatalog.groupId, groups.id)).where(inArray(toolCatalog.groupId, groupIds)).orderBy(asc(groups.name), asc(toolCatalog.name)),
      ])
    : [[], []] as const;
  return (
    <>
      <PageHeader title="Dụng cụ nhóm tôi" description="Các máy thuộc nhóm mà tài khoản được phân quyền thao tác." />
      <Card className="table-card">
        <CardHeader><CardTitle>{rows.length} máy/CCDC</CardTitle></CardHeader>
        <CardContent>
          <DataTable headers={["Mã", "Tên", "Loại", "Nhóm", "Vị trí", "Tình trạng", "Trạng thái"]} rows={rows.map((r) => [
            <strong key="code">{r.code}</strong>, r.name, r.type, r.ownerGroup, r.location || "—",
            <StatusBadge key="condition" label={CONDITION_LABELS[r.condition]} tone={r.condition === "good" ? "success" : "warning"} />,
            <StatusBadge key="status" label={EQUIPMENT_STATUS_LABELS[r.status]} tone={r.status === "in_use_owner" ? "success" : "info"} />,
          ])} empty={<EmptyState title="Chưa có dụng cụ nhóm" description="Admin cần gán quyền nhóm hoặc import dữ liệu máy." />} />
        </CardContent>
      </Card>
      <Card className="table-card section-gap">
        <CardHeader><CardTitle>{tools.length} dụng cụ nhỏ/không mã</CardTitle></CardHeader>
        <CardContent>
          <DataTable headers={["Tên dụng cụ", "Quy cách", "Nhóm", "Số lượng"]} rows={tools.map((t) => [t.name, t.specification || "—", t.groupName, `${t.quantity} ${t.unit}`])} empty={<EmptyState description="Chưa có dụng cụ nhỏ trong nhóm được phân quyền." />} />
        </CardContent>
      </Card>
    </>
  );
}
