import { redirect } from "next/navigation";
import { getAuthResult, type AuthContext } from "./session";

export async function requireUser(): Promise<AuthContext> {
  const result = await getAuthResult();
  if (!result.auth) redirect(`/login?reason=${result.reason}`);
  const auth = result.auth;
  if (auth.accountStatus !== "active") redirect("/login?status=" + auth.accountStatus);
  if (auth.mustChangePassword) redirect("/change-password");
  return auth;
}

export async function requireWorkshopAdmin() {
  const auth = await requireUser();
  if (!auth.isWorkshopAdmin || auth.isReadOnlyViewer) {
    throw new Error("Bạn không có quyền Quản lý Xưởng / Admin.");
  }
  return auth;
}

export const requireAdmin = requireWorkshopAdmin;
export const requireWsManager = requireWorkshopAdmin;

export function hasGroupPermission(
  auth: AuthContext,
  groupId: string,
  required: "viewer" | "operator" | "manager" = "operator",
) {
  if (auth.isReadOnlyViewer) return false;
  if (auth.isWorkshopAdmin) return true;
  const found = auth.permissions.find((p) => p.groupId === groupId);
  if (!found) return false;
  const rank = { viewer: 0, operator: 1, manager: 2 } as const;
  return rank[found.level] >= rank[required];
}

export async function requireGroupPermission(
  groupId: string,
  required: "viewer" | "operator" | "manager" = "operator",
) {
  const auth = await requireUser();
  if (!hasGroupPermission(auth, groupId, required)) {
    throw new Error("Bạn không có quyền thao tác tại nhóm này.");
  }
  return auth;
}
