import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/guards";
import { getFlashMessage } from "@/lib/auth/session";
import { loadMyTasks } from "@/lib/my-tasks-data";
import { countBySection } from "@/lib/my-tasks";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireUser();
  const [flash, tasks] = await Promise.all([getFlashMessage(), loadMyTasks(auth)]);
  return <AppShell auth={auth} flash={flash} taskCounts={countBySection(tasks)}>{children}</AppShell>;
}
