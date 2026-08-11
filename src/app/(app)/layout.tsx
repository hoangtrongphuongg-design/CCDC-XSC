import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireUser();
  return <AppShell auth={auth}>{children}</AppShell>;
}
