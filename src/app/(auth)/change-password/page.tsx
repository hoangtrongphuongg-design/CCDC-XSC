import { redirect } from "next/navigation";
import { changeOwnPasswordAction, logoutAction } from "@/actions/auth";
import { getAuthContext } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";

export default async function ChangePasswordPage() {
  const auth = await getAuthContext();
  if (!auth || auth.accountStatus !== "active") redirect("/login");
  if (!auth.mustChangePassword) redirect("/dashboard");
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><div className="brand-mark">XSC</div><div><h1>Đặt mật khẩu mới</h1><p>{APP_NAME} yêu cầu đổi mật khẩu tạm trước khi tiếp tục.</p></div></div>
        <form action={changeOwnPasswordAction} className="auth-form">
          <FormField label="Mật khẩu tạm hiện tại" required><input name="currentPassword" type="password" autoComplete="current-password" /></FormField>
          <FormField label="Mật khẩu mới" required hint="Từ 8 đến 72 ký tự."><input name="newPassword" type="password" autoComplete="new-password" /></FormField>
          <FormField label="Nhập lại mật khẩu mới" required><input name="confirmPassword" type="password" autoComplete="new-password" /></FormField>
          <Button type="submit" size="lg">Lưu mật khẩu mới</Button>
        </form>
        <form action={logoutAction} style={{ marginTop: 10 }}><Button type="submit" variant="ghost" style={{ width: "100%" }}>Đăng xuất</Button></form>
      </section>
    </main>
  );
}
