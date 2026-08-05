"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Boxes, Edit3, PackageOpen, Plus, Search, ShieldCheck, X } from "lucide-react";
import { saveEquipmentRecordAction, type EquipmentFormState } from "@/actions/equipment";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { CONDITION_LABELS, EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_DISCIPLINE_LABELS, type EquipmentDiscipline } from "@/lib/equipment-categories";

export type EquipmentPermission = {
  groupId: string;
  groupCode: string;
  groupName: string;
  equipmentPrefix: string;
  level: "viewer" | "operator" | "manager";
};

export type IndividualEquipmentRow = {
  id: string;
  managementMode: "individual";
  code: string;
  name: string;
  equipmentType: string;
  categoryCode: string;
  specification: string | null;
  unit: string;
  model: string | null;
  serial: string | null;
  brand: string | null;
  ownerGroupId: string;
  ownerGroupName: string;
  currentLocation: string | null;
  status: keyof typeof EQUIPMENT_STATUS_LABELS;
  condition: keyof typeof CONDITION_LABELS;
  recordStatus: "draft" | "active";
  notes: string | null;
};

export type QuantityToolRow = {
  id: string;
  managementMode: "quantity";
  code: string | null;
  name: string;
  equipmentType: string;
  categoryCode: string;
  specification: string | null;
  unit: string;
  quantityOnHand: string;
  ownerGroupId: string;
  ownerGroupName: string;
  recordStatus: "draft" | "active";
  notes: string | null;
};

type EditableRecord = IndividualEquipmentRow | QuantityToolRow;

const initialState: EquipmentFormState = { status: "idle" };
const disciplineOrder: EquipmentDiscipline[] = ["mechanical", "electrical", "other"];

function permissionRank(level: EquipmentPermission["level"]) {
  return level === "manager" ? 2 : level === "operator" ? 1 : 0;
}

