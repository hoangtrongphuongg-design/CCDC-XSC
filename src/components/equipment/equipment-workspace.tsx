"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  Copy,
  Edit3,
  Eye,
  Filter,
  History,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { saveEquipmentRecordAction, type EquipmentFormState } from "@/actions/equipment";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { CONDITION_LABELS, EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_DISCIPLINE_LABELS,
  type EquipmentDiscipline,
} from "@/lib/equipment-categories";

export type EquipmentPermission = {
  groupId: string;
  groupCode: string;
  groupName: string;
  equipmentPrefix: string;
  level: "viewer" | "operator" | "manager";
};

export type IndividualEquipmentRow = {
  id: string;
  code: string;
  legacyCode: string | null;
  name: string;
  equipmentType: string;
  categoryCode: string;
  technicalSpecs: string | null;
  technicalNote: string | null;
  model: string | null;
  serial: string | null;
  brand: string | null;
  manufactureYear: number | null;
  commissionYear: number | null;
  originType: "existing" | "new_purchase" | "other";
  recordedDate: string;
  originGroupId: string;
  originGroupName: string;
  ownerGroupId: string;
  ownerGroupName: string;
  currentGroupId: string;
  currentGroupName: string;
  currentLocation: string | null;
  status: keyof typeof EQUIPMENT_STATUS_LABELS;
  condition: keyof typeof CONDITION_LABELS;
  purchaseDate: string | null;
  poContractNo: string | null;
  supplierName: string | null;
  purchasePrice: string | null;
  warrantyUntil: string | null;
  purchaseNote: string | null;
  notes: string | null;
  recordStatus: "draft" | "active";
  activeLoanOwnerGroupId: string | null;
  activeLoanBorrowerGroupId: string | null;
  activeLoanStatus: string | null;
  activeTransferSourceGroupId: string | null;
  activeTransferTargetGroupId: string | null;
  activeTransferStatus: string | null;
  activeRepairStatus: string | null;
  updatedAt: string;
};

export type EquipmentAuditRow = {
  id: string;
  equipmentId: string;
  action: string;
  description: string;
  beforeData: unknown;
  afterData: unknown;
  reason: string | null;
  createdAt: string;
  actorName: string | null;
  actorGroupName: string | null;
  actorRole: string | null;
};

type EquipmentTypeRow = { categoryCode: string; name: string };
type EditorMode = "create" | "edit" | "clone";
type DetailTab = "detail" | "history";
type KpiFilter = "all" | "available" | "borrowed" | "lent" | "repair" | "transfer";

const initialState: EquipmentFormState = { status: "idle" };
const disciplineOrder: EquipmentDiscipline[] = ["mechanical", "electrical", "other"];
const originLabels = {
  existing: "CCDC hiện hữu",
  new_purchase: "Mua mới / Cấp phát ban đầu",
  other: "Khác",
} as const;

const simpleConditionOptions = [
  ["good", "Tốt"],
  ["limited", "Cần theo dõi"],
  ["major_damage", "Hư hỏng"],
  ["unknown", "Chưa đánh giá"],
] as const;

const auditFieldLabels: Record<string, string> = {
  code: "Mã hệ thống",
  legacyCode: "Mã hiện hữu",
  name: "Tên CCDC",
  equipmentType: "Loại dụng cụ",
  categoryCode: "Nhóm thiết bị",
  technicalSpecs: "Thông số kỹ thuật",
  technicalNote: "Ghi chú kỹ thuật",
  brand: "Hãng",
  model: "Model",
  serial: "Serial",
  manufactureYear: "Năm sản xuất",
  commissionYear: "Năm đưa vào sử dụng",
  originType: "Nguồn hình thành",
  recordedDate: "Ngày ghi nhận",
  originGroupId: "Nhóm gốc",
  ownerGroupId: "Nhóm quản lý",
  currentLocation: "Vị trí",
  status: "Trạng thái",
  condition: "Tình trạng",
  purchaseDate: "Ngày mua / tiếp nhận",
  poContractNo: "Số PO/HĐ",
  supplierName: "Nhà cung cấp",
  purchasePrice: "Đơn giá mua",
  warrantyUntil: "Bảo hành đến",
  purchaseNote: "Ghi chú mua sắm",
  notes: "Ghi chú",
};

function permissionRank(level: EquipmentPermission["level"]) {
  return level === "manager" ? 2 : level === "operator" ? 1 : 0;
}

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("vi-VN").format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatMoney(value: string | null) {
  if (!value) return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(numeric) + " đ";
}

function normalizePurchasePrice(value: string | null | undefined) {
  if (!value) return "";
  const integerPart = value.split(".")[0]?.replace(/\D/g, "") || "";
  return integerPart.replace(/^0+(?=\d)/, "").slice(0, 16);
}

function formatPurchasePriceInput(value: string) {
  return value ? value.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
}

function normalizeAuditObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function printableAuditValue(key: string, value: unknown, groupNames?: Map<string, string>) {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "condition" && typeof value === "string" && value in CONDITION_LABELS) {
    return CONDITION_LABELS[value as keyof typeof CONDITION_LABELS];
  }
  if (key === "status" && typeof value === "string" && value in EQUIPMENT_STATUS_LABELS) {
    return EQUIPMENT_STATUS_LABELS[value as keyof typeof EQUIPMENT_STATUS_LABELS];
  }
  if (key === "originType" && typeof value === "string" && value in originLabels) {
    return originLabels[value as keyof typeof originLabels];
  }
  if ((key === "originGroupId" || key === "ownerGroupId") && typeof value === "string") {
    return groupNames?.get(value) || value;
  }
  if (key === "categoryCode" && typeof value === "string") {
    return EQUIPMENT_CATEGORIES.find((item) => item.code === value)?.name || value;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getAuditChanges(row: EquipmentAuditRow, groupNames?: Map<string, string>) {
  const before = normalizeAuditObject(row.beforeData);
  const after = normalizeAuditObject(row.afterData);
  return Object.keys(auditFieldLabels)
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({
      key,
      label: auditFieldLabels[key],
      oldValue: printableAuditValue(key, before[key], groupNames),
      newValue: printableAuditValue(key, after[key], groupNames),
    }));
}

