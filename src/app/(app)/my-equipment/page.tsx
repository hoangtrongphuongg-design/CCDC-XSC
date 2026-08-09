import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLogs, equipment, equipmentTypeCatalog, groups, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/page-header";
import {
  EquipmentWorkspace,
  type EquipmentAuditRow,
  type EquipmentPermission,
  type IndividualEquipmentRow,
} from "@/components/equipment/equipment-workspace";
import { isOfficialOperationalGroupCode } from "@/lib/group-structure";

export const dynamic = "force-dynamic";

export default async function MyEquipmentPage() {
  const auth = await requireUser();

  const groupRows = (await db.select({
    id: groups.id,
    code: groups.code,
    name: groups.name,
    equipmentPrefix: groups.equipmentPrefix,
    isSystem: groups.isSystem,
  }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name)))
    .filter((group) => !group.isSystem && isOfficialOperationalGroupCode(group.code));

  const permissionByGroup = new Map(auth.permissions.map((permission) => [permission.groupId, permission]));
  const permissions: EquipmentPermission[] = auth.isWorkshopAdmin
    ? groupRows.map((group) => ({
        groupId: group.id,
        groupCode: group.code,
        groupName: group.name,
        equipmentPrefix: group.equipmentPrefix,
        level: "manager" as const,
      }))
    : auth.isReadOnlyViewer
      ? groupRows.map((group) => ({
          groupId: group.id,
          groupCode: group.code,
          groupName: group.name,
          equipmentPrefix: group.equipmentPrefix,
          level: "viewer" as const,
        }))
      : groupRows
          .filter((group) => permissionByGroup.has(group.id))
          .map((group) => {
            const permission = permissionByGroup.get(group.id)!;
            return {
              groupId: group.id,
              groupCode: group.code,
              groupName: group.name,
              equipmentPrefix: group.equipmentPrefix,
              level: permission.level,
            };
          });

  const visibleGroupIds = permissions.map((permission) => permission.groupId);
  const rawEquipmentRows = visibleGroupIds.length
    ? await db.select().from(equipment)
        .where(inArray(equipment.ownerGroupId, visibleGroupIds))
        .orderBy(asc(equipment.code))
    : [];

  const groupNameById = new Map(groupRows.map((group) => [group.id, group.name]));
  const equipmentRows: IndividualEquipmentRow[] = rawEquipmentRows.map((row) => ({
    id: row.id,
    code: row.code,
    legacyCode: row.legacyCode,
    name: row.name,
    equipmentType: row.equipmentType,
    categoryCode: row.categoryCode,
    technicalSpecs: row.technicalSpecs || row.specification,
    technicalNote: row.technicalNote,
    model: row.model,
    serial: row.serial,
    brand: row.brand,
    manufactureYear: row.manufactureYear,
    commissionYear: row.commissionYear,
    originType: row.originType,
    recordedDate: row.recordedDate,
    originGroupId: row.originGroupId,
    originGroupName: groupNameById.get(row.originGroupId) || "—",
    ownerGroupId: row.ownerGroupId,
    ownerGroupName: groupNameById.get(row.ownerGroupId) || "—",
    currentLocation: row.currentLocation,
    status: row.status,
    condition: row.condition,
    purchaseDate: row.purchaseDate,
    poContractNo: row.poContractNo,
    supplierName: row.supplierName,
    purchasePrice: row.purchasePrice,
    warrantyUntil: row.warrantyUntil,
    purchaseNote: row.purchaseNote,
    notes: row.notes,
    recordStatus: row.recordStatus,
    updatedAt: row.updatedAt.toISOString(),
  }));

  const typeRows = await db.select({
    categoryCode: equipmentTypeCatalog.categoryCode,
    name: equipmentTypeCatalog.name,
  }).from(equipmentTypeCatalog)
    .where(eq(equipmentTypeCatalog.isActive, true))
    .orderBy(asc(equipmentTypeCatalog.categoryCode), asc(equipmentTypeCatalog.name));

  const equipmentIds = equipmentRows.map((row) => row.id);
  const rawAuditRows = equipmentIds.length
    ? await db.select({
        id: activityLogs.id,
        equipmentId: activityLogs.entityId,
        action: activityLogs.action,
        description: activityLogs.description,
        beforeData: activityLogs.beforeData,
        afterData: activityLogs.afterData,
        reason: activityLogs.reason,
        createdAt: activityLogs.createdAt,
        actorName: users.fullName,
        actorGroupName: groups.name,
        actorRole: activityLogs.actorRole,
      })
        .from(activityLogs)
        .leftJoin(users, eq(activityLogs.actorUserId, users.id))
        .leftJoin(groups, eq(activityLogs.actorGroupId, groups.id))
        .where(inArray(activityLogs.entityId, equipmentIds))
        .orderBy(desc(activityLogs.createdAt))
    : [];

  const auditRows: EquipmentAuditRow[] = rawAuditRows
    .filter((row): row is typeof row & { equipmentId: string } => Boolean(row.equipmentId))
    .map((row) => ({
      ...row,
      equipmentId: row.equipmentId,
      createdAt: row.createdAt.toISOString(),
    }));

  return (
    <div className="my-equipment-page">
      <PageHeader
        title="Dụng cụ nhóm tôi"
        description="Tạo, cập nhật và tra cứu hồ sơ CCDC của nhóm. Mã hệ thống được cấp tự động và giữ nguyên trong suốt vòng đời thiết bị."
      />
      <EquipmentWorkspace
        permissions={permissions}
        equipmentRows={equipmentRows}
        typeRows={typeRows}
        auditRows={auditRows}
        isWorkshopAdmin={auth.isWorkshopAdmin}
        isReadOnlyViewer={auth.isReadOnlyViewer}
      />
    </div>
  );
}
