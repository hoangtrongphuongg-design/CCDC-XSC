import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await getAuthContext();
  if (auth?.accountStatus === "active" && auth.mustChangePassword) redirect("/change-password");
  if (auth?.accountStatus === "active") redirect("/dashboard");
  const params = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><div className="brand-mark">XSC</div><div><h1>{APP_NAME}</h1><p>Đăng nhập để quản lý công cụ dụng cụ toàn xưởng</p></div></div>
        {params.status === "pending" ? <p className="notice warning">Tài khoản đang chờ quản trị viên duyệt.</p> : null}
        {params.status === "blocked" || params.status === "rejected" ? <p className="notice danger">Tài khoản đã bị khóa hoặc từ chối.</p> : null}
        {params.passwordChanged ? <p className="notice success">Đã đổi mật khẩu. Vui lòng đăng nhập lại.</p> : null}
        <LoginForm />
        <p className="auth-note">Chưa có tài khoản? <Link href="/register">Đăng ký</Link></p>
      </section>
    </main>
  );
}
