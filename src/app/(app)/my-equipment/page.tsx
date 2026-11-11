import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipmentTypeCatalog } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/page-header";
import {
  EquipmentWorkspace,
  type IndividualEquipmentRow,
} from "@/components/equipment/equipment-workspace";
import { buildEquipmentPermissions, loadOperationalGroups, loadScopedEquipment } from "@/lib/equipment-data";

export const dynamic = "force-dynamic";

export default async function MyEquipmentPage() {
  const auth = await requireUser();

  const groupRows = await loadOperationalGroups();
  const permissions = buildEquipmentPermissions(auth, groupRows);

  const visibleGroupIds = permissions.map((permission) => permission.groupId);

  // Admin / Quản lý Xưởng / Người xem thấy máy của mọi nhóm, nhưng "Dụng cụ nhóm tôi" phải
  // mở ra với nhóm của chính tài khoản trước; đổi ô lọc để xem nhóm khác hoặc tất cả.
  // Tài khoản không có nhóm chính (vd Người xem toàn xưởng) mặc định xem tất cả.
  const defaultGroupId = (auth.isWorkshopAdmin || auth.isReadOnlyViewer)
    && auth.primaryGroupId
    && visibleGroupIds.includes(auth.primaryGroupId)
    ? auth.primaryGroupId
    : "all";

  // Máy của nhóm mình: thuộc nhóm, hoặc đang giữ do mượn (suy ra từ phiếu mượn đang mở, KHÔNG
  // dựa vào equipment.current_group_id), hoặc có điều chuyển mở — xem lib/equipment-data.ts.
  const {
    rows: rawEquipmentRows,
    loanByEquipment: activeLoanByEquipment,
    transferByEquipment: activeTransferByEquipment,
    repairByEquipment: activeRepairByEquipment,
  } = await loadScopedEquipment(visibleGroupIds);

  const groupNameById = new Map(groupRows.map((group) => [group.id, group.name]));

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
        isWorkshopAdmin={auth.isWorkshopAdmin}
        isReadOnlyViewer={auth.isReadOnlyViewer}
        defaultGroupId={defaultGroupId}
      />
    </div>
  );
}