function statusTone(status: IndividualEquipmentRow["status"]): "neutral" | "info" | "success" | "warning" | "danger" {
  if (status === "in_use_owner") return "success";
  if (status === "repairing" || status === "wait_repair_confirm" || status === "wait_inspection") return "warning";
  if (status === "wait_disposal" || status === "disposal_warehouse" || status === "inactive") return "danger";
  return "info";
}

function conditionTone(condition: IndividualEquipmentRow["condition"]): "neutral" | "info" | "success" | "warning" | "danger" {
  if (condition === "good") return "success";
  if (["major_damage", "irreparable"].includes(condition)) return "danger";
  if (condition === "unknown") return "neutral";
  return "warning";
}

function AssetForm({
  mode,
  record,
  permissions,
  typeRows,
  isWorkshopAdmin,
  onSaved,
  onCancel,
}: {
  mode: EditorMode;
  record: IndividualEquipmentRow | null;
  permissions: EquipmentPermission[];
  typeRows: EquipmentTypeRow[];
  isWorkshopAdmin: boolean;
  onSaved: (afterSave: "close" | "add_next") => void;
  onCancel: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(saveEquipmentRecordAction, initialState);
  const isEditing = mode === "edit" && Boolean(record);
  const isClone = mode === "clone" && Boolean(record);
  const actionableGroups = permissions.filter((permission) => permissionRank(permission.level) >= 1);
  const initialGroupId = record?.ownerGroupId || actionableGroups[0]?.groupId || permissions[0]?.groupId || "";
  const [ownerGroupId, setOwnerGroupId] = useState(initialGroupId);
  const [categoryCode, setCategoryCode] = useState(record?.categoryCode || "CK_HAN_CAT");
  const [originType, setOriginType] = useState<IndividualEquipmentRow["originType"]>(isClone && !isWorkshopAdmin ? "existing" : record?.originType || "existing");
  const [condition, setCondition] = useState<string>(record?.condition || "unknown");
  const [status, setStatus] = useState<string>(record?.status || "in_use_owner");
  const [purchasePrice, setPurchasePrice] = useState(() => normalizePurchasePrice(record?.purchasePrice));

  const selectedGroup = permissions.find((permission) => permission.groupId === ownerGroupId);
  const codePreview = isEditing && record
    ? record.code
    : selectedGroup
      ? `${selectedGroup.equipmentPrefix}-XXXX`
      : "Sẽ tạo khi lưu";

  const dynamicTypeSuggestions = useMemo(() => {
    const existing = typeRows.filter((item) => item.categoryCode === categoryCode).map((item) => item.name);
    const predefined = EQUIPMENT_CATEGORIES.find((category) => category.code === categoryCode)?.suggestedTypes || [];
    return Array.from(new Set([...predefined, ...existing])).sort((a, b) => a.localeCompare(b, "vi"));
  }, [categoryCode, typeRows]);

  useEffect(() => {
    if (state.status !== "success") return;
    if (state.afterSave === "add_next" && !isEditing) {
      formRef.current?.reset();
      setPurchasePrice("");
      setCondition(originType === "new_purchase" ? "good" : "unknown");
      setStatus("in_use_owner");
      onSaved("add_next");
      return;
    }
    const timer = window.setTimeout(() => onSaved("close"), 500);
    return () => window.clearTimeout(timer);
  }, [state.status, state.afterSave, isEditing, originType, onSaved]);

  useEffect(() => {
    if (mode !== "create") return;
    setCondition(originType === "new_purchase" ? "good" : "unknown");
  }, [originType, mode]);

  const defaultLegacyCode = isClone ? "" : record?.legacyCode || "";
  const defaultSerial = isClone ? "" : record?.serial || "";
  const defaultRecordedDate = record?.recordedDate || todayIso();

  return (
    <form ref={formRef} action={action} className="asset-form">
      <input type="hidden" name="recordId" value={isEditing ? record?.id || "" : ""} />
      <input type="hidden" name="ownerGroupId" value={ownerGroupId} />
      <input type="hidden" name="originType" value={originType} />
      <input type="hidden" name="condition" value={condition} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="purchasePrice" value={purchasePrice} />

      <section className="asset-form-section">
        <div className="asset-section-heading">
          <div><span>01</span><div><strong>Nguồn và quản lý</strong><small>Xác định nguồn hình thành và nhóm quản lý ban đầu.</small></div></div>
          <code className="asset-code-preview">{codePreview}</code>
        </div>
        <div className="form-grid two">
          <FormField label="Hình thức ghi nhận" required>
            <select value={originType} onChange={(event) => setOriginType(event.target.value as IndividualEquipmentRow["originType"])} disabled={!isWorkshopAdmin || isEditing}>
              <option value="existing">CCDC hiện hữu</option>
              {isWorkshopAdmin ? <option value="new_purchase">Mua mới / Cấp phát ban đầu</option> : null}
              {isWorkshopAdmin ? <option value="other">Khác</option> : null}
            </select>
          </FormField>
          <FormField label="Nhóm quản lý" required hint={isEditing ? "Đổi nhóm thông thường phải thực hiện bằng Điều chuyển cố định." : isWorkshopAdmin ? "Quản lý Xưởng / Admin được chọn nhóm cấp phát ban đầu." : "Chỉ chọn được nhóm bạn có quyền quản lý."}>
            <select value={ownerGroupId} onChange={(event) => setOwnerGroupId(event.target.value)} disabled={isEditing}>
              {(isWorkshopAdmin ? permissions : actionableGroups).map((group) => <option key={group.groupId} value={group.groupId}>{group.groupName}</option>)}
            </select>
          </FormField>
          <FormField label="Ngày ghi nhận" required>
            <input name="recordedDate" type="date" defaultValue={defaultRecordedDate} />
          </FormField>
        </div>
      </section>

      <section className="asset-form-section">
        <div className="asset-section-heading"><div><span>02</span><div><strong>Thông tin nhận dạng</strong><small>Mã hệ thống được cấp tự động; mã hiện hữu dùng để đối chiếu máy đã bấm/khắc mã ngoài thực tế.</small></div></div></div>
        <div className="form-grid two">
          <FormField label="Tên CCDC" required><input name="name" defaultValue={record?.name || ""} placeholder="Ví dụ: Máy hàn MIG Panasonic" /></FormField>
          <FormField label="Mã hiện hữu / mã đã gán"><input name="legacyCode" defaultValue={defaultLegacyCode} placeholder="Ví dụ: MH-05" /></FormField>
          <FormField label="Hãng"><input name="brand" defaultValue={record?.brand || ""} placeholder="Bosch, Makita, Enerpac..." /></FormField>
          <FormField label="Model"><input name="model" defaultValue={record?.model || ""} /></FormField>
          <FormField label="Serial"><input name="serial" defaultValue={defaultSerial} /></FormField>
          <FormField label="Năm sản xuất"><input name="manufactureYear" type="number" min="1900" max="2200" defaultValue={record?.manufactureYear || ""} /></FormField>
          <FormField label="Năm đưa vào sử dụng"><input name="commissionYear" type="number" min="1900" max="2200" defaultValue={record?.commissionYear || ""} /></FormField>
          <FormField label="Đơn giá mua (VNĐ)" hint="Giá mua của 01 máy/CCDC; để trống nếu chưa có thông tin.">
            <input
              type="text"
              inputMode="numeric"
              value={formatPurchasePriceInput(purchasePrice)}
              onChange={(event) => setPurchasePrice(event.target.value.replace(/\D/g, "").slice(0, 16))}
              placeholder="Ví dụ: 25.000.000"
              aria-label="Đơn giá mua"
            />
          </FormField>
        </div>
      </section>

      <section className="asset-form-section">
        <div className="asset-section-heading"><div><span>03</span><div><strong>Phân loại CCDC</strong><small>Chọn nhóm thiết bị và loại dụng cụ. Có thể nhập loại mới nếu chưa có trong gợi ý.</small></div></div></div>
        <div className="form-grid two">
          <FormField label="Nhóm thiết bị" required>
            <select name="categoryCode" value={categoryCode} onChange={(event) => setCategoryCode(event.target.value)}>
              {disciplineOrder.map((discipline) => (
                <optgroup key={discipline} label={EQUIPMENT_DISCIPLINE_LABELS[discipline]}>
                  {EQUIPMENT_CATEGORIES.filter((category) => category.discipline === discipline).map((category) => <option key={category.code} value={category.code}>{category.name}</option>)}
                </optgroup>
              ))}
            </select>
          </FormField>
          <FormField label="Loại dụng cụ" required hint="Nếu gõ loại mới, hệ thống sẽ ghi nhận để dùng cho các lần nhập sau.">
            <input name="equipmentType" defaultValue={record?.equipmentType || ""} list={`equipment-types-${categoryCode}`} placeholder="Ví dụ: Máy hàn MIG/MAG" />
            <datalist id={`equipment-types-${categoryCode}`}>{dynamicTypeSuggestions.map((type) => <option key={type} value={type} />)}</datalist>
          </FormField>
        </div>
      </section>

      <section className="asset-form-section">
        <div className="asset-section-heading"><div><span>04</span><div><strong>Thông tin kỹ thuật</strong><small>Dùng trường tự do để phù hợp nhiều loại thiết bị khác nhau.</small></div></div></div>
        <div className="form-grid">
          <FormField label="Thông số kỹ thuật"><textarea name="technicalSpecs" rows={5} defaultValue={record?.technicalSpecs || ""} placeholder={'Ví dụ:\nĐiện áp: 380 V\nCông suất: 15 kW\nKhối lượng: 120 kg'} /></FormField>
          <FormField label="Ghi chú kỹ thuật"><textarea name="technicalNote" rows={3} defaultValue={record?.technicalNote || ""} /></FormField>
        </div>
      </section>

      <section className="asset-form-section">
        <div className="asset-section-heading"><div><span>05</span><div><strong>Hiện trạng</strong><small>Tình trạng kỹ thuật và trạng thái nghiệp vụ là hai thông tin riêng.</small></div></div></div>
        <div className="form-grid two">
          <FormField label="Tình trạng kỹ thuật" required>
            <select value={condition} onChange={(event) => setCondition(event.target.value)}>
              {simpleConditionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              {record && !simpleConditionOptions.some(([value]) => value === record.condition) ? <option value={record.condition}>{CONDITION_LABELS[record.condition]}</option> : null}
            </select>
          </FormField>
          <FormField label="Trạng thái nghiệp vụ" required hint="Giai đoạn nhập dữ liệu ban đầu cho phép chọn theo thực tế. Sau này workflow sẽ tự điều khiển trạng thái.">
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {Object.entries(EQUIPMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </FormField>
          <FormField label="Vị trí"><input name="currentLocation" defaultValue={record?.currentLocation || ""} placeholder="Kho Workshop, Tủ số 2..." /></FormField>
          <FormField label="Ghi chú"><textarea name="notes" rows={3} defaultValue={record?.notes || ""} /></FormField>
        </div>
      </section>

      {originType === "new_purchase" ? (
        <section className="asset-form-section purchase-section">
          <div className="asset-section-heading"><div><span>06</span><div><strong>Thông tin mua sắm</strong><small>Không bắt buộc; chỉ lưu khi thông tin có sẵn.</small></div></div></div>
          <div className="form-grid two">
            <FormField label="Ngày mua / tiếp nhận"><input name="purchaseDate" type="date" defaultValue={record?.purchaseDate || ""} /></FormField>
            <FormField label="Số PO/HĐ"><input name="poContractNo" defaultValue={record?.poContractNo || ""} /></FormField>
            <FormField label="Nhà cung cấp"><input name="supplierName" defaultValue={record?.supplierName || ""} /></FormField>
            <FormField label="Bảo hành đến"><input name="warrantyUntil" type="date" defaultValue={record?.warrantyUntil || ""} /></FormField>
            <FormField label="Ghi chú mua sắm"><textarea name="purchaseNote" rows={3} defaultValue={record?.purchaseNote || ""} /></FormField>
          </div>
        </section>
      ) : null}

      {isEditing && isWorkshopAdmin && record ? (
        <section className="asset-form-section admin-correction-section">
          <div className="asset-section-heading"><div><span>!</span><div><strong>Hiệu chỉnh của Quản lý Xưởng / Admin</strong><small>Chỉ dùng khi dữ liệu hiện tại bị nhập sai. Mọi thay đổi đều được ghi lịch sử.</small></div></div></div>
          <div className="admin-warning"><AlertTriangle size={17} /><span>Nhóm quản lý, nhóm gốc, nguồn hình thành và mã hệ thống là trường nhạy cảm. Không dùng phần này thay cho workflow Điều chuyển.</span></div>
          <div className="form-grid two">
            <FormField label="Mã hệ thống"><input name="adminSystemCode" defaultValue={record.code} /></FormField>
            <FormField label="Nhóm quản lý hiện tại">
              <select name="adminOwnerGroupId" defaultValue={record.ownerGroupId}>{permissions.map((group) => <option key={group.groupId} value={group.groupId}>{group.groupName}</option>)}</select>
            </FormField>
            <FormField label="Nhóm gốc">
              <select name="adminOriginGroupId" defaultValue={record.originGroupId}>{permissions.map((group) => <option key={group.groupId} value={group.groupId}>{group.groupName}</option>)}</select>
            </FormField>
            <FormField label="Nguồn hình thành">
              <select name="adminOriginType" defaultValue={record.originType}>
                <option value="existing">CCDC hiện hữu</option>
                <option value="new_purchase">Mua mới / Cấp phát ban đầu</option>
                <option value="other">Khác</option>
              </select>
            </FormField>
            <FormField label="Lý do hiệu chỉnh" required className="span-two"><textarea name="correctionReason" rows={3} placeholder="Ví dụ: Sửa nhóm quản lý do nhập nhầm khi khởi tạo dữ liệu." /></FormField>
          </div>
        </section>
      ) : null}

      {state.message ? (
        <p className={`form-message ${state.status === "error" ? "error" : state.status === "confirm" ? "warning" : "success"}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
      ) : null}

      <div className="asset-form-footer">
        <Button type="button" variant="ghost" onClick={onCancel}>Hủy</Button>
        {state.status === "confirm" ? (
          <Button type="submit" name="confirmDuplicates" value="true" variant="danger" disabled={pending}>Vẫn lưu sau khi kiểm tra</Button>
        ) : isEditing ? (
          <Button type="submit" name="afterSave" value="close" disabled={pending}>{pending ? "Đang lưu..." : "Lưu cập nhật"}</Button>
        ) : (
          <>
            <Button type="submit" name="afterSave" value="add_next" variant="secondary" disabled={pending}>{pending ? "Đang lưu..." : "Lưu & thêm tiếp"}</Button>
            <Button type="submit" name="afterSave" value="close" disabled={pending}>{pending ? "Đang lưu..." : "Lưu"}</Button>
          </>
        )}
      </div>
    </form>
  );
}

function DetailModal({
  row,
  tab,
  audits,
  canEdit,
  onClose,
  onEdit,
  onClone,
  onTab,
  groupNames,
}: {
  row: IndividualEquipmentRow;
  tab: DetailTab;
  audits: EquipmentAuditRow[];
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onClone: () => void;
  onTab: (tab: DetailTab) => void;
  groupNames: Map<string, string>;
}) {
  const category = EQUIPMENT_CATEGORIES.find((item) => item.code === row.categoryCode)?.name || row.categoryCode;
  return (
    <div className="asset-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="asset-modal asset-detail-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-detail-title">
        <header className="asset-modal-header">
          <div><span className="modal-kicker">{row.code}</span><h2 id="equipment-detail-title">{row.name}</h2><p>{row.ownerGroupName}</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </header>
        <div className="asset-detail-status-row">
          <StatusBadge label={EQUIPMENT_STATUS_LABELS[row.status]} tone={statusTone(row.status)} />
          <StatusBadge label={CONDITION_LABELS[row.condition]} tone={conditionTone(row.condition)} />
          {row.legacyCode ? <span className="legacy-code-chip">Mã hiện hữu: {row.legacyCode}</span> : null}
        </div>
        <div className="asset-detail-tabs">
          <button type="button" className={tab === "detail" ? "is-active" : ""} onClick={() => onTab("detail")}><ClipboardList size={15} /> Chi tiết</button>
          <button type="button" className={tab === "history" ? "is-active" : ""} onClick={() => onTab("history")}><History size={15} /> Lịch sử ({audits.length})</button>
        </div>
        <div className="asset-modal-body asset-detail-body">
          {tab === "detail" ? (
            <div className="equipment-detail-sections">
              <section><h3>Thông tin chung</h3><dl>
                <div><dt>Mã hệ thống</dt><dd>{row.code}</dd></div>
                <div><dt>Mã hiện hữu</dt><dd>{row.legacyCode || "—"}</dd></div>
                <div><dt>Nhóm quản lý</dt><dd>{row.ownerGroupName}</dd></div>
                <div><dt>Nhóm gốc</dt><dd>{row.originGroupName}</dd></div>
                <div><dt>Nguồn hình thành</dt><dd>{originLabels[row.originType]}</dd></div>
                <div><dt>Ngày ghi nhận</dt><dd>{formatDate(row.recordedDate)}</dd></div>
                <div><dt>Vị trí</dt><dd>{row.currentLocation || "—"}</dd></div>
              </dl></section>
              <section><h3>Phân loại & nhận dạng</h3><dl>
                <div><dt>Nhóm thiết bị</dt><dd>{category}</dd></div>
                <div><dt>Loại dụng cụ</dt><dd>{row.equipmentType}</dd></div>
                <div><dt>Hãng</dt><dd>{row.brand || "—"}</dd></div>
                <div><dt>Model</dt><dd>{row.model || "—"}</dd></div>
                <div><dt>Serial</dt><dd>{row.serial || "—"}</dd></div>
                <div><dt>Năm sản xuất</dt><dd>{row.manufactureYear || "—"}</dd></div>
                <div><dt>Năm đưa vào sử dụng</dt><dd>{row.commissionYear || "—"}</dd></div>
              </dl></section>
              <section><h3>Thông tin kỹ thuật</h3><div className="detail-long-text"><strong>Thông số kỹ thuật</strong><pre>{row.technicalSpecs || "—"}</pre></div><div className="detail-long-text"><strong>Ghi chú kỹ thuật</strong><p>{row.technicalNote || "—"}</p></div></section>
              <section><h3>Mua sắm</h3><dl>
                <div><dt>Ngày mua / tiếp nhận</dt><dd>{formatDate(row.purchaseDate)}</dd></div>
                <div><dt>Số PO/HĐ</dt><dd>{row.poContractNo || "—"}</dd></div>
                <div><dt>Nhà cung cấp</dt><dd>{row.supplierName || "—"}</dd></div>
                <div><dt>Đơn giá mua</dt><dd>{formatMoney(row.purchasePrice)}</dd></div>
                <div><dt>Bảo hành đến</dt><dd>{formatDate(row.warrantyUntil)}</dd></div>
              </dl>{row.purchaseNote ? <div className="detail-long-text"><strong>Ghi chú mua sắm</strong><p>{row.purchaseNote}</p></div> : null}</section>
              {row.notes ? <section><h3>Ghi chú</h3><p>{row.notes}</p></section> : null}
            </div>
          ) : (
            <div className="equipment-history-list">
              {audits.length ? audits.map((audit) => {
                const changes = getAuditChanges(audit, groupNames);
                return <article key={audit.id} className="equipment-history-item">
                  <div className="history-head"><strong>{audit.description}</strong><time>{formatDateTime(audit.createdAt)}</time></div>
                  <div className="history-meta"><span>{audit.actorName || "Hệ thống"}</span><span>{audit.actorRole || "—"}</span><span>{audit.actorGroupName || "—"}</span></div>
                  {audit.reason ? <p className="history-reason"><strong>Lý do:</strong> {audit.reason}</p> : null}
                  {changes.length ? <div className="history-changes">{changes.map((change) => <div key={change.key}><strong>{change.label}</strong><span>{change.oldValue}</span><span>→</span><span>{change.newValue}</span></div>)}</div> : null}
                </article>;
              }) : <EmptyState title="Chưa có lịch sử" description="Các lần tạo và cập nhật CCDC sẽ xuất hiện tại đây." />}
            </div>
          )}
        </div>
        <footer className="asset-detail-footer">
          {canEdit ? <Button type="button" variant="secondary" onClick={onClone}><Copy size={15} /> Sao chép để tạo mới</Button> : null}
          {canEdit ? <Button type="button" onClick={onEdit}><Edit3 size={15} /> Chỉnh sửa</Button> : null}
        </footer>
      </section>
    </div>
  );
}

export function EquipmentWorkspace({
  permissions,
  equipmentRows,
  typeRows,
  auditRows,
  isWorkshopAdmin,
  isReadOnlyViewer,
}: {
  permissions: EquipmentPermission[];
  equipmentRows: IndividualEquipmentRow[];
  typeRows: EquipmentTypeRow[];
  auditRows: EquipmentAuditRow[];
  isWorkshopAdmin: boolean;
  isReadOnlyViewer: boolean;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("create");
  const [editorRecord, setEditorRecord] = useState<IndividualEquipmentRow | null>(null);
  const [detailRecord, setDetailRecord] = useState<IndividualEquipmentRow | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("detail");
  const [formKey, setFormKey] = useState(0);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>("all");
  const [mobileTab, setMobileTab] = useState<"all" | "in_use_owner" | "on_loan" | "repairing">("all");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const actionablePermissions = permissions.filter((permission) => permissionRank(permission.level) >= 1);
  const permissionByGroup = useMemo(() => new Map(permissions.map((permission) => [permission.groupId, permission])), [permissions]);
  const groupNameById = useMemo(() => new Map(permissions.map((permission) => [permission.groupId, permission.groupName])), [permissions]);
  const auditByEquipment = useMemo(() => {
    const map = new Map<string, EquipmentAuditRow[]>();
    auditRows.forEach((row) => map.set(row.equipmentId, [...(map.get(row.equipmentId) || []), row]));
    return map;
  }, [auditRows]);
  const typeOptions = useMemo(() => Array.from(new Set(equipmentRows.filter((row) => categoryFilter === "all" || row.categoryCode === categoryFilter).map((row) => row.equipmentType))).sort((a, b) => a.localeCompare(b, "vi")), [equipmentRows, categoryFilter]);
  const normalizedSearch = search.trim().toLocaleLowerCase("vi");
  const canAdd = !isReadOnlyViewer && (isWorkshopAdmin || actionablePermissions.length > 0);

  const scopeGroupIds = useMemo(() => new Set(groupFilter === "all" ? permissions.map((permission) => permission.groupId) : [groupFilter]), [groupFilter, permissions]);
  const inScope = (groupId: string | null | undefined) => Boolean(groupId && scopeGroupIds.has(groupId));
  const physicalLoanStatuses = new Set(["on_loan", "return_requested", "incident"]);

  const baseFilteredEquipment = equipmentRows.filter((row) => {
    const haystack = `${row.code} ${row.legacyCode || ""} ${row.name} ${row.equipmentType} ${row.brand || ""} ${row.model || ""} ${row.serial || ""} ${row.ownerGroupName} ${row.currentGroupName}`.toLocaleLowerCase("vi");
    const matchesGroup = groupFilter === "all"
      || row.ownerGroupId === groupFilter
      || row.currentGroupId === groupFilter
      || row.activeTransferSourceGroupId === groupFilter
      || row.activeTransferTargetGroupId === groupFilter;
    return (!normalizedSearch || haystack.includes(normalizedSearch))
      && matchesGroup
      && (categoryFilter === "all" || row.categoryCode === categoryFilter)
      && (typeFilter === "all" || row.equipmentType === typeFilter)
      && (conditionFilter === "all" || row.condition === conditionFilter)
      && (statusFilter === "all" || row.status === statusFilter)
      && (mobileTab === "all" || row.status === mobileTab);
  });

  const isBorrowedByScope = (row: IndividualEquipmentRow) => Boolean(
    row.activeLoanStatus
      && physicalLoanStatuses.has(row.activeLoanStatus)
      && inScope(row.activeLoanBorrowerGroupId),
  );
  const isLentByScope = (row: IndividualEquipmentRow) => Boolean(
    row.activeLoanStatus
      && physicalLoanStatuses.has(row.activeLoanStatus)
      && inScope(row.activeLoanOwnerGroupId),
  );
  const isRepairInScope = (row: IndividualEquipmentRow) => Boolean(
    row.activeRepairStatus && (inScope(row.ownerGroupId) || inScope(row.currentGroupId)),
  );
  const isTransferInScope = (row: IndividualEquipmentRow) => Boolean(
    row.activeTransferStatus
      && (inScope(row.activeTransferSourceGroupId) || inScope(row.activeTransferTargetGroupId)),
  );

  const summary = {
    total: baseFilteredEquipment.length,
    available: baseFilteredEquipment.filter((row) => row.status === "in_use_owner" && row.ownerGroupId === row.currentGroupId && inScope(row.ownerGroupId)).length,
    borrowed: baseFilteredEquipment.filter(isBorrowedByScope).length,
    lent: baseFilteredEquipment.filter(isLentByScope).length,
    repair: baseFilteredEquipment.filter(isRepairInScope).length,
    transfer: baseFilteredEquipment.filter(isTransferInScope).length,
  };

  const filteredEquipment = baseFilteredEquipment.filter((row) => {
    if (kpiFilter === "all") return true;
    if (kpiFilter === "available") return row.status === "in_use_owner" && row.ownerGroupId === row.currentGroupId && inScope(row.ownerGroupId);
    if (kpiFilter === "borrowed") return isBorrowedByScope(row);
    if (kpiFilter === "lent") return isLentByScope(row);
    if (kpiFilter === "repair") return isRepairInScope(row);
    return isTransferInScope(row);
  });

  function canEditRow(row: IndividualEquipmentRow) {
    if (isReadOnlyViewer) return false;
    if (isWorkshopAdmin) return true;
    const permission = permissionByGroup.get(row.ownerGroupId);
    return Boolean(permission && permissionRank(permission.level) >= 1);
  }

  function openNew() {
    setEditorMode("create");
    setEditorRecord(null);
    setFormKey((value) => value + 1);
    setEditorOpen(true);
  }

  function openEdit(row: IndividualEquipmentRow) {
    setDetailRecord(null);
    setEditorMode("edit");
    setEditorRecord(row);
    setFormKey((value) => value + 1);
    setEditorOpen(true);
  }

  function openClone(row: IndividualEquipmentRow) {
    setDetailRecord(null);
    setEditorMode("clone");
    setEditorRecord(row);
    setFormKey((value) => value + 1);
    setEditorOpen(true);
  }

  function openDetail(row: IndividualEquipmentRow, tab: DetailTab = "detail") {
    setDetailRecord(row);
    setDetailTab(tab);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditorRecord(null);
  }

  function handleSaved(afterSave: "close" | "add_next") {
    if (afterSave === "close") closeEditor();
  }

  return (
    <>
      <div className="mobile-equipment-shell">
        <header className="mobile-equipment-header">
          <button type="button" aria-label="Quay lại" onClick={() => window.history.back()}><ArrowLeft size={20} /></button>
          <strong>Dụng cụ nhóm tôi</strong>
          <div><button type="button" aria-label="Tìm kiếm" onClick={() => setMobileSearchOpen((value) => !value)}><Search size={19} /></button><button type="button" aria-label="Bộ lọc" onClick={() => setMobileFiltersOpen((value) => !value)}><Filter size={18} /></button></div>
        </header>
        {mobileSearchOpen ? <div className="mobile-equipment-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Mã, mã hiện hữu, tên, model, serial..." autoFocus /></div> : null}
        {mobileFiltersOpen ? <div className="mobile-equipment-filters">
          <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} aria-label="Lọc nhóm"><option value="all">Tất cả nhóm</option>{permissions.map((permission) => <option key={permission.groupId} value={permission.groupId}>{permission.groupName}</option>)}</select>
          <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setTypeFilter("all"); }} aria-label="Lọc nhóm thiết bị"><option value="all">Tất cả nhóm thiết bị</option>{EQUIPMENT_CATEGORIES.map((category) => <option key={category.code} value={category.code}>{category.name}</option>)}</select>
          <select value={conditionFilter} onChange={(event) => setConditionFilter(event.target.value)} aria-label="Lọc tình trạng"><option value="all">Tất cả tình trạng</option>{simpleConditionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <button type="button" onClick={() => { setGroupFilter("all"); setCategoryFilter("all"); setTypeFilter("all"); setConditionFilter("all"); setStatusFilter("all"); setMobileTab("all"); }}>Xóa bộ lọc</button>
        </div> : null}
        <div className="mobile-equipment-tabs" role="tablist" aria-label="Lọc trạng thái">
          {([ ["all", "Tất cả"], ["in_use_owner", "Sẵn sàng"], ["on_loan", "Đang mượn"], ["repairing", "Sửa chữa"] ] as const).map(([value, label]) => <button key={value} type="button" className={mobileTab === value ? "is-active" : ""} onClick={() => setMobileTab(value)}>{label}</button>)}
        </div>
        <div className="mobile-equipment-list">
          {filteredEquipment.length ? filteredEquipment.map((row) => <article className="mobile-equipment-item mobile-equipment-clickable" key={row.id} onClick={() => openDetail(row)}>
            <div className="mobile-equipment-thumb"><Wrench size={23} /></div>
            <div className="mobile-equipment-copy"><strong>{row.name}</strong><span>{row.code}{row.legacyCode ? ` · ${row.legacyCode}` : ""}<i />{row.ownerGroupName}</span></div>
            <div className="mobile-equipment-state"><StatusBadge label={EQUIPMENT_STATUS_LABELS[row.status]} tone={statusTone(row.status)} />{row.condition !== "good" ? <small>{CONDITION_LABELS[row.condition]}</small> : null}</div>
            <button type="button" className="mobile-equipment-more" onClick={(event) => { event.stopPropagation(); openDetail(row); }} aria-label={`Xem ${row.name}`}><MoreHorizontal size={18} /></button>
          </article>) : <EmptyState title="Chưa có dụng cụ" description="Không có dữ liệu phù hợp với bộ lọc hiện tại." />}
        </div>
        {canAdd ? <button type="button" className="mobile-add-asset" onClick={openNew} aria-label="Thêm dụng cụ"><Plus size={24} /></button> : null}
      </div>

      <div className="desktop-equipment-workspace">
        {isReadOnlyViewer ? <div className="viewer-banner"><Eye size={18} /><div><strong>Người xem toàn xưởng</strong><span>Bạn được xem toàn bộ thông tin nhưng không được tạo hoặc chỉnh sửa dữ liệu.</span></div></div> : null}
        {!isReadOnlyViewer && !isWorkshopAdmin && !actionablePermissions.length ? <div className="viewer-banner"><ShieldCheck size={18} /><div><strong>Công nhân kỹ thuật</strong><span>Bạn được tra cứu CCDC nhưng không được thêm hoặc sửa hồ sơ.</span></div></div> : null}

        <div className="equipment-toolbar equipment-toolbar-extended">
          <div className="equipment-filter-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Mã, mã hiện hữu, tên, model, serial..." aria-label="Tìm dụng cụ" /></div>
          <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} aria-label="Lọc nhóm"><option value="all">Tất cả nhóm</option>{permissions.map((permission) => <option key={permission.groupId} value={permission.groupId}>{permission.groupName}</option>)}</select>
          <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setTypeFilter("all"); }} aria-label="Lọc nhóm thiết bị"><option value="all">Tất cả nhóm thiết bị</option>{EQUIPMENT_CATEGORIES.map((category) => <option key={category.code} value={category.code}>{category.name}</option>)}</select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Lọc loại"><option value="all">Tất cả loại</option>{typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <select value={conditionFilter} onChange={(event) => setConditionFilter(event.target.value)} aria-label="Lọc tình trạng"><option value="all">Tất cả tình trạng</option>{simpleConditionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Lọc trạng thái"><option value="all">Tất cả trạng thái</option>{Object.entries(EQUIPMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          {canAdd ? <Button type="button" onClick={openNew}><Plus size={16} /> {isWorkshopAdmin ? "Thêm / cấp phát CCDC" : "Thêm dụng cụ"}</Button> : null}
        </div>

        <div className="equipment-kpi-grid" aria-label="Thống kê nhanh CCDC theo nghiệp vụ">
          <button type="button" className={`equipment-kpi-card ${kpiFilter === "all" ? "is-active" : ""}`} onClick={() => setKpiFilter("all")} aria-pressed={kpiFilter === "all"}><span>Tổng CCDC</span><strong>{summary.total}</strong></button>
          <button type="button" className={`equipment-kpi-card ${kpiFilter === "available" ? "is-active" : ""}`} onClick={() => setKpiFilter("available")} aria-pressed={kpiFilter === "available"}><span>Sẵn sàng</span><strong>{summary.available}</strong></button>
          <button type="button" className={`equipment-kpi-card ${kpiFilter === "borrowed" ? "is-active" : ""}`} onClick={() => setKpiFilter("borrowed")} aria-pressed={kpiFilter === "borrowed"}><span>Đang mượn</span><strong>{summary.borrowed}</strong></button>
          <button type="button" className={`equipment-kpi-card ${kpiFilter === "lent" ? "is-active" : ""}`} onClick={() => setKpiFilter("lent")} aria-pressed={kpiFilter === "lent"}><span>Cho mượn</span><strong>{summary.lent}</strong></button>
          <button type="button" className={`equipment-kpi-card ${kpiFilter === "repair" ? "is-active" : ""}`} onClick={() => setKpiFilter("repair")} aria-pressed={kpiFilter === "repair"}><span>Sửa chữa</span><strong>{summary.repair}</strong></button>
          <button type="button" className={`equipment-kpi-card ${kpiFilter === "transfer" ? "is-active" : ""}`} onClick={() => setKpiFilter("transfer")} aria-pressed={kpiFilter === "transfer"}><span>Điều chuyển</span><strong>{summary.transfer}</strong></button>
        </div>

        <section className="card table-card">
          <div className="card-header"><div><h2 className="card-title">Danh sách CCDC</h2><p className="card-subtitle">Mỗi thiết bị có một mã hệ thống cố định trong toàn bộ vòng đời.</p></div></div>
          <div className="card-content">
            <DataTable
              headers={["Mã", "Mã hiện hữu", "Tên CCDC", "Loại", "Hãng / Model", "Vị trí", "Tình trạng", "Trạng thái", "Cập nhật", "Thao tác"]}
              rows={filteredEquipment.map((row) => [
                <strong key="code">{row.code}</strong>,
                row.legacyCode || "—",
                <div key="name" className="asset-name-cell"><strong>{row.name}</strong><small>{row.ownerGroupName}</small></div>,
                row.equipmentType,
                <span key="brand-model">{[row.brand, row.model].filter(Boolean).join(" / ") || "—"}</span>,
                row.currentLocation || "—",
                <StatusBadge key="condition" label={CONDITION_LABELS[row.condition]} tone={conditionTone(row.condition)} />,
                <StatusBadge key="status" label={EQUIPMENT_STATUS_LABELS[row.status]} tone={statusTone(row.status)} />,
                formatDateTime(row.updatedAt),
                <div key="actions" className="row-actions equipment-row-actions">
                  <Button type="button" size="sm" variant="ghost" onClick={() => openDetail(row)}><Eye size={14} /> Xem</Button>
                  {canEditRow(row) ? <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(row)}><Edit3 size={14} /> Sửa</Button> : null}
                  <Button type="button" size="sm" variant="ghost" onClick={() => openDetail(row, "history")}><History size={14} /> Lịch sử</Button>
                </div>,
              ])}
              empty={<EmptyState title="Chưa có CCDC" description={canAdd ? "Dùng nút Thêm dụng cụ để nhập máy đầu tiên." : "Nhóm hiện chưa có dữ liệu CCDC."} />}
            />
          </div>
        </section>
      </div>

      {editorOpen ? <div className="asset-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
        <section className="asset-modal asset-editor-modal" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title">
          <header className="asset-modal-header">
            <div><span className="modal-kicker">DỤNG CỤ NHÓM TÔI</span><h2 id="asset-dialog-title">{editorMode === "edit" ? `Cập nhật ${editorRecord?.code}` : editorMode === "clone" ? "Sao chép để tạo CCDC mới" : isWorkshopAdmin ? "Thêm / cấp phát CCDC" : "Thêm dụng cụ"}</h2><p>Mã hệ thống được cấp tự động theo nhóm quản lý ban đầu và không tái sử dụng.</p></div>
            <button type="button" className="icon-button" onClick={closeEditor} aria-label="Đóng"><X size={18} /></button>
          </header>
          <div className="asset-modal-body"><AssetForm key={formKey} mode={editorMode} record={editorRecord} permissions={permissions} typeRows={typeRows} isWorkshopAdmin={isWorkshopAdmin} onSaved={handleSaved} onCancel={closeEditor} /></div>
        </section>
      </div> : null}

      {detailRecord ? <DetailModal row={detailRecord} tab={detailTab} audits={auditByEquipment.get(detailRecord.id) || []} canEdit={canEditRow(detailRecord)} onClose={() => setDetailRecord(null)} onEdit={() => openEdit(detailRecord)} onClone={() => openClone(detailRecord)} onTab={setDetailTab} groupNames={groupNameById} /> : null}
    </>
  );
}
