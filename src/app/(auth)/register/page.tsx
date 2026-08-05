import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { LockKeyhole, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { groups } from "@/lib/db/schema";
import { APP_NAME } from "@/lib/constants";
import { AuthShowcase } from "@/components/auth-showcase";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const rows = await db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name));
  return (
    <main className="auth-page">
      <AuthShowcase />
      <section className="auth-form-panel">
        <div className="auth-card wide">
          <div className="auth-brand">
            <div className="auth-form-logo"><Wrench size={22} /></div>
            <h1>Đăng ký tài khoản</h1>
            <p>{APP_NAME} · Tài khoản mới cần được quản trị viên duyệt trước khi sử dụng.</p>
          </div>
          <RegisterForm groups={rows.filter((g) => !g.name.includes("Kho thanh lý"))} />
          <p className="auth-note">Đã có tài khoản? <Link href="/login">Quay lại đăng nhập</Link></p>
          <div className="auth-security-note"><LockKeyhole size={13} /> Không sử dụng chung tài khoản giữa nhiều nhân sự.</div>
        </div>
      </section>
    </main>
  );
}
