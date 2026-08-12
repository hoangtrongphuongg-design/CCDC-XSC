import { desc, eq } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { groups, userGroupPermissions, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { GROUP_PERMISSION_LABELS } from "@/lib/auth/roles";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  approveUserAction,
  assignGroupPermissionAction,
  setSystemRoleAction,
  updateUserStatusAction,
} from "@/actions/users";
import {
  getGroupCategory,
  GROUP_CATEGORY_LABELS,
  groupSortOrder,
  STANDARD_GROUPS,
  type GroupCategory,
} from "@/lib/group-structure";

const categoryOrder: GroupCategory[] = ["mechanical", "electrical", "management", "external", "system"];

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

function RoleToggle({
  userId,
  role,
  enabled,
  enabledLabel,
  disabledLabel,
}: {
  userId: string;
  role: "workshop_admin" | "readonly_viewer";
  enabled: boolean;
  enabledLabel: string;
  disabledLabel: string;
}) {
  return (
    <div className="row-actions">
      <StatusBadge label={enabled ? "Đã cấp" : "Chưa cấp"} tone={enabled ? "success" : "neutral"} />
      <form action={setSystemRoleAction}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="role" value={role} />
        <input type="hidden" name="enabled" value={String(!enabled)} />
        <Button size="sm" variant={enabled ? "danger" : "secondary"}>
          {enabled ? enabledLabel : disabledLabel}
        </Button>
      </form>
    </div>
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
  const groupRows = rawGroupRows
    .filter((group) => officialGroupCodes.has(group.code as (typeof STANDARD_GROUPS)[number]["code"]))
    .sort((a, b) => {
      const diff = groupSortOrder(a.code) - groupSortOrder(b.code);
      return diff || a.name.localeCompare(b.name, "vi");
    });
  const operationalGroups = groupRows.filter((group) => !group.isSystem);
  const activeUsers = userRows.filter((user) => user.accountStatus === "active");
  const groupAssignableUsers = activeUsers.filter((user) => !user.isReadOnlyViewer);
  const permissionMap = new Map<string, string[]>();

  permissionRows.forEach((permission) => {
    const label = GROUP_PERMISSION_LABELS[permission.level];
    permissionMap.set(permission.userId, [
      ...(permissionMap.get(permission.userId) || []),
      `${permission.groupName} · ${label}`,
    ]);
  });

  return (
    <>
      <PageHeader
        title="Người dùng & phân quyền"
        description="Phân quyền theo thực tế Xưởng: Công nhân kỹ thuật, Kỹ sư giám sát, Đốc công khu vực; Quản lý Xưởng / Admin là vai trò quản trị cao nhất. Người xem toàn xưởng chỉ có quyền đọc."
      />

      <Card className="table-card">
        <CardHeader><CardTitle>Danh sách tài khoản</CardTitle><ShieldCheck size={18} /></CardHeader>
        <CardContent>
          <DataTable
            headers={["Nhân viên", "Username", "Mã NV", "Trạng thái", "Quyền nhóm", "Vai trò hệ thống", "Thao tác"]}
            rows={userRows.map((user) => {
              const actions: React.ReactNode[] = [];

              if (user.accountStatus === "pending") {
                actions.push(
                  <div key="approve" className="user-approval-stack">
                    <form action={approveUserAction} className="row-actions user-approval-form">
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="accountMode" value="group_user" />
                      <select name="groupId" aria-label="Nhóm chính" className="field-inline-lg" required>
                        <option value="">Chọn nhóm</option>
                        <GroupOptions rows={operationalGroups} />
                      </select>
                      <select name="permissionLevel" aria-label="Mức quyền" className="field-inline-lg" defaultValue="viewer">
                        <option value="viewer">Công nhân kỹ thuật</option>
                        <option value="operator">Kỹ sư giám sát</option>
                        <option value="manager">Đốc công khu vực</option>
                      </select>
                      <Button size="sm">Duyệt theo nhóm</Button>
                    </form>
                    <form action={approveUserAction} className="row-actions">
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="accountMode" value="readonly_viewer" />
                      <input type="hidden" name="permissionLevel" value="viewer" />
                      <Button size="sm" variant="secondary">Duyệt xem toàn xưởng</Button>
                    </form>
                  </div>,
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

              const systemRoles = [
                user.isAdmin || user.isWsManager ? "Quản lý Xưởng / Admin" : null,
                user.isReadOnlyViewer ? "Người xem toàn xưởng" : null,
              ].filter(Boolean) as string[];

              return [
                user.fullName,
                user.username,
                user.employeeCode,
                <StatusBadge
                  key="status"
                  label={user.accountStatus}
                  tone={user.accountStatus === "active" ? "success" : user.accountStatus === "pending" ? "warning" : "danger"}
                />,
                <div key="permissions" className="permission-list-cell">
                  {(permissionMap.get(user.id) || []).map((permission) => <span key={permission}>{permission}</span>)}
                  {!(permissionMap.get(user.id) || []).length ? <span>Chưa gán</span> : null}
                </div>,
                <div key="systemRoles" className="permission-list-cell">
                  {systemRoles.map((role) => <span key={role}>{role}</span>)}
                  {!systemRoles.length ? <span>Không có</span> : null}
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
                <select name="userId">
                  {groupAssignableUsers.map((user) => <option key={user.id} value={user.id}>{user.fullName} · {user.username}</option>)}
                </select>
              </FormField>
              <FormField label="Nhóm" required hint="Danh sách được đồng bộ với trang Cơ cấu nhóm Xưởng.">
                <select name="groupId"><GroupOptions rows={groupRows} includeSystem /></select>
              </FormField>
              <FormField label="Mức quyền" required>
                <select name="permissionLevel" defaultValue="viewer">
                  <option value="viewer">Công nhân kỹ thuật</option>
                  <option value="operator">Kỹ sư giám sát</option>
                  <option value="manager">Đốc công khu vực</option>
                </select>
              </FormField>
              <Button type="submit">Gán quyền</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Nguyên tắc vai trò</CardTitle></CardHeader>
          <CardContent>
            <div className="permission-list-cell">
              <span><strong>Công nhân kỹ thuật:</strong> xem, mượn/trả và báo hỏng CCDC.</span>
              <span><strong>Kỹ sư giám sát:</strong> quản lý CCDC và xử lý nghiệp vụ thường ngày của nhóm.</span>
              <span><strong>Đốc công khu vực:</strong> cấp trên của Kỹ sư giám sát; có quyền điều chuyển và thanh lý cấp nhóm.</span>
              <span><strong>Quản lý Xưởng / Admin:</strong> quản lý toàn Xưởng, cấp phát ban đầu, quản trị user và can thiệp dữ liệu khi cần.</span>
              <span><strong>Người xem toàn xưởng:</strong> xem toàn bộ web nhưng không được ghi dữ liệu; không cần gán nhóm.</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="table-card section-gap">
        <CardHeader><CardTitle>Vai trò cấp hệ thống</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            headers={["Người dùng", "Quản lý Xưởng / Admin", "Người xem toàn xưởng"]}
            rows={activeUsers.map((user) => [
              <div key="user" className="permission-list-cell"><strong>{user.fullName}</strong><span>{user.username}</span></div>,
              <RoleToggle
                key="workshop-admin"
                userId={user.id}
                role="workshop_admin"
                enabled={user.isAdmin || user.isWsManager}
                enabledLabel="Thu hồi quyền"
                disabledLabel="Cấp QL Xưởng / Admin"
              />,
              <RoleToggle
                key="readonly"
                userId={user.id}
                role="readonly_viewer"
                enabled={user.isReadOnlyViewer}
                enabledLabel="Thu hồi quyền xem"
                disabledLabel="Cấp quyền xem toàn xưởng"
              />,
            ])}
            empty={<EmptyState description="Chưa có tài khoản hoạt động." />}
          />
        </CardContent>
      </Card>
    </>
  );
}
