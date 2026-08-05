import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import { equipment, groups, importIssues } from "../src/lib/db/schema";

const filePath = process.argv.find((arg) => arg.endsWith(".xlsx"));
const dryRun = process.argv.includes("--dry-run");
if (!filePath) throw new Error("Cách dùng: npm run import:excel -- /đường/dẫn/file.xlsx [--dry-run]");

function normalize(value: unknown) { return String(value ?? "").trim(); }
function key(value: unknown) { return normalize(value).toLowerCase().replace(/[\s_\-/]+/g, ""); }
function pick(row: Record<string, unknown>, names: string[]) {
  const entries = Object.entries(row);
  for (const name of names) {
    const found = entries.find(([header]) => key(header) === key(name));
    if (found) return found[1];
  }
  return undefined;
}

function mapGroupCode(name: string) {
  const n = name.toLowerCase();
  if (n.includes("workshop")) return "WORKSHOP";
  if (n.includes("nbs")) return "NBS";
  if (n.includes("cbl")) return "CBL";
  if (n.includes("lò") || n === "lo") return "LO";
  if (n.includes("mỏ") || n === "mo") return "MO";
  if (n.includes("nxm")) return "NXM";
  if (n.includes("cơ khí ca")) return "CK_CA";
  return null;
}

function mapStatus(value: string) {
  const v = value.toLowerCase();
  if (v.includes("đang sửa")) return { status: "wait_inspection" as const, condition: "awaiting_assessment" as const };
  if (v.includes("chập chờn")) return { status: "in_use_owner" as const, condition: "limited" as const };
  if (v.includes("hư")) return { status: "wait_inspection" as const, condition: "major_damage" as const };
  return { status: "in_use_owner" as const, condition: "good" as const };
}

async function main() {
  const buffer = await readFile(filePath!);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames.find((n) => key(n) === key("DANH_MUC_MAY"));
  if (!sheetName) throw new Error("Không tìm thấy sheet DANH_MUC_MAY.");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: null });
  const batchId = randomUUID();
  const groupRows = await db.select().from(groups);
  const groupMap = new Map(groupRows.map((g) => [g.code, g]));
  let imported = 0, skipped = 0, issues = 0;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const rowNumber = index + 2;
    const code = normalize(pick(row, ["Mã máy", "Mã số", "Mã"]));
    const type = normalize(pick(row, ["Loại máy", "Tên máy", "Loại"]));
    const name = normalize(pick(row, ["Tên máy", "Loại máy"])) || type;
    const model = normalize(pick(row, ["Model/thông số", "Model", "Thông số"]));
    const brand = normalize(pick(row, ["Hãng", "Hãng sản xuất"]));
    const groupName = normalize(pick(row, ["Nhóm quản lý", "Nhóm"]));
    const rawStatus = normalize(pick(row, ["Trạng thái", "Tình trạng"]));
    const purchaseDateRaw = pick(row, ["Ngày mua"]);
    const purchasePriceRaw = pick(row, ["Giá mua", "Nguyên giá"]);

    const groupCode = mapGroupCode(groupName);
    const group = groupCode ? groupMap.get(groupCode) : undefined;
    const rowErrors: string[] = [];
    if (!code) rowErrors.push("Thiếu mã máy");
    if (!name) rowErrors.push("Thiếu tên/loại máy");
    if (!group) rowErrors.push(`Không xác định được nhóm: ${groupName || "(trống)"}`);

    if (rowErrors.length) {
      issues += rowErrors.length;
      skipped += 1;
      if (!dryRun) {
        for (const message of rowErrors) await db.insert(importIssues).values({ batchId, sheetName, rowNumber, severity: "error", issueCode: "INVALID_EQUIPMENT_ROW", message, rawData: row });
      }
      continue;
    }

    const mapped = mapStatus(rawStatus);
    const purchaseDate = purchaseDateRaw instanceof Date ? purchaseDateRaw.toISOString().slice(0, 10) : null;
    const purchasePrice = Number(String(purchasePriceRaw ?? "").replace(/[^0-9.-]/g, ""));
    if (!dryRun) {
      await db.insert(equipment).values({
        code,
        name,
        equipmentType: type || name,
        model: model || null,
        brand: brand || null,
        ownerGroupId: group!.id,
        currentGroupId: group!.id,
        status: mapped.status,
        condition: mapped.condition,
        purchaseDate,
        purchasePrice: Number.isFinite(purchasePrice) && purchasePrice >= 0 ? String(purchasePrice) : null,
        notes: rawStatus ? `Trạng thái Excel ban đầu: ${rawStatus}` : null,
      }).onConflictDoUpdate({
        target: equipment.code,
        set: { name, equipmentType: type || name, model: model || null, brand: brand || null, updatedAt: new Date() },
      });
    }
    imported += 1;
  }

  console.table({ batchId, sheetName, totalRows: rows.length, imported, skipped, issues, dryRun });
  console.log("Lưu ý: script V1 chỉ tự động nhập DANH_MUC_MAY. Nhật ký cấp phát/sửa chữa cần đối chiếu lỗi trước khi nhập chính thức.");
}

main().finally(() => pool.end());
