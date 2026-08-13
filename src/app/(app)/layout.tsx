import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/guards";
import { getFlashMessage } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireUser();
  const flash = await getFlashMessage();
  return <AppShell auth={auth} flash={flash}>{children}</AppShell>;
}
