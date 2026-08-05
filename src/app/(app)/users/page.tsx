import { asc, desc, eq } from "drizzle-orm";
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

export default async function UsersPage() {
  await requireAdmin();
  const [userRows, groupRows, permissionRows] = await Promise.all([
    db.select().from(users).orderBy(desc(users.createdAt)),
    db.select({ id: groups.id, name: groups.name, isSystem: groups.isSystem }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name)),
    db.select({ userId: userGroupPermissions.userId, groupId: userGroupPermissions.groupId, level: userGroupPermissions.permissionLevel, groupName: groups.name })
      .from(userGroupPermissions).innerJoin(groups, eq(userGroupPermissions.groupId, groups.id)).where(eq(userGroupPermissions.isActive, true)),
  ]);
  const operationalGroups = groupRows.filter((g) => !g.isSystem);
  const permissionMap = new Map<string, string[]>();
  permissionRows.forEach((p) => permissionMap.set(p.userId, [...(permissionMap.get(p.userId) || []), `${p.groupName} (${p.level})`]));
  return (
    <>
      <PageHeader title="Người dùng" description="Duyệt tài khoản, gán nhóm và phân quyền theo từng nhóm." />
      <Card className="table-card">
        <CardHeader><CardTitle>Danh sách tài khoản</CardTitle><ShieldCheck size={18} /></CardHeader>
        <CardContent>
          <DataTable headers={["Nhân viên", "Username", "Mã NV", "Trạng thái", "Quyền nhóm", "Thao tác"]} rows={userRows.map((user) => {
            const actions = [] as React.ReactNode[];
            if (user.accountStatus === "pending") actions.push(
              <form action={approveUserAction} key="approve" className="row-actions">
                <input type="hidden" name="userId" value={user.id} />
                <select name="groupId" aria-label="Nhóm chính" className="field-inline-lg">{operationalGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
                <select name="permissionLevel" aria-label="Mức quyền" className="field-inline-sm"><option value="operator">Operator</option><option value="manager">Manager</option></select>
                <label className="checkbox-row"><input type="checkbox" name="isWsManager" /> WS Manager</label>
                <Button size="sm">Duyệt</Button>
              </form>,
            );
            if (user.accountStatus === "active") actions.push(<form action={updateUserStatusAction} key="block"><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="status" value="blocked" /><Button size="sm" variant="danger">Khóa</Button></form>);
            if (user.accountStatus === "blocked") actions.push(<form action={updateUserStatusAction} key="active"><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="status" value="active" /><Button size="sm">Mở khóa</Button></form>);
            return [user.fullName, user.username, user.employeeCode, <StatusBadge key="status" label={user.accountStatus} tone={user.accountStatus === "active" ? "success" : user.accountStatus === "pending" ? "warning" : "danger"} />, (permissionMap.get(user.id) || []).join(", ") || "Chưa gán", <div key="actions" className="row-actions">{actions}</div>];
          })} empty={<EmptyState description="Chưa có tài khoản." />} />
        </CardContent>
      </Card>
      <Card className="section-gap">
        <CardHeader><CardTitle>Gán thêm quyền nhóm</CardTitle></CardHeader>
        <CardContent>
          <form action={assignGroupPermissionAction} className="form-grid three">
            <FormField label="User"><select name="userId">{userRows.filter((u) => u.accountStatus === "active").map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select></FormField>
            <FormField label="Nhóm"><select name="groupId">{groupRows.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></FormField>
            <FormField label="Mức quyền"><select name="permissionLevel"><option value="operator">Operator</option><option value="manager">Manager</option></select></FormField>
            <Button type="submit">Gán quyền</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="section-gap">
        <CardHeader><CardTitle>Vai trò cấp hệ thống</CardTitle></CardHeader>
        <CardContent>
          <form action={setUserFlagsAction} className="form-grid three">
            <FormField label="User"><select name="userId">{userRows.filter((u) => u.accountStatus === "active").map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select></FormField>
            <label className="checkbox-row"><input type="checkbox" name="isWsManager" /> WS Manager</label>
            <label className="checkbox-row"><input type="checkbox" name="isAdmin" /> Admin</label>
            <Button type="submit">Cập nhật vai trò</Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
