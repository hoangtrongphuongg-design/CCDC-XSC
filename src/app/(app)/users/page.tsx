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

function RoleToggle({
  userId,
  role,
  enabled,
  enabledLabel,
  disabledLabel,
}: {
  userId: string;
  role: "admin" | "ws_manager";
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
        description="Quyền nhóm, Quản lý Xưởng và Quản trị hệ thống được cấp độc lập. Admin không tự động có quyền duyệt nghiệp vụ toàn xưởng."
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
                  <form action={approveUserAction} key="approve" className="row-actions user-approval-form">
                    <input type="hidden" name="userId" value={user.id} />
                    <select name="groupId" aria-label="Nhóm chính" className="field-inline-lg">
                      <GroupOptions rows={operationalGroups} />
                    </select>
                    <select name="permissionLevel" aria-label="Mức quyền" className="field-inline-lg" defaultValue="viewer">
                      <option value="viewer">Nhân viên — Xem & mượn</option>
                      <option value="operator">Operator — Thao tác nhóm</option>
                      <option value="manager">Manager — Quản lý nhóm</option>
                    </select>
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

              const systemRoles = [
                user.isWsManager ? "Quản lý Xưởng" : null,
                user.isAdmin ? "Quản trị hệ thống" : null,
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
                  {activeUsers.map((user) => <option key={user.id} value={user.id}>{user.fullName} · {user.username}</option>)}
                </select>
              </FormField>
              <FormField label="Nhóm" required hint="Danh sách được đồng bộ với trang Cơ cấu nhóm Xưởng.">
                <select name="groupId"><GroupOptions rows={groupRows} includeSystem /></select>
              </FormField>
              <FormField label="Mức quyền" required>
                <select name="permissionLevel" defaultValue="viewer">
                  <option value="viewer">Nhân viên — Xem & mượn</option>
                  <option value="operator">Operator — Thao tác nhóm</option>
                  <option value="manager">Manager — Quản lý nhóm</option>
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
              <span><strong>Quản lý Xưởng:</strong> duyệt và điều phối nghiệp vụ toàn xưởng; không quản trị tài khoản.</span>
              <span><strong>Quản trị hệ thống:</strong> quản lý user, nhóm và cấu hình; không tự động được duyệt nghiệp vụ.</span>
              <span><strong>Operator:</strong> thao tác và duyệt công việc thường ngày của nhóm.</span>
              <span><strong>Manager:</strong> quản lý nhóm và thực hiện các bước xác nhận cấp nhóm.</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="table-card section-gap">
        <CardHeader><CardTitle>Vai trò cấp hệ thống — cấp riêng từng vai trò</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            headers={["Người dùng", "Quản lý Xưởng", "Quản trị hệ thống"]}
            rows={activeUsers.map((user) => [
              <div key="user" className="permission-list-cell"><strong>{user.fullName}</strong><span>{user.username}</span></div>,
              <RoleToggle
                key="ws"
                userId={user.id}
                role="ws_manager"
                enabled={user.isWsManager}
                enabledLabel="Thu hồi QL Xưởng"
                disabledLabel="Cấp QL Xưởng"
              />,
              <RoleToggle
                key="admin"
                userId={user.id}
                role="admin"
                enabled={user.isAdmin}
                enabledLabel="Thu hồi Admin"
                disabledLabel="Cấp Admin"
              />,
            ])}
            empty={<EmptyState description="Chưa có tài khoản hoạt động." />}
          />
        </CardContent>
      </Card>
    </>
  );
}
