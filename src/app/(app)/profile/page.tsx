import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRoleSummary } from "@/lib/auth/roles";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";

export default async function ProfilePage() {
  const auth = await requireUser();
  return (
    <>
      <PageHeader title="Thông tin cá nhân" description="Tài khoản và phạm vi được phân quyền trong hệ thống." />
      <div className="profile-grid">
        <Card>
          <CardHeader><CardTitle>Thông tin tài khoản</CardTitle><UserRound size={18} /></CardHeader>
          <CardContent><dl className="profile-details">
            <div><dt>Họ và tên</dt><dd>{auth.fullName}</dd></div>
            <div><dt>Tên đăng nhập</dt><dd>{auth.username}</dd></div>
            <div><dt>Mã nhân viên</dt><dd>{auth.employeeCode}</dd></div>
            <div><dt>Nhóm chính</dt><dd>{auth.primaryGroupName || "Chưa gán"}</dd></div>
            <div><dt>Vai trò hệ thống</dt><dd>{getRoleSummary(auth)}</dd></div>
          </dl></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Phạm vi nhóm</CardTitle><ShieldCheck size={18} /></CardHeader>
          <CardContent><div className="permission-list">
            {auth.permissions.map((permission) => <div key={permission.groupId}><strong>{permission.groupName}</strong><span>{permission.level === "viewer" ? "Công nhân kỹ thuật" : permission.level === "operator" ? "Kỹ sư giám sát" : "Đốc công khu vực"}</span></div>)}
          </div></CardContent>
        </Card>

        <Card className="mobile-profile-account-actions">
          <CardHeader><CardTitle>Tài khoản</CardTitle><LogOut size={18} /></CardHeader>
          <CardContent>
            <form action={logoutAction}>
              <Button type="submit" variant="danger" className="mobile-profile-logout">
                <LogOut size={18} />
                Đăng xuất
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
