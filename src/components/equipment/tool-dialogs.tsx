"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { adjustToolQuantityAction, updateQuantityToolAction, type EquipmentFormState } from "@/actions/equipment";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_DISCIPLINE_LABELS, type EquipmentDiscipline } from "@/lib/equipment-categories";
import { MIN_ADJUST_REASON_LENGTH } from "@/lib/tool-permissions";
import type { ToolRow } from "@/lib/tool-filter";

const initialState: EquipmentFormState = { status: "idle" };
const disciplineOrder: EquipmentDiscipline[] = ["mechanical", "electrical", "other"];
const conditionOptions: Array<[string, string]> = [
  ["good", "Tốt"],
  ["major_damage", "Hư hỏng"],
  ["awaiting_assessment", "Chưa đánh giá"],
  ["irreparable", "Không thể phục hồi"],
];

function ToolModal({ title, kicker, onClose, children }: { title: string; kicker: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="asset-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="asset-modal asset-editor-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="asset-modal-header">
          <div><span className="modal-kicker">{kicker}</span><h2>{title}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </header>
        <div className="asset-modal-body">{children}</div>
      </section>
    </div>
  );
}

/** Sửa thông tin CCDC theo số lượng (không đổi số lượng — dùng "Hiệu chỉnh SL"). */
export function ToolEditDialog({ tool, onClose }: { tool: ToolRow; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateQuantityToolAction, initialState);
  useEffect(() => {
    if (state.status !== "success") return;
    const timer = window.setTimeout(onClose, 400);
    return () => window.clearTimeout(timer);
  }, [state.status, onClose]);

  return (
    <ToolModal title={`Sửa ${tool.code || tool.name}`} kicker="CCDC THEO SỐ LƯỢNG" onClose={onClose}>
      <form action={action} className="asset-form">
        <input type="hidden" name="toolId" value={tool.id} />
        <input type="hidden" name="expectedUpdatedAt" value={tool.updatedAt} />
        <section className="asset-form-section">
          <div className="form-grid two">
            <FormField label="Tên CCDC" required><input name="name" required defaultValue={tool.name} /></FormField>
            <FormField label="Nhóm thiết bị" required>
              <select name="categoryCode" defaultValue={tool.categoryCode}>
                {disciplineOrder.map((discipline) => (
                  <optgroup key={discipline} label={EQUIPMENT_DISCIPLINE_LABELS[discipline]}>
                    {EQUIPMENT_CATEGORIES.filter((category) => category.discipline === discipline).map((category) => <option key={category.code} value={category.code}>{category.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </FormField>
            <FormField label="Quy cách"><input name="specification" defaultValue={tool.specification || ""} placeholder="Ví dụ: 300 mm, Ø12, M20..." /></FormField>
            <FormField label="Đơn vị tính" required><input name="unit" required defaultValue={tool.unit} /></FormField>
            <FormField label="Tình trạng">
              <select name="condition" defaultValue={tool.condition}>{conditionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </FormField>
            <FormField label="Vị trí"><input name="currentLocation" defaultValue={tool.currentLocation || ""} placeholder="Kho Workshop, Tủ số 2..." /></FormField>
          </div>
          <div className="form-grid"><FormField label="Ghi chú"><textarea name="notes" rows={3} defaultValue={tool.notes || ""} /></FormField></div>
          <p className="field-hint">Số lượng tồn ({tool.quantity} {tool.unit}) không sửa ở đây: dùng nút “Hiệu chỉnh SL” (Đốc công trở lên, có ghi lý do).</p>
        </section>
        {state.message ? <p className={`form-message ${state.status === "error" ? "error" : "success"}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
        <div className="asset-form-footer">
          <Button type="button" variant="ghost" onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={pending}>{pending ? "Đang lưu..." : "Lưu cập nhật"}</Button>
        </div>
      </form>
    </ToolModal>
  );
}

/** Hiệu chỉnh số lượng tồn trực tiếp — bắt buộc ghi lý do, ghi vào nhật ký. */
export function ToolAdjustDialog({ tool, onClose }: { tool: ToolRow; onClose: () => void }) {
  const [state, action, pending] = useActionState(adjustToolQuantityAction, initialState);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (state.status !== "success") return;
    const timer = window.setTimeout(onClose, 400);
    return () => window.clearTimeout(timer);
  }, [state.status, onClose]);

  return (
    <ToolModal title={`Hiệu chỉnh số lượng ${tool.code || tool.name}`} kicker="CCDC THEO SỐ LƯỢNG" onClose={onClose}>
      <form action={action} className="asset-form">
        <input type="hidden" name="toolId" value={tool.id} />
        <input type="hidden" name="oldQuantity" value={String(tool.quantity)} />
        <section className="asset-form-section">
          <p><strong>{tool.name}</strong>{tool.specification ? ` · ${tool.specification}` : ""} — {tool.groupName}</p>
          <div className="form-grid two">
            <FormField label="Số lượng hiện tại"><input value={`${tool.quantity} ${tool.unit}`} readOnly aria-readonly="true" /></FormField>
            <FormField label={`Số lượng mới (${tool.unit})`} required>
              <input name="newQuantity" type="number" min="0" step="0.01" required inputMode="decimal" />
            </FormField>
          </div>
          <div className="form-grid">
            <FormField label="Lý do hiệu chỉnh" required hint={`Bắt buộc, ít nhất ${MIN_ADJUST_REASON_LENGTH} ký tự. Ví dụ: Kiểm kê tháng 11 thiếu 2 cái; nhập sai lúc thêm.`}>
              <textarea name="reason" rows={3} required minLength={MIN_ADJUST_REASON_LENGTH} value={reason} onChange={(event) => setReason(event.target.value)} />
            </FormField>
          </div>
          <div className="admin-warning"><AlertTriangle size={17} /><span>Việc hiệu chỉnh được ghi vào Lịch sử hoạt động kèm số cũ, số mới và lý do. Số lượng mượn/trả/thanh lý vẫn đi theo phiếu, không sửa ở đây.</span></div>
        </section>
        {state.message ? <p className={`form-message ${state.status === "error" ? "error" : "success"}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
        <div className="asset-form-footer">
          <Button type="button" variant="ghost" onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={pending || reason.trim().length < MIN_ADJUST_REASON_LENGTH}>{pending ? "Đang lưu..." : "Lưu hiệu chỉnh"}</Button>
        </div>
      </form>
    </ToolModal>
  );
}
