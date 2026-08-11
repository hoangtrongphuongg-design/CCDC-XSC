import { asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLogs, equipment, equipmentTypeCatalog, groups, machineLoans, repairs, transfers, users } from "@/lib/db/schema";
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

  const [relevantLoanRows, relevantTransferRows] = visibleGroupIds.length
    ? await Promise.all([
        db.select({
          equipmentId: machineLoans.equipmentId,
          ownerGroupId: machineLoans.ownerGroupId,
          borrowerGroupId: machineLoans.borrowerGroupId,
          status: machineLoans.status,
          updatedAt: machineLoans.updatedAt,
        }).from(machineLoans)
          .where(or(inArray(machineLoans.ownerGroupId, visibleGroupIds), inArray(machineLoans.borrowerGroupId, visibleGroupIds)))
          .orderBy(desc(machineLoans.updatedAt)),
        db.select({
          equipmentId: transfers.equipmentId,
          sourceGroupId: transfers.sourceGroupId,
          targetGroupId: transfers.targetGroupId,
          status: transfers.status,
          updatedAt: transfers.updatedAt,
        }).from(transfers)
          .where(or(inArray(transfers.sourceGroupId, visibleGroupIds), inArray(transfers.targetGroupId, visibleGroupIds)))
          .orderBy(desc(transfers.updatedAt)),
      ])
    : [[], []];

  const openTransferEquipmentIds = Array.from(new Set(
    relevantTransferRows
      .filter((row) => !["completed", "rejected", "cancelled"].includes(row.status))
      .map((row) => row.equipmentId),
  ));

  const rawEquipmentRows = visibleGroupIds.length
    ? await db.select().from(equipment)
        .where(openTransferEquipmentIds.length
          ? or(
              inArray(equipment.ownerGroupId, visibleGroupIds),
              inArray(equipment.currentGroupId, visibleGroupIds),
              inArray(equipment.id, openTransferEquipmentIds),
            )
          : or(
              inArray(equipment.ownerGroupId, visibleGroupIds),
              inArray(equipment.currentGroupId, visibleGroupIds),
            ))
        .orderBy(asc(equipment.code))
    : [];

  const groupNameById = new Map(groupRows.map((group) => [group.id, group.name]));
  const equipmentIds = rawEquipmentRows.map((row) => row.id);

  const repairRows = equipmentIds.length
    ? await db.select({
        equipmentId: repairs.equipmentId,
        status: repairs.status,
        updatedAt: repairs.updatedAt,
      }).from(repairs)
        .where(inArray(repairs.equipmentId, equipmentIds))
        .orderBy(desc(repairs.updatedAt))
    : [];

  const activeLoanByEquipment = new Map<string, (typeof relevantLoanRows)[number]>();
  relevantLoanRows.forEach((row) => {
    if (["completed", "rejected", "cancelled"].includes(row.status) || activeLoanByEquipment.has(row.equipmentId)) return;
    activeLoanByEquipment.set(row.equipmentId, row);
  });

  const activeTransferByEquipment = new Map<string, (typeof relevantTransferRows)[number]>();
  relevantTransferRows.forEach((row) => {
    if (["completed", "rejected", "cancelled"].includes(row.status) || activeTransferByEquipment.has(row.equipmentId)) return;
    activeTransferByEquipment.set(row.equipmentId, row);
  });

  const activeRepairByEquipment = new Map<string, (typeof repairRows)[number]>();
  repairRows.forEach((row) => {
    if (["completed", "cancelled", "irreparable"].includes(row.status) || activeRepairByEquipment.has(row.equipmentId)) return;
    activeRepairByEquipment.set(row.equipmentId, row);
  });

  const equipmentRows: IndividualEquipmentRow[] = rawEquipmentRows.map((row) => {
    const loan = activeLoanByEquipment.get(row.id);
    const transfer = activeTransferByEquipment.get(row.id);
    const repair = activeRepairByEquipment.get(row.id);
    return {
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
      currentGroupId: row.currentGroupId,
      currentGroupName: groupNameById.get(row.currentGroupId) || "—",
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
      activeLoanOwnerGroupId: loan?.ownerGroupId || null,
      activeLoanBorrowerGroupId: loan?.borrowerGroupId || null,
      activeLoanStatus: loan?.status || null,
      activeTransferSourceGroupId: transfer?.sourceGroupId || null,
      activeTransferTargetGroupId: transfer?.targetGroupId || null,
      activeTransferStatus: transfer?.status || null,
      activeRepairStatus: repair?.status || null,
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  const typeRows = await db.select({
    categoryCode: equipmentTypeCatalog.categoryCode,
    name: equipmentTypeCatalog.name,
  }).from(equipmentTypeCatalog)
    .where(eq(equipmentTypeCatalog.isActive, true))
    .orderBy(asc(equipmentTypeCatalog.categoryCode), asc(equipmentTypeCatalog.name));

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
