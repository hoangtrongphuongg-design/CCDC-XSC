import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipment, groups, toolCatalog } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/page-header";
import { EquipmentWorkspace, type EquipmentPermission, type IndividualEquipmentRow, type QuantityToolRow } from "@/components/equipment/equipment-workspace";
import { isOfficialOperationalGroupCode } from "@/lib/group-structure";

export const dynamic = "force-dynamic";

export default async function MyEquipmentPage() {
  const auth = await requireUser();
  const groupIds = auth.permissions.map((permission) => permission.groupId);
  const permissionRows = groupIds.length
    ? await db.select({ id: groups.id, code: groups.code, name: groups.name, equipmentPrefix: groups.equipmentPrefix }).from(groups).where(inArray(groups.id, groupIds))
    : [];
  const groupById = new Map(permissionRows.map((group) => [group.id, group]));

  const permissions: EquipmentPermission[] = auth.permissions
    .filter((permission) => permission.groupCode !== "KHO_TL" && isOfficialOperationalGroupCode(permission.groupCode))
    .map((permission) => ({
      groupId: permission.groupId,
      groupCode: permission.groupCode,
      groupName: permission.groupName,
      equipmentPrefix: groupById.get(permission.groupId)?.equipmentPrefix || permission.groupCode,
      level: permission.level,
    }));

  const operationalGroupIds = permissions.map((permission) => permission.groupId);
  const [rawEquipmentRows, rawToolRows] = operationalGroupIds.length
    ? await Promise.all([
        db.select({
          id: equipment.id, code: equipment.code, name: equipment.name, equipmentType: equipment.equipmentType,
          categoryCode: equipment.categoryCode, specification: equipment.specification, unit: equipment.unit,
          model: equipment.model, serial: equipment.serial, brand: equipment.brand, ownerGroupId: equipment.ownerGroupId,
          ownerGroupName: groups.name, currentLocation: equipment.currentLocation, status: equipment.status,
          condition: equipment.condition, recordStatus: equipment.recordStatus, notes: equipment.notes,
        }).from(equipment).innerJoin(groups, eq(equipment.ownerGroupId, groups.id)).where(inArray(equipment.ownerGroupId, operationalGroupIds)).orderBy(asc(equipment.code)),
        db.select({
          id: toolCatalog.id, code: toolCatalog.code, name: toolCatalog.name, equipmentType: toolCatalog.equipmentType,
          categoryCode: toolCatalog.categoryCode, specification: toolCatalog.specification, unit: toolCatalog.unit,
          quantityOnHand: toolCatalog.quantityOnHand, ownerGroupId: toolCatalog.groupId, ownerGroupName: groups.name,
          recordStatus: toolCatalog.recordStatus, notes: toolCatalog.notes,
        }).from(toolCatalog).innerJoin(groups, eq(toolCatalog.groupId, groups.id)).where(inArray(toolCatalog.groupId, operationalGroupIds)).orderBy(asc(groups.name), asc(toolCatalog.code), asc(toolCatalog.name)),
      ])
    : [[], []] as const;

  const equipmentRows: IndividualEquipmentRow[] = rawEquipmentRows.map((row) => ({ ...row, managementMode: "individual" }));
  const toolRows: QuantityToolRow[] = rawToolRows.map((row) => ({ ...row, managementMode: "quantity" }));

  return (
    <div className="my-equipment-page">
      <PageHeader title="Dụng cụ nhóm tôi" description="Quản lý máy/CCDC trong các nhóm được phân quyền. Mã được hệ thống cấp tự động theo tiền tố từng nhóm." />
      <EquipmentWorkspace permissions={permissions} equipmentRows={equipmentRows} toolRows={toolRows} />
    </div>
  );
}