function AssetForm({
  record,
  permissions,
  onSaved,
  onCancel,
}: {
  record: EditableRecord | null;
  permissions: EquipmentPermission[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(saveEquipmentRecordAction, initialState);
  const actionableGroups = permissions.filter((permission) => permission.level !== "viewer");
  const initialMode = record?.managementMode || "individual";
  const initialGroupId = record?.ownerGroupId || actionableGroups[0]?.groupId || "";
  const [managementMode, setManagementMode] = useState<"individual" | "quantity">(initialMode);
  const [ownerGroupId, setOwnerGroupId] = useState(initialGroupId);
  const [categoryCode, setCategoryCode] = useState(record?.categoryCode || "CK_HAN_CAT");

  const selectedGroup = permissions.find((permission) => permission.groupId === ownerGroupId);
  const canComplete = selectedGroup?.level === "manager";
  const selectedCategory = EQUIPMENT_CATEGORIES.find((category) => category.code === categoryCode) || EQUIPMENT_CATEGORIES.at(-1)!;
  const isEditing = Boolean(record);
  const isActiveRecord = record?.recordStatus === "active";
  const codePreview = record?.code || (selectedGroup
    ? managementMode === "individual"
      ? `${selectedGroup.equipmentPrefix}-XXXX`
      : `${selectedGroup.equipmentPrefix}-VT-XXXX`
    : "Sẽ tạo khi lưu");

  useEffect(() => {
    if (state.status !== "success") return;
    const timer = window.setTimeout(onSaved, 650);
    return () => window.clearTimeout(timer);
  }, [state.status, onSaved]);

  return (
    <form action={action} className="asset-form">
      <input type="hidden" name="managementMode" value={managementMode} />
      <input type="hidden" name="recordId" value={record?.id || ""} />
      {isEditing ? <input type="hidden" name="ownerGroupId" value={ownerGroupId} /> : null}

      <section className="asset-form-section">
        <div className="asset-section-heading">
          <div><span>01</span><div><strong>Phương thức quản lý</strong><small>Chọn quản lý từng máy hoặc theo số lượng.</small></div></div>
        </div>
        <div className="management-mode-grid" role="radiogroup" aria-label="Phương thức quản lý">
          <button type="button" className={managementMode === "individual" ? "is-selected" : ""} onClick={() => !isEditing && setManagementMode("individual")} disabled={isEditing}>
            <Boxes size={20} /><span><strong>Từng thiết bị</strong><small>Máy có mã riêng, serial hoặc cần theo dõi vòng đời.</small></span>
          </button>
          <button type="button" className={managementMode === "quantity" ? "is-selected" : ""} onClick={() => !isEditing && setManagementMode("quantity")} disabled={isEditing}>
            <PackageOpen size={20} /><span><strong>Theo số lượng</strong><small>Mũi khoan, taro, cảo và dụng cụ đồng loại.</small></span>
          </button>
        </div>
      </section>

      <section className="asset-form-section">
        <div className="asset-section-heading">
          <div><span>02</span><div><strong>Nhận dạng và phân loại</strong><small>Mã được hệ thống cấp tự động, không sửa thủ công.</small></div></div>
          <code className="asset-code-preview">{codePreview}</code>
        </div>
        <div className="form-grid two">
          <FormField label="Nhóm quản lý" required hint={isEditing ? "Đổi nhóm phải thực hiện bằng quy trình Điều chuyển cố định." : undefined}>
            <select name={isEditing ? undefined : "ownerGroupId"} value={ownerGroupId} onChange={(event) => setOwnerGroupId(event.target.value)} disabled={isEditing}>
              {actionableGroups.map((group) => <option key={group.groupId} value={group.groupId}>{group.groupName}</option>)}
            </select>
          </FormField>
          <FormField label="Nhóm thiết bị" required>
            <select name="categoryCode" value={categoryCode} onChange={(event) => setCategoryCode(event.target.value)}>
              {disciplineOrder.map((discipline) => (
                <optgroup key={discipline} label={EQUIPMENT_DISCIPLINE_LABELS[discipline]}>
                  {EQUIPMENT_CATEGORIES.filter((category) => category.discipline === discipline).map((category) => <option key={category.code} value={category.code}>{category.name}</option>)}
                </optgroup>
              ))}
            </select>
          </FormField>
          <FormField label="Loại dụng cụ" required hint="Có thể chọn gợi ý hoặc nhập loại mới.">
            <input name="equipmentType" defaultValue={record?.equipmentType || ""} list={`types-${categoryCode}`} placeholder="Ví dụ: Palang xích kéo tay" />
            <datalist id={`types-${categoryCode}`}>{selectedCategory.suggestedTypes.map((type) => <option key={type} value={type} />)}</datalist>
          </FormField>
          <FormField label="Tên dụng cụ" required>
            <input name="name" defaultValue={record?.name || ""} placeholder="Ví dụ: Palang xích kéo tay 3 tấn Vital" />
          </FormField>
          <FormField label="Quy cách / thông số">
            <input name="specification" defaultValue={record?.specification || ""} placeholder="Tải trọng, kích thước, dải đo..." />
          </FormField>
          <FormField label="Đơn vị tính" required>
            <input name="unit" defaultValue={record?.unit || "cái"} />
          </FormField>
        </div>
      </section>

      {managementMode === "individual" ? (
        <section className="asset-form-section">
          <div className="asset-section-heading"><div><span>03</span><div><strong>Thông tin máy</strong><small>Các trường này có thể cập nhật sau và đều được lưu lịch sử.</small></div></div></div>
          <div className="form-grid two">
            <FormField label="Hãng"><input name="brand" defaultValue={record?.managementMode === "individual" ? record.brand || "" : ""} /></FormField>
            <FormField label="Model"><input name="model" defaultValue={record?.managementMode === "individual" ? record.model || "" : ""} /></FormField>
            <FormField label="Serial"><input name="serial" defaultValue={record?.managementMode === "individual" ? record.serial || "" : ""} /></FormField>
            <FormField label="Vị trí hiện tại"><input name="currentLocation" defaultValue={record?.managementMode === "individual" ? record.currentLocation || "" : ""} /></FormField>
            <FormField label="Tình trạng ban đầu">
              <select name="condition" defaultValue={record?.managementMode === "individual" ? record.condition : "unknown"}>
                {Object.entries(CONDITION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </FormField>
          </div>
        </section>
      ) : (
        <section className="asset-form-section">
          <div className="asset-section-heading"><div><span>03</span><div><strong>Số lượng quản lý</strong><small>Một mã danh mục đại diện cho nhiều dụng cụ đồng loại.</small></div></div></div>
          <div className="form-grid two">
            <FormField label="Số lượng hiện có" required><input name="quantityOnHand" type="number" min="0" step="0.01" defaultValue={record?.managementMode === "quantity" ? record.quantityOnHand : "1"} /></FormField>
          </div>
        </section>
      )}

      <section className="asset-form-section">
        <div className="asset-section-heading"><div><span>04</span><div><strong>Ghi chú</strong><small>Thông tin bổ sung phục vụ nhận dạng và sử dụng.</small></div></div></div>
        <FormField label="Ghi chú"><textarea name="notes" defaultValue={record?.notes || ""} /></FormField>
      </section>

      {state.message ? <p className={`form-message ${state.status === "error" ? "error" : "success"}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}

      <div className="asset-form-footer">
        <Button type="button" variant="ghost" onClick={onCancel}>Hủy</Button>
        {!isActiveRecord ? <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending}>{pending ? "Đang lưu..." : "Lưu nháp"}</Button> : null}
        {isActiveRecord ? (
          <Button type="submit" name="intent" value="complete" disabled={pending}>{pending ? "Đang lưu..." : "Lưu cập nhật"}</Button>
        ) : canComplete ? (
          <Button type="submit" name="intent" value="complete" disabled={pending}>{pending ? "Đang hoàn thành..." : "Hoàn thành"}</Button>
        ) : null}
      </div>
      {!canComplete && !isActiveRecord ? <p className="permission-hint"><ShieldCheck size={14} /> Operator được lưu nháp; Manager của nhóm mới được hoàn thành hồ sơ.</p> : null}
    </form>
  );
}

export function EquipmentWorkspace({
  permissions,
  equipmentRows,
  toolRows,
}: {
  permissions: EquipmentPermission[];
  equipmentRows: IndividualEquipmentRow[];
  toolRows: QuantityToolRow[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<EditableRecord | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const actionablePermissions = permissions.filter((permission) => permissionRank(permission.level) >= 1);
  const permissionByGroup = useMemo(() => new Map(permissions.map((permission) => [permission.groupId, permission])), [permissions]);
  const normalizedSearch = search.trim().toLocaleLowerCase("vi");

  const filteredEquipment = equipmentRows.filter((row) => {
    const matchesSearch = !normalizedSearch || `${row.code} ${row.name} ${row.equipmentType} ${row.ownerGroupName}`.toLocaleLowerCase("vi").includes(normalizedSearch);
    const matchesGroup = groupFilter === "all" || row.ownerGroupId === groupFilter;
    const matchesStatus = statusFilter === "all" || row.recordStatus === statusFilter;
    return matchesSearch && matchesGroup && matchesStatus;
  });
  const filteredTools = toolRows.filter((row) => {
    const matchesSearch = !normalizedSearch || `${row.code || ""} ${row.name} ${row.equipmentType} ${row.ownerGroupName}`.toLocaleLowerCase("vi").includes(normalizedSearch);
    const matchesGroup = groupFilter === "all" || row.ownerGroupId === groupFilter;
    const matchesStatus = statusFilter === "all" || row.recordStatus === statusFilter;
    return matchesSearch && matchesGroup && matchesStatus;
  });

  function openNew() {
    setSelectedRecord(null);
    setFormKey((value) => value + 1);
    setDialogOpen(true);
  }

  function openEdit(record: EditableRecord) {
    setSelectedRecord(record);
    setFormKey((value) => value + 1);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setSelectedRecord(null);
  }

  return (
    <>
      <div className="equipment-toolbar">
        <div className="equipment-filter-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã, tên, loại dụng cụ..." aria-label="Tìm dụng cụ" /></div>
        <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} aria-label="Lọc nhóm">
          <option value="all">Tất cả nhóm được phân quyền</option>
          {permissions.map((permission) => <option key={permission.groupId} value={permission.groupId}>{permission.groupName}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Lọc trạng thái hồ sơ">
          <option value="all">Tất cả hồ sơ</option>
          <option value="active">Đã hoàn thành</option>
          <option value="draft">Bản nháp</option>
        </select>
        {actionablePermissions.length ? <Button type="button" onClick={openNew}><Plus size={16} /> Thêm dụng cụ</Button> : null}
      </div>

      {!actionablePermissions.length ? (
        <div className="viewer-banner"><ShieldCheck size={18} /><div><strong>Nhân viên — Xem & mượn</strong><span>Không được sửa danh mục, nhưng vẫn có thể lập thủ tục Mượn máy và Mượn nhanh.</span></div></div>
      ) : null}

      <div className="equipment-summary-strip">
        <span><Boxes size={16} /> <strong>{filteredEquipment.length}</strong> máy/CCDC có mã</span>
        <span><PackageOpen size={16} /> <strong>{filteredTools.length}</strong> dụng cụ theo số lượng</span>
        <span><i /> Mã được cấp tự động theo nhóm</span>
      </div>

      <section className="card table-card">
        <div className="card-header"><div><h2 className="card-title">Máy/CCDC quản lý từng thiết bị</h2><p className="card-subtitle">Mỗi thiết bị có một mã cố định trong toàn bộ vòng đời.</p></div></div>
        <div className="card-content">
          <DataTable
            headers={["Mã", "Tên dụng cụ", "Loại", "Nhóm quản lý", "Vị trí", "Tình trạng", "Hồ sơ", "Thao tác"]}
            rows={filteredEquipment.map((row) => {
              const permission = permissionByGroup.get(row.ownerGroupId);
              const canEdit = permission && permissionRank(permission.level) >= 1;
              return [
                <strong key="code">{row.code}</strong>,
                <div key="name" className="asset-name-cell"><strong>{row.name}</strong><small>{row.specification || "Chưa có thông số"}</small></div>,
                row.equipmentType,
                row.ownerGroupName,
                row.currentLocation || "—",
                <StatusBadge key="condition" label={CONDITION_LABELS[row.condition]} tone={row.condition === "good" ? "success" : row.condition === "irreparable" ? "danger" : "warning"} />,
                <StatusBadge key="record" label={row.recordStatus === "active" ? EQUIPMENT_STATUS_LABELS[row.status] : "Bản nháp"} tone={row.recordStatus === "active" ? (row.status === "in_use_owner" ? "success" : "info") : "neutral"} />,
                canEdit ? <Button key="edit" type="button" size="sm" variant="ghost" onClick={() => openEdit(row)}><Edit3 size={14} /> Chỉnh sửa</Button> : <span key="view">Chỉ xem</span>,
              ];
            })}
            empty={<EmptyState title="Chưa có máy/CCDC" description="Dùng nút Thêm dụng cụ để tạo hồ sơ đầu tiên cho nhóm." />}
          />
        </div>
      </section>

      <section className="card table-card section-gap">
        <div className="card-header"><div><h2 className="card-title">Dụng cụ quản lý theo số lượng</h2><p className="card-subtitle">Một mã danh mục đại diện cho nhiều dụng cụ đồng loại.</p></div></div>
        <div className="card-content">
          <DataTable
            headers={["Mã", "Tên dụng cụ", "Loại", "Nhóm quản lý", "Số lượng", "Hồ sơ", "Thao tác"]}
            rows={filteredTools.map((row) => {
              const permission = permissionByGroup.get(row.ownerGroupId);
              const canEdit = permission && permissionRank(permission.level) >= 1;
              return [
                <strong key="code">{row.code || "Chưa cấp mã"}</strong>,
                <div key="name" className="asset-name-cell"><strong>{row.name}</strong><small>{row.specification || "Chưa có quy cách"}</small></div>,
                row.equipmentType,
                row.ownerGroupName,
                <span key="quantity" className="numeric"><strong>{row.quantityOnHand}</strong> {row.unit}</span>,
                <StatusBadge key="record" label={row.recordStatus === "active" ? "Đã hoàn thành" : "Bản nháp"} tone={row.recordStatus === "active" ? "success" : "neutral"} />,
                canEdit ? <Button key="edit" type="button" size="sm" variant="ghost" onClick={() => openEdit(row)}><Edit3 size={14} /> Chỉnh sửa</Button> : <span key="view">Chỉ xem</span>,
              ];
            })}
            empty={<EmptyState title="Chưa có dụng cụ theo số lượng" description="Mũi khoan, taro, dụng cụ đo và dụng cụ đồng loại có thể quản lý tại đây." />}
          />
        </div>
      </section>

      {dialogOpen ? (
        <div className="asset-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title">
            <header className="asset-modal-header">
              <div><span className="modal-kicker">DỤNG CỤ NHÓM TÔI</span><h2 id="asset-dialog-title">{selectedRecord ? `Cập nhật ${selectedRecord.code || selectedRecord.name}` : "Thêm dụng cụ"}</h2><p>Mã do hệ thống tự cấp; mọi lần cập nhật đều được ghi lịch sử.</p></div>
              <button type="button" className="icon-button" onClick={closeDialog} aria-label="Đóng"><X size={18} /></button>
            </header>
            <div className="asset-modal-body">
              <AssetForm key={formKey} record={selectedRecord} permissions={permissions} onSaved={closeDialog} onCancel={closeDialog} />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
