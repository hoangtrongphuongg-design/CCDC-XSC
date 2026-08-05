import { desc, eq } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { groups, userGroupPermissions, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { approveUserAction, assignGroupPermissionAction, setUserFlagsAction, updateUserStatusAction } from "@/actions/users";
import { getGroupCategory, GROUP_CATEGORY_LABELS, groupSortOrder, STANDARD_GROUPS, type GroupCategory } from "@/lib/group-structure";

const permissionLabels = {
  viewer: "Nhân viên — Xem & mượn",
  operator: "Operator — Thao tác",
  manager: "Manager — Quản lý nhóm",
} as const;

const categoryOrder: GroupCategory[] = ["mechanical", "electrical", "external", "system"];

type GroupRow = {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
};

function GroupOptions({ rows, includeSystem = false }: { rows: GroupRow[]; includeSystem?: boolean }) {
  return (
    <>
      {categoryOrder.map((category) => {
        if (!includeSystem && category === "system") return null;
        const categoryRows = rows.filter((group) => getGroupCategory(group.code, group.isSystem) === category);
        if (!categoryRows.length) return null;
        return (
          <optgroup key={category} label={GROUP_CATEGORY_LABELS[category]}>
            {categoryRows.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </optgroup>
        );
      })}
    </>
  );
}

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireAdmin();

  const [userRows, rawGroupRows, permissionRows] = await Promise.all([
    db.select().from(users).orderBy(desc(users.createdAt)),
    db.select({ id: groups.id, code: groups.code, name: groups.name, isSystem: groups.isSystem })
      .from(groups)
      .where(eq(groups.isActive, true)),
    db.select({
      userId: userGroupPermissions.userId,
      groupId: userGroupPermissions.groupId,
      level: userGroupPermissions.permissionLevel,
      groupName: groups.name,
    })
      .from(userGroupPermissions)
      .innerJoin(groups, eq(userGroupPermissions.groupId, groups.id))
      .where(eq(userGroupPermissions.isActive, true)),
  ]);

  const officialGroupCodes = new Set(STANDARD_GROUPS.map((group) => group.code));
  const groupRows = rawGroupRows.filter((group) => officialGroupCodes.has(group.code as (typeof STANDARD_GROUPS)[number]["code"])).sort((a, b) => {
    const diff = groupSortOrder(a.code) - groupSortOrder(b.code);
    return diff || a.name.localeCompare(b.name, "vi");
  });
  const operationalGroups = groupRows.filter((group) => !group.isSystem);
  const permissionMap = new Map<string, string[]>();
  permissionRows.forEach((permission) => {
    const label = permissionLabels[permission.level];
    permissionMap.set(permission.userId, [...(permissionMap.get(permission.userId) || []), `${permission.groupName} · ${label}`]);
  });

  return (
    <>
      <PageHeader
        title="Người dùng & phân quyền"
        description="Danh sách nhóm được lấy trực tiếp từ cơ cấu 13 nhóm chính thức. Tài khoản mới mặc định ở mức Nhân viên — Xem thông tin và lập thủ tục mượn."
      />

      <Card className="table-card">
        <CardHeader><CardTitle>Danh sách tài khoản</CardTitle><ShieldCheck size={18} /></CardHeader>
        <CardContent>
          <DataTable
            headers={["Nhân viên", "Username", "Mã NV", "Trạng thái", "Quyền nhóm", "Thao tác"]}
            rows={userRows.map((user) => {
              const actions = [] as React.ReactNode[];
              if (user.accountStatus === "pending") {
                actions.push(
                  <form action={approveUserAction} key="approve" className="row-actions user-approval-form">
                    <input type="hidden" name="userId" value={user.id} />
                    <select name="groupId" aria-label="Nhóm chính" className="field-inline-lg">
                      <GroupOptions rows={operationalGroups} />
                    </select>
                    <select name="permissionLevel" aria-label="Mức quyền" className="field-inline-lg" defaultValue="viewer">
                      <option value="viewer">Nhân viên — Xem & mượn</option>
                      <option value="operator">Operator — Thao tác</option>
                      <option value="manager">Manager — Quản lý nhóm</option>
                    </select>
                    <label className="checkbox-row"><input type="checkbox" name="isWsManager" /> Quản lý Xưởng</label>
                    <Button size="sm">Duyệt</Button>
                  </form>,
                );
              }
              if (user.accountStatus === "active") {
                actions.push(
                  <form action={updateUserStatusAction} key="block">
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="status" value="blocked" />
                    <Button size="sm" variant="danger">Khóa</Button>
                  </form>,
                );
              }
              if (user.accountStatus === "blocked") {
                actions.push(
                  <form action={updateUserStatusAction} key="active">
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="status" value="active" />
                    <Button size="sm">Mở khóa</Button>
                  </form>,
                );
              }

              return [
                user.fullName,
                user.username,
                user.employeeCode,
                <StatusBadge key="status" label={user.accountStatus} tone={user.accountStatus === "active" ? "success" : user.accountStatus === "pending" ? "warning" : "danger"} />,
                <div key="permissions" className="permission-list-cell">
                  {(permissionMap.get(user.id) || []).map((permission) => <span key={permission}>{permission}</span>)}
                  {!(permissionMap.get(user.id) || []).length ? <span>Chưa gán</span> : null}
                </div>,
                <div key="actions" className="row-actions">{actions}</div>,
              ];
            })}
            empty={<EmptyState description="Chưa có tài khoản." />}
          />
        </CardContent>
      </Card>

      <div className="content-grid section-gap">
        <Card>
          <CardHeader><CardTitle>Gán thêm quyền nhóm</CardTitle></CardHeader>
          <CardContent>
            <form action={assignGroupPermissionAction} className="form-grid">
              <FormField label="Người dùng" required>
                <select name="userId">{userRows.filter((user) => user.accountStatus === "active").map((user) => <option key={user.id} value={user.id}>{user.fullName} · {user.username}</option>)}</select>
              </FormField>
              <FormField label="Nhóm" required hint="Danh sách được đồng bộ với trang Cơ cấu nhóm Xưởng.">
                <select name="groupId"><GroupOptions rows={groupRows} includeSystem /></select>
              </FormField>
              <FormField label="Mức quyền" required>
                <select name="permissionLevel" defaultValue="viewer">
                  <option value="viewer">Nhân viên — Xem & mượn</option>
                  <option value="operator">Operator — Thao tác</option>
                  <option value="manager">Manager — Quản lý nhóm</option>
                </select>
              </FormField>
              <Button type="submit">Gán quyền</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Vai trò cấp hệ thống</CardTitle></CardHeader>
          <CardContent>
            <form action={setUserFlagsAction} className="form-grid">
              <FormField label="Người dùng" required>
                <select name="userId">{userRows.filter((user) => user.accountStatus === "active").map((user) => <option key={user.id} value={user.id}>{user.fullName} · {user.username}</option>)}</select>
              </FormField>
              <label className="checkbox-row"><input type="checkbox" name="isWsManager" /> Quản lý nghiệp vụ toàn Xưởng</label>
              <label className="checkbox-row"><input type="checkbox" name="isAdmin" /> Quản trị hệ thống</label>
              <Button type="submit">Cập nhật vai trò</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
