import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups } from "@/lib/db/schema";
import { APP_NAME } from "@/lib/constants";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const rows = await db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name));
  return (
    <main className="auth-page">
      <section className="auth-card wide">
        <div className="auth-brand"><div className="brand-mark">XSC</div><div><h1>Đăng ký {APP_NAME}</h1><p>Tài khoản mới cần được quản trị viên duyệt trước khi sử dụng.</p></div></div>
        <RegisterForm groups={rows.filter((g) => !g.name.includes("Kho thanh lý"))} />
        <p className="auth-note">Đã có tài khoản? <Link href="/login">Quay lại đăng nhập</Link></p>
      </section>
    </main>
  );
}
