import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { Topbar } from "@/components/topbar";
import type { AuthContext } from "@/lib/auth/session";

export function AppShell({ auth, children }: { auth: AuthContext; children: ReactNode }) {
  return (
    <div className="app-shell" data-slot="app-shell">
      <Sidebar auth={auth} />
      <div className="app-main">
        <Topbar auth={auth} />
        <main className="page-content">{children}</main>
      </div>
      <MobileNav auth={auth} />
    </div>
  );
}
