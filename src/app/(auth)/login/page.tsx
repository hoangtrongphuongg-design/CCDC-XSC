import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
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
        <div className="auth-mobile-brand" aria-hidden="true">
          <Image src="/brand/company-symbol.png" alt="" width={96} height={125} priority />
          <strong>{APP_NAME}</strong>
          <span>Hệ thống quản lý dụng cụ xưởng</span>
          <Image src="/brand/company-slogan.png" alt="" width={250} height={46} priority />
        </div>
        <div className="auth-card">
          <div className="auth-brand">
            <h1>Đăng nhập hệ thống</h1>
            <p>Vui lòng đăng nhập để tiếp tục.</p>
          </div>
          {params.status === "pending" ? <p className="notice warning">Tài khoản đang chờ quản trị viên duyệt.</p> : null}
          {params.status === "blocked" || params.status === "rejected" ? <p className="notice danger">Tài khoản đã bị khóa hoặc từ chối.</p> : null}
          {params.passwordChanged ? <p className="notice success">Đã đổi mật khẩu. Vui lòng đăng nhập lại.</p> : null}
          {params.reason === "missing_cookie" ? <p className="notice warning">Phiên đăng nhập không được trình duyệt gửi lại (AUTH-C01).</p> : null}
          {params.reason === "invalid_token" ? <p className="notice warning">Cookie còn nhưng chữ ký/thời hạn phiên không hợp lệ (AUTH-C02).</p> : null}
          {params.reason === "session_version_mismatch" ? <p className="notice warning">Phiên đã bị vô hiệu do phiên bản quyền/tài khoản thay đổi (AUTH-C03).</p> : null}
          {params.reason === "user_not_found" || params.reason === "missing_subject" ? <p className="notice warning">Phiên đăng nhập không còn khớp tài khoản (AUTH-C04).</p> : null}
          <LoginForm />
          <div className="auth-divider"><span>hoặc</span></div>
          <Link href="/register" className="auth-secondary-action">Đăng ký tài khoản nội bộ</Link>
          <div className="auth-security-note"><LockKeyhole size={13} /> Phiên đăng nhập được bảo vệ trong 8 giờ.</div>
        </div>
        <p className="auth-copyright">© 2026 XSC. Hệ thống nội bộ.</p>
      </section>
    </main>
  );
}
