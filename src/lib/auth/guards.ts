import { redirect } from "next/navigation";
import { getAuthContext, type AuthContext } from "./session";

export async function requireUser(): Promise<AuthContext> {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (auth.accountStatus !== "active") redirect("/login?status=" + auth.accountStatus);
  if (auth.mustChangePassword) redirect("/change-password");
  return auth;
}

export async function requireAdmin() {
  const auth = await requireUser();
  if (!auth.isAdmin) throw new Error("Bạn không có quyền quản trị hệ thống.");
  return auth;
}

export async function requireWsManager() {
  const auth = await requireUser();
  if (!auth.isWsManager) throw new Error("Bạn không có quyền quản lý nghiệp vụ toàn xưởng.");
  return auth;
}

export function hasGroupPermission(
  auth: AuthContext,
  groupId: string,
  required: "operator" | "manager" = "operator",
) {
  const found = auth.permissions.find((p) => p.groupId === groupId);
  if (!found) return false;
  return required === "operator" || found.level === "manager";
}

export async function requireGroupPermission(groupId: string, required: "operator" | "manager" = "operator") {
  const auth = await requireUser();
  if (!hasGroupPermission(auth, groupId, required)) {
    throw new Error("Bạn không có quyền thao tác tại nhóm này.");
  }
  return auth;
}
