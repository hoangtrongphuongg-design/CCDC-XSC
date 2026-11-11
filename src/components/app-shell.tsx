import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { Topbar } from "@/components/topbar";
import type { AuthContext, FlashMessage } from "@/lib/auth/session";
import { EMPTY_TASK_COUNTS, type TaskSection } from "@/lib/my-tasks";

export function AppShell({ auth, flash, taskCounts = EMPTY_TASK_COUNTS, children }: { auth: AuthContext; flash?: FlashMessage | null; taskCounts?: Record<TaskSection, number>; children: ReactNode }) {
  return (
    <div className="app-shell" data-slot="app-shell">
      <Sidebar auth={auth} taskCounts={taskCounts} />
      <div className="app-main">
        <Topbar auth={auth} taskCounts={taskCounts} />
        <main className="page-content">{children}</main>
      </div>
      <MobileNav auth={auth} flash={flash} taskCounts={taskCounts} />
    </div>
  );
}
