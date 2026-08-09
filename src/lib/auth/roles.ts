import type { AuthContext, GroupPermission } from "./session";

export const GROUP_PERMISSION_LABELS = {
  viewer: "Công nhân kỹ thuật",
  operator: "Kỹ sư giám sát",
  manager: "Đốc công khu vực",
} as const satisfies Record<GroupPermission["level"], string>;

export const SYSTEM_ROLE_LABELS = {
  workshopAdmin: "Quản lý Xưởng / Admin",
  readOnlyViewer: "Người xem toàn xưởng",
} as const;

export function getSystemRoleLabels(
  auth: Pick<AuthContext, "isWorkshopAdmin" | "isReadOnlyViewer">,
): string[] {
  const labels: string[] = [];
  if (auth.isWorkshopAdmin) labels.push(SYSTEM_ROLE_LABELS.workshopAdmin);
  if (auth.isReadOnlyViewer) labels.push(SYSTEM_ROLE_LABELS.readOnlyViewer);
  return labels;
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
  auth: Pick<AuthContext, "isWorkshopAdmin" | "isReadOnlyViewer" | "permissions">,
): string {
  const systemRoles = getSystemRoleLabels(auth);
  const groupRole = getHighestGroupRoleLabel(auth.permissions);
  const labels = groupRole ? [...systemRoles, groupRole] : systemRoles;
  return labels.length ? labels.join(" · ") : "Thành viên";
}

export function hasSystemRole(
  auth: Pick<AuthContext, "isWorkshopAdmin" | "isReadOnlyViewer">,
  role: "workshopAdmin" | "readOnlyViewer",
): boolean {
  return role === "workshopAdmin" ? auth.isWorkshopAdmin : auth.isReadOnlyViewer;
}
