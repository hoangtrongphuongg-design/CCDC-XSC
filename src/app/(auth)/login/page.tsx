import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole, Wrench } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";
import { AuthShowcase } from "@/components/auth-showcase";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await getAuthContext();
  if (auth?.accountStatus === "active" && auth.mustChangePassword) redirect("/change-password");
  if (auth?.accountStatus === "active") redirect("/dashboard");
  const params = await searchParams;

  return (
    <main className="auth-page">
      <AuthShowcase />
      <section className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-form-logo"><Wrench size={22} /></div>
            <h1>Đăng nhập hệ thống</h1>
            <p>{APP_NAME} · Sử dụng tài khoản nội bộ đã được phê duyệt.</p>
          </div>
          {params.status === "pending" ? <p className="notice warning">Tài khoản đang chờ quản trị viên duyệt.</p> : null}
          {params.status === "blocked" || params.status === "rejected" ? <p className="notice danger">Tài khoản đã bị khóa hoặc từ chối.</p> : null}
          {params.passwordChanged ? <p className="notice success">Đã đổi mật khẩu. Vui lòng đăng nhập lại.</p> : null}
          <LoginForm />
          <p className="auth-note">Chưa có tài khoản? <Link href="/register">Đăng ký tài khoản</Link></p>
          <div className="auth-security-note"><LockKeyhole size={13} /> Phiên đăng nhập được bảo vệ bằng khóa hệ thống.</div>
        </div>
      </section>
    </main>
  );
}
