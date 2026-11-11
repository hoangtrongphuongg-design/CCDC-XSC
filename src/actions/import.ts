"use server";

import { asc, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { setFlashMessage } from "@/lib/auth/session";
import { SYSTEM_ROLE_LABELS } from "@/lib/auth/roles";
import { writeAudit, writeAuditBatch } from "@/lib/audit";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { equipment, equipmentTypeCatalog, groups } from "@/lib/db/schema";
import { buildEquipmentInsertValues } from "@/lib/equipment-create";
import { loadCanonicalizers } from "@/lib/canonical-data";
import { vnDate } from "@/lib/export/equipment-export";
import { isOfficialOperationalGroupCode } from "@/lib/group-structure";
import {
  applyCanonicalText,
  collectDuplicateKeys,
  findHeader,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  parseImportRows,
  toDataRows,
  type ImportRowState,
  type ImportSummary,
  type ParsedImportRow,
} from "@/lib/import/equipment-import";
import { readImportRows } from "@/lib/import/read-workbook";
import { nextAssetCodes } from "@/lib/workflows";

export type ImportPreviewRow = {
  rowNumber: number;
  state: ImportRowState;
  messages: string[];
  group: string;
  name: string;
  type: string;
  legacyCode: string;
  serial: string;
};

export type ImportState = {
  status: "idle" | "checked" | "imported" | "error";
  message?: string;
  summary?: ImportSummary;
  rows?: ImportPreviewRow[];
  createdCount?: number;
};

const INSERT_CHUNK = 200;

function toPreview(row: ParsedImportRow): ImportPreviewRow {
  return { rowNumber: row.rowNumber, state: row.state, messages: row.messages, ...row.preview };
}

/**
 * Nhập máy từ Excel (chỉ Admin hệ thống). `mode=check`: chỉ kiểm tra và trả bảng xem trước.
 * `mode=commit`: kiểm tra lại với dữ liệu mới nhất rồi tạo toàn bộ trong MỘT transaction —
 * còn dòng lỗi thì không nhập gì cả; dòng trùng tem nhôm/serial bị bỏ qua.
 */
export async function importEquipmentAction(_previous: ImportState, formData: FormData): Promise<ImportState> {
  try {
    const auth = await requireAdmin();
    const mode = formData.get("mode") === "commit" ? "commit" : "check";

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Hãy chọn file Excel (.xlsx) cần nhập." };
    if (!file.name.toLowerCase().endsWith(".xlsx")) return { status: "error", message: "Chỉ nhận file .xlsx (Excel). Hãy dùng file mẫu tải từ trang này." };
    if (file.size > IMPORT_MAX_BYTES) return { status: "error", message: "File quá lớn (tối đa 2 MB)." };

    let rawRows;
    try {
      rawRows = await readImportRows(new Uint8Array(await file.arrayBuffer()));
    } catch (error) {
      const known = error instanceof Error && error.message.startsWith("File có quá nhiều dòng");
      return { status: "error", message: known ? (error as Error).message : "Không đọc được file. Hãy chắc chắn đây là file .xlsx hợp lệ (không đặt mật khẩu)." };
    }

    const found = findHeader(rawRows);
    if (!found.ok) return { status: "error", message: found.message };
    const dataRows = toDataRows(rawRows, found.header);
    if (!dataRows.length) return { status: "error", message: "File chưa có dòng dữ liệu nào bên dưới dòng tiêu đề." };
    if (dataRows.length > IMPORT_MAX_ROWS) return { status: "error", message: `File có ${dataRows.length} dòng; mỗi lần chỉ nhập tối đa ${IMPORT_MAX_ROWS} máy. Hãy chia nhỏ file.` };

    const groupRows = await db.select({ id: groups.id, code: groups.code, name: groups.name, equipmentPrefix: groups.equipmentPrefix, isSystem: groups.isSystem, isActive: groups.isActive })
      .from(groups).orderBy(asc(groups.name));
    const operationalGroups = groupRows.filter((g) => !g.isSystem && g.isActive && isOfficialOperationalGroupCode(g.code));

    const keys = collectDuplicateKeys(dataRows);
    const legacyColumn = sql<string>`lower(${equipment.legacyCode})`;
    const serialColumn = sql<string>`lower(${equipment.serial})`;
    const [legacyHits, serialHits] = await Promise.all([
      keys.legacy.length
        ? db.select({ key: legacyColumn, code: equipment.code }).from(equipment).where(inArray(legacyColumn, keys.legacy))
        : Promise.resolve([] as Array<{ key: string; code: string }>),
      keys.serial.length
        ? db.select({ key: serialColumn, code: equipment.code }).from(equipment).where(inArray(serialColumn, keys.serial))
        : Promise.resolve([] as Array<{ key: string; code: string }>),
    ]);

    const { rows, summary } = parseImportRows(dataRows, {
      groups: operationalGroups.map((g) => ({ id: g.id, code: g.code, name: g.name })),
      existingLegacy: new Map(legacyHits.map((r) => [r.key, r.code])),
      existingSerial: new Map(serialHits.map((r) => [r.key, r.code])),
    });
    applyCanonicalText(rows, await loadCanonicalizers());
    const preview = rows.map(toPreview);

    if (mode === "check") {
      return {
        status: "checked",
        summary,
        rows: preview,
        message: summary.error
          ? `Còn ${summary.error} dòng lỗi — sửa file rồi kiểm tra lại.`
          : summary.ok
            ? `Sẵn sàng nhập ${summary.ok} máy${summary.skip ? `, bỏ qua ${summary.skip} dòng trùng` : ""}.`
            : "Không có dòng nào để nhập (tất cả đều trùng).",
      };
    }

    if (summary.error > 0) return { status: "checked", summary, rows: preview, message: `Còn ${summary.error} dòng lỗi nên chưa nhập gì cả. Sửa file rồi kiểm tra lại.` };
    if (summary.ok === 0) return { status: "checked", summary, rows: preview, message: "Không có dòng hợp lệ để nhập." };

    // Gom theo nhóm quản lý để cấp mã liền một lần cho mỗi nhóm.
    const okRows = rows.filter((r) => r.state === "ok" && r.record);
    const byGroup = new Map<string, typeof okRows>();
    for (const row of okRows) {
      const list = byGroup.get(row.record!.ownerGroupId) ?? [];
      list.push(row);
      byGroup.set(row.record!.ownerGroupId, list);
    }

    const recordedDate = vnDate();
    let created = 0;
    await db.transaction(async (tx) => {
      const inserted: Array<{ id: string; code: string; ownerGroupId: string; groupName: string }> = [];
      for (const [groupId, list] of byGroup) {
        const group = operationalGroups.find((g) => g.id === groupId)!;
        const codes = await nextAssetCodes(tx, { groupCode: group.code, equipmentPrefix: group.equipmentPrefix, count: list.length });
        const values = list.map((row, index) => buildEquipmentInsertValues(
          { code: codes[index], ownerGroupId: groupId, originType: "existing", recordedDate, actorUserId: auth.userId },
          row.record!,
        ));
        for (let start = 0; start < values.length; start += INSERT_CHUNK) {
          const rowsBack = await tx.insert(equipment).values(values.slice(start, start + INSERT_CHUNK)).returning({ id: equipment.id, code: equipment.code });
          for (const back of rowsBack) inserted.push({ ...back, ownerGroupId: groupId, groupName: group.name });
        }
      }

      const types = new Map<string, { categoryCode: string; name: string }>();
      for (const row of okRows) types.set(`${row.record!.categoryCode}|${row.record!.equipmentType}`, { categoryCode: row.record!.categoryCode, name: row.record!.equipmentType });
      if (types.size) {
        await tx.insert(equipmentTypeCatalog).values([...types.values()].map((t) => ({ ...t, createdBy: auth.userId }))).onConflictDoNothing();
      }

      // Nhật ký theo từng máy (để tab "Lịch sử" của máy đầy đủ) + MỘT dòng tổng hợp hiện ở Lịch sử hoạt động.
      for (let start = 0; start < inserted.length; start += INSERT_CHUNK) {
        await writeAuditBatch(tx, inserted.slice(start, start + INSERT_CHUNK).map((item) => ({
          actorUserId: auth.userId,
          actorGroupId: item.ownerGroupId,
          actorRole: SYSTEM_ROLE_LABELS.admin,
          action: "equipment.import_create",
          entityType: "equipment",
          entityId: item.id,
          description: `Tạo CCDC hiện hữu ${item.code} (nhập từ Excel)`,
        })));
      }
      await writeAudit(tx, {
        actorUserId: auth.userId,
        actorRole: SYSTEM_ROLE_LABELS.admin,
        action: "equipment.import",
        entityType: "equipment_import",
        description: `Nhập ${inserted.length} CCDC từ file Excel “${file.name.slice(0, 80)}”${summary.skip ? `, bỏ qua ${summary.skip} dòng trùng` : ""}`,
        afterData: { fileName: file.name.slice(0, 120), created: inserted.length, skipped: summary.skip, groups: [...new Set(inserted.map((i) => i.groupName))] },
      });
      created = inserted.length;
    });

    for (const path of ["/equipment", "/my-equipment", "/dashboard", "/reports", "/activities"]) revalidatePath(path);
    await setFlashMessage("success", `Đã nhập ${created} CCDC từ Excel`, summary.skip ? `Bỏ qua ${summary.skip} dòng trùng.` : undefined);
    return { status: "imported", summary, rows: preview, createdCount: created, message: `Đã nhập ${created} máy vào hệ thống.` };
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "error", message: "Có mã hệ thống bị trùng do người khác vừa tạo máy cùng lúc. Chưa nhập gì cả — hãy kiểm tra và nhập lại." };
    return { status: "error", message: error instanceof Error ? error.message : "Không thể nhập file." };
  }
}
