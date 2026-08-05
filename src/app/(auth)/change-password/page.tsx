import { redirect } from "next/navigation";
import { LockKeyhole, Wrench } from "lucide-react";
import { changeOwnPasswordAction, logoutAction } from "@/actions/auth";
import { getAuthContext } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { AuthShowcase } from "@/components/auth-showcase";
import { PasswordInput } from "@/components/password-input";

export default async function ChangePasswordPage() {
  const auth = await getAuthContext();
  if (!auth || auth.accountStatus !== "active") redirect("/login");
  if (!auth.mustChangePassword) redirect("/dashboard");
  return (
    <main className="auth-page">
      <AuthShowcase />
      <section className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-form-logo"><Wrench size={22} /></div>
            <h1>Đặt mật khẩu mới</h1>
            <p>{APP_NAME} yêu cầu đổi mật khẩu tạm trước khi tiếp tục.</p>
          </div>
          <form action={changeOwnPasswordAction} className="auth-form">
            <FormField label="Mật khẩu tạm hiện tại" required><PasswordInput name="currentPassword" autoComplete="current-password" /></FormField>
            <FormField label="Mật khẩu mới" required hint="Từ 8 đến 72 ký tự."><PasswordInput name="newPassword" autoComplete="new-password" /></FormField>
            <FormField label="Nhập lại mật khẩu mới" required><PasswordInput name="confirmPassword" autoComplete="new-password" /></FormField>
            <Button type="submit" size="lg">Lưu mật khẩu mới</Button>
          </form>
          <form action={logoutAction} className="section-gap"><Button type="submit" variant="ghost" className="auth-full-button">Đăng xuất</Button></form>
          <div className="auth-security-note"><LockKeyhole size={13} /> Mật khẩu mới không được chia sẻ cho người khác.</div>
        </div>
      </section>
    </main>
  );
}
