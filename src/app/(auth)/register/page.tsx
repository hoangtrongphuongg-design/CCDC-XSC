import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { LockKeyhole, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { groups } from "@/lib/db/schema";
import { APP_NAME } from "@/lib/constants";
import { getGroupCategory, groupSortOrder, OPERATIONAL_GROUP_CODES } from "@/lib/group-structure";
import { AuthShowcase } from "@/components/auth-showcase";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const operationalRows = await db
    .select({ id: groups.id, code: groups.code, name: groups.name })
    .from(groups)
    .where(and(eq(groups.isActive, true), eq(groups.isSystem, false), inArray(groups.code, [...OPERATIONAL_GROUP_CODES])));

  const registrationGroups = operationalRows
    .map((group) => ({ ...group, category: getGroupCategory(group.code) }))
    .sort((a, b) => groupSortOrder(a.code) - groupSortOrder(b.code) || a.name.localeCompare(b.name, "vi"));
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
          <RegisterForm groups={registrationGroups} />
          <p className="auth-note">Đã có tài khoản? <Link href="/login">Quay lại đăng nhập</Link></p>
          <div className="auth-security-note"><LockKeyhole size={13} /> Không sử dụng chung tài khoản giữa nhiều nhân sự.</div>
        </div>
      </section>
    </main>
  );
}
