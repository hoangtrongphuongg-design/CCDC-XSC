/**
 * Hồ sơ nào đã có lịch sử nghiệp vụ (server): máy = phiếu mượn máy / điều chuyển / sửa chữa / thanh lý / báo mất / dòng kiểm kê;
 * CCDC theo số lượng = phiếu mượn nhanh / thanh lý / báo mất. Dùng cho cờ `hasHistory` của giao diện và kiểm lại trong
 * transaction khi xóa.
 */
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { disposals, inventoryItems, lossReports, machineLoans, quickLoans, repairs, toolDisposals, transfers } from "@/lib/db/schema";

type Reader = Pick<typeof db, "select">;

export async function loadEquipmentHistoryIds(ids: readonly string[], reader: Reader = db): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const list = [...ids];
  const result = await Promise.all([
    reader.select({ id: machineLoans.equipmentId }).from(machineLoans).where(inArray(machineLoans.equipmentId, list)),
    reader.select({ id: transfers.equipmentId }).from(transfers).where(inArray(transfers.equipmentId, list)),
    reader.select({ id: repairs.equipmentId }).from(repairs).where(inArray(repairs.equipmentId, list)),
    reader.select({ id: disposals.equipmentId }).from(disposals).where(inArray(disposals.equipmentId, list)),
    reader.select({ id: inventoryItems.equipmentId }).from(inventoryItems).where(inArray(inventoryItems.equipmentId, list)),
    reader.select({ id: lossReports.equipmentId }).from(lossReports).where(inArray(lossReports.equipmentId, list)),
  ]);
  return new Set(result.flat().flatMap((row) => (row.id ? [row.id] : [])));
}

export async function loadToolHistoryIds(ids: readonly string[], reader: Reader = db): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const list = [...ids];
  const [quick, disposed, lost] = await Promise.all([
    reader.select({ id: quickLoans.toolId }).from(quickLoans).where(inArray(quickLoans.toolId, list)),
    reader.select({ id: toolDisposals.toolId }).from(toolDisposals).where(inArray(toolDisposals.toolId, list)),
    reader.select({ id: lossReports.toolId }).from(lossReports).where(inArray(lossReports.toolId, list)),
  ]);
  return new Set([...quick, ...disposed, ...lost].flatMap((row) => (row.id ? [row.id] : [])));
}

export async function equipmentHasHistory(id: string, reader: Reader = db): Promise<boolean> {
  return (await loadEquipmentHistoryIds([id], reader)).has(id);
}

export async function toolHasHistory(id: string, reader: Reader = db): Promise<boolean> {
  return (await loadToolHistoryIds([id], reader)).has(id);
}
