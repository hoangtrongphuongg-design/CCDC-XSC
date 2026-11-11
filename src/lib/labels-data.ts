import { and, asc, eq, inArray } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { equipment, groups } from "@/lib/db/schema";
import { shortGroupName } from "@/lib/export/equipment-export";
import { MAX_LABELS, machineUrl } from "@/lib/labels";

export type LabelItem = {
  id: string;
  code: string;
  legacyCode: string | null;
  name: string;
  groupName: string;
  /** SVG của mã QR (do thư viện sinh từ địa chỉ do hệ thống dựng, không chứa chữ người dùng nhập). */
  qrSvg: string;
};

async function toLabelItems(
  rows: Array<{ id: string; code: string; legacyCode: string | null; name: string; ownerGroupId: string }>,
  baseUrl: string,
): Promise<LabelItem[]> {
  const groupRows = await db.select({ id: groups.id, name: groups.name }).from(groups);
  const groupName = new Map(groupRows.map((g) => [g.id, shortGroupName(g.name)]));
  return Promise.all(rows.map(async (row) => ({
    id: row.id,
    code: row.code,
    legacyCode: row.legacyCode,
    name: row.name,
    groupName: groupName.get(row.ownerGroupId) ?? "",
    qrSvg: await QRCode.toString(machineUrl(baseUrl, row.id), { type: "svg", margin: 0, errorCorrectionLevel: "M" }),
  })));
}

const columns = {
  id: equipment.id,
  code: equipment.code,
  legacyCode: equipment.legacyCode,
  name: equipment.name,
  ownerGroupId: equipment.ownerGroupId,
};

/** Máy đã hoàn thành hồ sơ của một nhóm quản lý, theo mã hệ thống. */
export async function loadLabelsByGroup(groupId: string, baseUrl: string): Promise<{ items: LabelItem[]; total: number }> {
  const rows = await db.select(columns).from(equipment)
    .where(and(eq(equipment.ownerGroupId, groupId), eq(equipment.recordStatus, "active")))
    .orderBy(asc(equipment.code));
  return { items: await toLabelItems(rows.slice(0, MAX_LABELS), baseUrl), total: rows.length };
}

/** Một số máy cụ thể (nút "In tem QR" ở hồ sơ máy), giữ thứ tự theo mã hệ thống. */
export async function loadLabelsByIds(ids: string[], baseUrl: string): Promise<{ items: LabelItem[]; total: number }> {
  if (!ids.length) return { items: [], total: 0 };
  const rows = await db.select(columns).from(equipment)
    .where(and(inArray(equipment.id, ids), eq(equipment.recordStatus, "active")))
    .orderBy(asc(equipment.code));
  return { items: await toLabelItems(rows, baseUrl), total: rows.length };
}
