import { asc, count, eq } from "drizzle-orm";
import { Boxes, Building2, Network, ShieldCheck, UsersRound } from "lucide-react";
import { createGroupAction, setGroupStatusAction, syncStandardGroupsAction, updateGroupNameAction } from "@/actions/groups";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { equipment, groups, users } from "@/lib/db/schema";
import { getGroupCategoryLabel, groupSortOrder, STANDARD_GROUPS } from "@/lib/group-structure";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  await requireAdmin();

  const [groupRows, equipmentCounts, userCounts] = await Promise.all([
    db.select().from(groups).orderBy(asc(groups.name)),
    db
      .select({ groupId: equipment.ownerGroupId, total: count(equipment.id) })
      .from(equipment)
      .groupBy(equipment.ownerGroupId),
    db
      .select({ groupId: users.primaryGroupId, total: count(users.id) })
      .from(users)
      .where(eq(users.accountStatus, "active"))
      .groupBy(users.primaryGroupId),
  ]);

  const equipmentMap = new Map(equipmentCounts.map((row) => [row.groupId, Number(row.total)]));
  const userMap = new Map(userCounts.filter((row) => row.groupId).map((row) => [row.groupId!, Number(row.total)]));
  const rows = [...groupRows].sort((a, b) => {
    const orderDiff = groupSortOrder(a.code) - groupSortOrder(b.code);
    return orderDiff || a.name.localeCompare(b.name, "vi");
  });
  const operationalGroups = rows.filter((group) => !group.isSystem);
  const activeOperationalGroups = operationalGroups.filter((group) => group.isActive);
  const systemGroups = rows.filter((group) => group.isSystem);
  const totalEquipment = equipmentCounts.reduce((sum, row) => sum + Number(row.total), 0);
  const totalUsers = userCounts.reduce((sum, row) => sum + Number(row.total), 0);

  return (
    <>
      <PageHeader
        title="Cơ cấu nhóm Xưởng"
        description="Khai báo nhóm quản lý CCDC, kiểm soát trạng thái sử dụng và tách riêng các nhóm hệ thống. Mã nhóm được giữ cố định để bảo toàn lịch sử dữ liệu."
        actions={
          <form action={syncStandardGroupsAction}>
            <Button type="submit"><Network size={16} /> Đồng bộ 13 nhóm chính thức</Button>
          </form>
        }
      />

      <div className="stat-grid">
        <StatCard title="Nhóm nghiệp vụ đang hoạt động" value={activeOperationalGroups.length} note="8 cơ · 4 điện · 1 nhóm khác" icon={Building2} tone="primary" />
        <StatCard title="Nhóm hệ thống" value={systemGroups.length} note="Được khóa để bảo vệ quy trình" icon={ShieldCheck} tone="violet" />
        <StatCard title="Nhân sự đang hoạt động" value={totalUsers} note="Tính theo nhóm chính của tài khoản" icon={UsersRound} tone="success" />
        <StatCard title="Máy/CCDC đã gán nhóm" value={totalEquipment} note="Tính theo nhóm quản lý hiện tại" icon={Boxes} tone="cyan" />
      </div>

      <div className="content-grid group-management-grid">
        <Card className="table-card">
          <CardHeader>
            <div>
              <CardTitle>Danh sách nhóm quản lý</CardTitle>
              <p className="card-subtitle">Nhóm hệ thống được hiển thị riêng và không thể vô hiệu hóa.</p>
            </div>
            <StatusBadge label={`${rows.length} nhóm`} tone="info" />
          </CardHeader>
          <CardContent>
            <DataTable
              headers={["Nhóm", "Mã cố định", "Khối", "Máy/CCDC", "Nhân sự", "Trạng thái", "Cập nhật"]}
              rows={rows.map((group) => [
                <div key="name" className="group-name-cell">
                  <span className={`group-avatar ${group.isSystem ? "is-system" : ""}`}>{group.code.slice(0, 2)}</span>
                  <div><strong>{group.name}</strong><small>{getGroupCategoryLabel(group.code, group.isSystem)}</small></div>
                </div>,
                <code key="code" className="group-code">{group.code}</code>,
                <StatusBadge key="type" label={getGroupCategoryLabel(group.code, group.isSystem)} tone={group.isSystem ? "warning" : "info"} />,
                <span key="equipment" className="numeric"><strong>{equipmentMap.get(group.id) || 0}</strong></span>,
                <span key="users" className="numeric">{userMap.get(group.id) || 0}</span>,
                <StatusBadge key="status" label={group.isActive ? "Đang hoạt động" : "Ngừng sử dụng"} tone={group.isActive ? "success" : "neutral"} />,
                group.isSystem ? (
                  <span key="locked" className="locked-note"><ShieldCheck size={14} /> Được bảo vệ</span>
                ) : (
                  <div key="actions" className="group-row-actions">
                    <form action={updateGroupNameAction} className="group-inline-form">
                      <input type="hidden" name="groupId" value={group.id} />
                      <input name="name" defaultValue={group.name} aria-label={`Tên nhóm ${group.code}`} maxLength={120} />
                      <Button type="submit" size="sm" variant="secondary">Lưu tên</Button>
                    </form>
                    <form action={setGroupStatusAction}>
                      <input type="hidden" name="groupId" value={group.id} />
                      <input type="hidden" name="isActive" value={String(!group.isActive)} />
                      <Button type="submit" size="sm" variant={group.isActive ? "ghost" : "primary"}>{group.isActive ? "Ngừng dùng" : "Kích hoạt"}</Button>
                    </form>
                  </div>
                ),
              ])}
              empty={<EmptyState description="Chưa có nhóm quản lý nào." />}
            />
          </CardContent>
        </Card>

        <div className="panel-stack">
          <Card className="side-panel">
            <CardHeader><CardTitle>Thêm nhóm nghiệp vụ</CardTitle><Building2 size={18} /></CardHeader>
            <CardContent>
              <p className="panel-description">Chỉ tạo thêm khi cơ cấu thực tế phát sinh nhóm mới. Không tạo lại nhóm đã có mã.</p>
              <form action={createGroupAction} className="form-grid">
                <FormField label="Mã nhóm" required hint="Chữ in hoa, số hoặc dấu gạch dưới. Ví dụ: CO_KHI_2">
                  <input name="code" placeholder="MÃ_NHÓM" minLength={2} maxLength={30} required />
                </FormField>
                <FormField label="Tên hiển thị" required>
                  <input name="name" placeholder="Tên nhóm quản lý" minLength={2} maxLength={120} required />
                </FormField>
                <Button type="submit">Tạo nhóm</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Cơ cấu chuẩn đang áp dụng</CardTitle><Network size={18} /></CardHeader>
            <CardContent>
              <div className="standard-group-list">
                {STANDARD_GROUPS.map((group) => (
                  <div className="standard-group-item" key={group.code}>
                    <span className={`group-avatar ${group.isSystem ? "is-system" : ""}`}>{group.code.slice(0, 2)}</span>
                    <div><strong>{group.name}</strong><small>{group.code}{group.isSystem ? " · nhóm hệ thống" : ""}</small></div>
                    <StatusBadge label={rows.some((row) => row.code === group.code && row.isActive) ? "Đã có" : "Thiếu"} tone={rows.some((row) => row.code === group.code && row.isActive) ? "success" : "danger"} />
                  </div>
                ))}
              </div>
              <div className="structure-note">
                <strong>Quy tắc dữ liệu</strong>
                <p>Hệ thống áp dụng đúng 13 nhóm nghiệp vụ: 8 nhóm Bảo trì cơ, 4 nhóm Bảo trì điện và 1 Nhóm khác. Kho thanh lý là nhóm hệ thống riêng, không dùng làm nhóm công tác khi đăng ký tài khoản.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
