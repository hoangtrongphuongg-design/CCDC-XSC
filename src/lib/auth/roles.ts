import type { AuthContext, GroupPermission } from "./session";

export const GROUP_PERMISSION_LABELS = {
  viewer: "Nhân viên — Xem & mượn",
  operator: "Operator — Thao tác nhóm",
  manager: "Manager — Quản lý nhóm",
} as const satisfies Record<GroupPermission["level"], string>;

export const SYSTEM_ROLE_LABELS = {
  admin: "Quản trị hệ thống",
  wsManager: "Quản lý Xưởng",
} as const;

export function getSystemRoleLabels(
  auth: Pick<AuthContext, "isAdmin" | "isWsManager">,
): string[] {
  const labels: string[] = [];
  if (auth.isAdmin) labels.push(SYSTEM_ROLE_LABELS.admin);
  if (auth.isWsManager) labels.push(SYSTEM_ROLE_LABELS.wsManager);
  return labels;
}

export function getHighestGroupRoleLabel(
  permissions: Pick<GroupPermission, "level">[],
): string | null {
  if (permissions.some((permission) => permission.level === "manager")) {
    return GROUP_PERMISSION_LABELS.manager;
  }
  if (permissions.some((permission) => permission.level === "operator")) {
    return GROUP_PERMISSION_LABELS.operator;
  }
  if (permissions.some((permission) => permission.level === "viewer")) {
    return GROUP_PERMISSION_LABELS.viewer;
  }
  return null;
}

export function getRoleSummary(
  auth: Pick<AuthContext, "isAdmin" | "isWsManager" | "permissions">,
): string {
  const systemRoles = getSystemRoleLabels(auth);
  const groupRole = getHighestGroupRoleLabel(auth.permissions);
  const labels = groupRole ? [...systemRoles, groupRole] : systemRoles;
  return labels.length ? labels.join(" · ") : "Thành viên";
}

export function hasSystemRole(
  auth: Pick<AuthContext, "isAdmin" | "isWsManager">,
  role: "admin" | "wsManager",
): boolean {
  return role === "admin" ? auth.isAdmin : auth.isWsManager;
}
