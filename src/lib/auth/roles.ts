import type { AuthContext, GroupPermission } from "./session";

export const GROUP_PERMISSION_LABELS = {
  viewer: "Công nhân kỹ thuật",
  operator: "Kỹ sư giám sát",
  manager: "Đốc công khu vực",
} as const satisfies Record<GroupPermission["level"], string>;

export const SYSTEM_ROLE_LABELS = {
  admin: "Admin hệ thống",
  wsManager: "Quản lý Xưởng",
  readOnlyViewer: "Người xem toàn xưởng",
  groupUser: "Người dùng theo nhóm",
} as const;

export function getSystemRoleLabels(
  auth: Pick<AuthContext, "isAdmin" | "isWsManager" | "isReadOnlyViewer">,
): string[] {
  if (auth.isAdmin) return [SYSTEM_ROLE_LABELS.admin];
  if (auth.isWsManager) return [SYSTEM_ROLE_LABELS.wsManager];
  if (auth.isReadOnlyViewer) return [SYSTEM_ROLE_LABELS.readOnlyViewer];
  return [SYSTEM_ROLE_LABELS.groupUser];
}

export function getHighestGroupRoleLabel(
  permissions: Pick<GroupPermission, "level">[],
): string | null {
  if (permissions.some((permission) => permission.level === "manager")) return GROUP_PERMISSION_LABELS.manager;
  if (permissions.some((permission) => permission.level === "operator")) return GROUP_PERMISSION_LABELS.operator;
  if (permissions.some((permission) => permission.level === "viewer")) return GROUP_PERMISSION_LABELS.viewer;
  return null;
}

export function getRoleSummary(
  auth: Pick<AuthContext, "isAdmin" | "isWsManager" | "isWorkshopAdmin" | "isReadOnlyViewer" | "permissions">,
): string {
  const systemRole = getSystemRoleLabels(auth)[0];
  const groupRole = getHighestGroupRoleLabel(auth.permissions);
  return groupRole && systemRole === SYSTEM_ROLE_LABELS.groupUser
    ? `${systemRole} · ${groupRole}`
    : systemRole;
}

export function hasSystemRole(
  auth: Pick<AuthContext, "isAdmin" | "isWsManager" | "isReadOnlyViewer">,
  role: "admin" | "wsManager" | "readOnlyViewer",
): boolean {
  if (role === "admin") return auth.isAdmin;
  if (role === "wsManager") return auth.isWsManager;
  return auth.isReadOnlyViewer;
}
