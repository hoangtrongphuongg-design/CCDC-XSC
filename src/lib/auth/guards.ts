import { redirect } from "next/navigation";
import { getAuthResult, type AuthContext } from "./session";
import { canViewWholeWorkshop } from "./roles";

export { canViewWholeWorkshop };

export async function requireUser(): Promise<AuthContext> {
  const result = await getAuthResult();
  if (!result.auth) redirect(`/login?reason=${result.reason}`);
  const auth = result.auth;
  if (auth.accountStatus !== "active") redirect("/login?status=" + auth.accountStatus);
  if (auth.mustChangePassword) redirect("/change-password");
  return auth;
}

/**
 * Dùng cho Route Handler (tải file): route handler không đi qua layout nên phải tự kiểm tra
 * phiên. Trả null (thay vì redirect) để handler tự chuyển về /login hoặc trả 401/403.
 */
export async function getActiveAuthOrNull(): Promise<AuthContext | null> {
  const result = await getAuthResult();
  if (!result.auth) return null;
  if (result.auth.accountStatus !== "active" || result.auth.mustChangePassword) return null;
  return result.auth;
}

/** Admin hệ thống: quản trị user, phân quyền, cơ cấu nhóm và cấu hình. */
export async function requireAdmin() {
  const auth = await requireUser();
  if (!auth.isAdmin || auth.isReadOnlyViewer) {
    throw new Error("Bạn không có quyền Admin hệ thống.");
  }
  return auth;
}

/** Quản lý Xưởng: xử lý nghiệp vụ toàn XSC. Admin hệ thống cũng có toàn quyền nghiệp vụ. */
export async function requireWsManager() {
  const auth = await requireUser();
  if (!(auth.isWsManager || auth.isAdmin) || auth.isReadOnlyViewer) {
    throw new Error("Bạn không có quyền Quản lý Xưởng.");
  }
  return auth;
}

/** Tương thích các chỗ cũ đang dùng khái niệm quyền toàn Xưởng. */
export const requireWorkshopAdmin = requireWsManager;

/** Chặn trang tổng hợp toàn Xưởng với người dùng chỉ có phạm vi nhóm. */
export async function requireWholeWorkshopView() {
  const auth = await requireUser();
  if (!canViewWholeWorkshop(auth)) {
    throw new Error("Trang này chỉ dành cho vai trò xem toàn Xưởng (Admin, Quản lý Xưởng, Người xem toàn xưởng).");
  }
  return auth;
}

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
