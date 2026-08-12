import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Search, ShieldCheck, UserCog, X } from "lucide-react";
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
  revokeGroupPermissionAction,
  setPrimarySystemRoleAction,
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

type GroupRow = { id: string; code: string; name: string; isSystem: boolean };
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function GroupOptions({ rows, includeSystem = false }: { rows: GroupRow[]; includeSystem?: boolean }) {
  return <>{categoryOrder.map((category) => {
    if (!includeSystem && category === "system") return null;
    const categoryRows = rows.filter((group) => getGroupCategory(group.code, group.isSystem) === category);
    if (!categoryRows.length) return null;
    return <optgroup key={category} label={GROUP_CATEGORY_LABELS[category]}>
      {categoryRows.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
    </optgroup>;
  })}</>;
}

function primaryRole(user: typeof users.$inferSelect) {
  if (user.isAdmin) return { value: "admin", label: "Admin hệ thống" } as const;
  if (user.isWsManager) return { value: "ws_manager", label: "Quản lý Xưởng" } as const;
  if (user.isReadOnlyViewer) return { value: "readonly_viewer", label: "Người xem toàn xưởng" } as const;
  return { value: "group_user", label: "Người dùng theo nhóm" } as const;
}

export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  const auth = await requireAdmin();
  const params = await searchParams;
  const q = one(params.q).trim().toLocaleLowerCase("vi");
  const groupFilter = one(params.group);
  const roleFilter = one(params.role);
  const statusFilter = one(params.status);
  const manageId = one(params.manage);

  const [userRows, rawGroupRows, permissionRows] = await Promise.all([
    db.select().from(users).orderBy(desc(users.createdAt)),
    db.select({ id: groups.id, code: groups.code, name: groups.name, isSystem: groups.isSystem })
      .from(groups).where(eq(groups.isActive, true)),
    db.select({
      userId: userGroupPermissions.userId,
      groupId: userGroupPermissions.groupId,
      level: userGroupPermissions.permissionLevel,
      isPrimary: userGroupPermissions.isPrimary,
      groupName: groups.name,
    }).from(userGroupPermissions)
      .innerJoin(groups, eq(userGroupPermissions.groupId, groups.id))
      .where(eq(userGroupPermissions.isActive, true)),
  ]);

  const officialCodes = new Set(STANDARD_GROUPS.map((group) => group.code));
  const groupRows = rawGroupRows
    .filter((group) => officialCodes.has(group.code as (typeof STANDARD_GROUPS)[number]["code"]))
    .sort((a, b) => groupSortOrder(a.code) - groupSortOrder(b.code) || a.name.localeCompare(b.name, "vi"));
  const operationalGroups = groupRows.filter((group) => !group.isSystem);
  const groupById = new Map(groupRows.map((group) => [group.id, group]));

  const permissionsByUser = new Map<string, typeof permissionRows>();
  for (const row of permissionRows) permissionsByUser.set(row.userId, [...(permissionsByUser.get(row.userId) || []), row]);

  const filteredUsers = userRows.filter((user) => {
    const role = primaryRole(user).value;
    const userPermissions = permissionsByUser.get(user.id) || [];
    const text = `${user.fullName} ${user.username} ${user.employeeCode}`.toLocaleLowerCase("vi");
    if (q && !text.includes(q)) return false;
    if (groupFilter && user.primaryGroupId !== groupFilter && !userPermissions.some((p) => p.groupId === groupFilter)) return false;
    if (roleFilter && role !== roleFilter) return false;
    if (statusFilter && user.accountStatus !== statusFilter) return false;
    return true;
  });

  const selectedUser = userRows.find((user) => user.id === manageId) || null;
  const selectedPermissions = selectedUser ? permissionsByUser.get(selectedUser.id) || [] : [];
  const selectedRole = selectedUser ? primaryRole(selectedUser) : null;

  return <>
    <PageHeader
      title="Người dùng & phân quyền"
      description="Quản lý tập trung theo từng tài khoản. Vai trò hệ thống và quyền theo nhóm được tách rõ để tránh cấp nhầm quyền."
    />

    <Card className="table-card">
      <CardHeader><CardTitle>Danh sách tài khoản</CardTitle><ShieldCheck size={18} /></CardHeader>
      <CardContent>
        <form method="get" className="user-filter-bar">
          <label className="user-search-field"><Search size={17} /><input name="q" defaultValue={one(params.q)} placeholder="Tên, mã NV hoặc username" /></label>
          <select name="group" defaultValue={groupFilter} aria-label="Lọc theo nhóm">
            <option value="">Tất cả nhóm</option><GroupOptions rows={groupRows} includeSystem />
          </select>
          <select name="role" defaultValue={roleFilter} aria-label="Lọc theo vai trò">
            <option value="">Tất cả vai trò</option>
            <option value="group_user">Người dùng theo nhóm</option>
            <option value="readonly_viewer">Người xem toàn xưởng</option>
            <option value="ws_manager">Quản lý Xưởng</option>
            <option value="admin">Admin hệ thống</option>
          </select>
          <select name="status" defaultValue={statusFilter} aria-label="Lọc theo trạng thái">
            <option value="">Tất cả trạng thái</option>
            <option value="active">Active</option><option value="pending">Pending</option><option value="blocked">Blocked</option><option value="rejected">Rejected</option>
          </select>
          <Button type="submit" size="sm">Lọc</Button>
          {(q || groupFilter || roleFilter || statusFilter) ? <Link href="/users" className="btn btn-secondary btn-sm"><X size={15} /> Xóa lọc</Link> : null}
        </form>

        <DataTable
          headers={["Nhân viên", "Username / Mã NV", "Nhóm chính", "Quyền nhóm", "Vai trò hệ thống", "Trạng thái", "Thao tác"]}
          rows={filteredUsers.map((user) => {
            const permissionList = permissionsByUser.get(user.id) || [];
            const role = primaryRole(user);
            const primaryGroup = user.primaryGroupId ? groupById.get(user.primaryGroupId) : null;
            return [
              <strong key="name">{user.fullName}</strong>,
              <div key="account" className="permission-list-cell"><span>{user.username}</span><small>{user.employeeCode}</small></div>,
              primaryGroup?.name || "—",
              <div key="permissions" className="permission-list-cell compact">
                {permissionList.slice(0, 2).map((p) => <span key={p.groupId}>{p.groupName} · {GROUP_PERMISSION_LABELS[p.level]}</span>)}
                {permissionList.length > 2 ? <small>+{permissionList.length - 2} quyền khác</small> : null}
                {!permissionList.length ? <span>Chưa gán</span> : null}
              </div>,
              <StatusBadge key="role" label={role.label} tone={role.value === "admin" ? "warning" : role.value === "readonly_viewer" ? "neutral" : "success"} />,
              <StatusBadge key="status" label={user.accountStatus} tone={user.accountStatus === "active" ? "success" : user.accountStatus === "pending" ? "warning" : "danger"} />,
              <Link key="manage" href={`/users?manage=${user.id}`} className="btn btn-secondary btn-sm"><UserCog size={15} /> Quản lý</Link>,
            ];
          })}
          empty={<EmptyState description="Không có tài khoản phù hợp bộ lọc." />}
        />
      </CardContent>
    </Card>

    {selectedUser && selectedRole ? <Card className="section-gap user-manager-card">
      <CardHeader>
        <div><CardTitle>Quản lý tài khoản · {selectedUser.fullName}</CardTitle><p className="muted-copy">{selectedUser.username} · Mã NV {selectedUser.employeeCode}</p></div>
        <Link href="/users" className="btn btn-secondary btn-sm"><X size={15} /> Đóng</Link>
      </CardHeader>
      <CardContent>
        <div className="user-manager-grid">
          <section className="user-manager-section">
            <h3>Vai trò hệ thống</h3>
            <p>Mỗi tài khoản chỉ có một vai trò hệ thống chính. Admin và Quản lý Xưởng mặc định có phạm vi toàn XSC.</p>
            {selectedUser.accountStatus === "pending" ? <div className="approval-box">
              <strong>Tài khoản đang chờ duyệt</strong>
              <form action={approveUserAction} className="form-grid compact-form">
                <input type="hidden" name="userId" value={selectedUser.id} /><input type="hidden" name="accountMode" value="group_user" />
                <FormField label="Nhóm chính" required><select name="groupId" required><option value="">Chọn nhóm</option><GroupOptions rows={operationalGroups} /></select></FormField>
                <FormField label="Mức quyền" required><select name="permissionLevel" defaultValue="viewer"><option value="viewer">Công nhân kỹ thuật</option><option value="operator">Kỹ sư giám sát</option><option value="manager">Đốc công khu vực</option></select></FormField>
                <Button type="submit">Duyệt theo nhóm</Button>
              </form>
              <form action={approveUserAction}><input type="hidden" name="userId" value={selectedUser.id} /><input type="hidden" name="accountMode" value="readonly_viewer" /><input type="hidden" name="permissionLevel" value="viewer" /><Button type="submit" variant="secondary">Duyệt xem toàn xưởng</Button></form>
            </div> : <form action={setPrimarySystemRoleAction} className="form-grid compact-form">
              <input type="hidden" name="userId" value={selectedUser.id} />
              <FormField label="Vai trò chính" required hint={selectedUser.id === auth.userId ? "Bạn đang quản lý chính tài khoản Admin đang đăng nhập; hệ thống không cho phép tự hạ quyền." : undefined}>
                <select name="systemRole" defaultValue={selectedRole.value} disabled={selectedUser.id === auth.userId}>
                  <option value="group_user">Người dùng theo nhóm</option>
                  <option value="readonly_viewer">Người xem toàn xưởng</option>
                  <option value="ws_manager">Quản lý Xưởng</option>
                  <option value="admin">Admin hệ thống</option>
                </select>
              </FormField>
              {selectedUser.id === auth.userId ? <input type="hidden" name="systemRole" value="admin" /> : null}
              <Button type="submit" disabled={selectedUser.id === auth.userId}>Lưu vai trò</Button>
            </form>}
            <div className="role-help-inline">
              <span><strong>Người dùng theo nhóm:</strong> quyền theo từng nhóm được cấp.</span>
              <span><strong>Người xem toàn xưởng:</strong> xem toàn XSC, không ghi dữ liệu.</span>
              <span><strong>Quản lý Xưởng:</strong> xử lý nghiệp vụ toàn XSC, không quản trị user.</span>
              <span><strong>Admin hệ thống:</strong> quản trị user, nhóm và có toàn quyền nghiệp vụ.</span>
            </div>
          </section>

          <section className="user-manager-section">
            <h3>Quyền theo nhóm</h3>
            <p>Quyền nhóm được lưu riêng; chỉ chi phối phạm vi thao tác khi vai trò chính là Người dùng theo nhóm.</p>
            <div className="permission-editor-list">
              {selectedPermissions.map((permission) => <div key={permission.groupId} className="permission-editor-row">
                <div><strong>{permission.groupName}</strong><span>{GROUP_PERMISSION_LABELS[permission.level]}{permission.isPrimary ? " · Nhóm chính" : ""}</span></div>
                <form action={revokeGroupPermissionAction}><input type="hidden" name="userId" value={selectedUser.id} /><input type="hidden" name="groupId" value={permission.groupId} /><Button size="sm" variant="danger">Thu hồi</Button></form>
              </div>)}
              {!selectedPermissions.length ? <EmptyState description="Tài khoản chưa có quyền nhóm." /> : null}
            </div>
            <form action={assignGroupPermissionAction} className="permission-add-row">
              <input type="hidden" name="userId" value={selectedUser.id} />
              <select name="groupId" required><option value="">Chọn nhóm</option><GroupOptions rows={groupRows} includeSystem /></select>
              <select name="permissionLevel" defaultValue="viewer"><option value="viewer">Công nhân kỹ thuật</option><option value="operator">Kỹ sư giám sát</option><option value="manager">Đốc công khu vực</option></select>
              <Button type="submit" size="sm">+ Thêm quyền nhóm</Button>
            </form>
          </section>

          <section className="user-manager-section user-status-section">
            <h3>Trạng thái tài khoản</h3>
            <div className="row-actions"><StatusBadge label={selectedUser.accountStatus} tone={selectedUser.accountStatus === "active" ? "success" : "danger"} />
              {selectedUser.accountStatus === "active" ? <form action={updateUserStatusAction}><input type="hidden" name="userId" value={selectedUser.id} /><input type="hidden" name="status" value="blocked" /><Button size="sm" variant="danger" disabled={selectedUser.id === auth.userId}>Khóa tài khoản</Button></form> : null}
              {selectedUser.accountStatus === "blocked" ? <form action={updateUserStatusAction}><input type="hidden" name="userId" value={selectedUser.id} /><input type="hidden" name="status" value="active" /><Button size="sm">Mở khóa</Button></form> : null}
            </div>
            {selectedUser.id === auth.userId ? <p className="safety-note">Tài khoản Admin đang đăng nhập được bảo vệ: không thể tự khóa hoặc tự hạ quyền.</p> : null}
          </section>
        </div>
      </CardContent>
    </Card> : null}
  </>;
}
