import { and, asc, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { disposals, equipment, groups, lossReports, machineLoans, quickLoans, repairs, toolCatalog, toolDisposals, transfers } from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/session";
import { canViewWholeWorkshop } from "@/lib/auth/roles";
import { CONDITION_LABELS, EQUIPMENT_STATUS_LABELS, WORKFLOW_LABELS } from "@/lib/constants";
import { getEquipmentCategoryLabel } from "@/lib/equipment-categories";
import { BORROWER_HOLDING_STATUSES } from "@/lib/loan-status";
import { MIN_QUERY_LENGTH, cleanQuery, escapeLike, searchItems } from "@/lib/global-search";

export const MACHINE_LIMIT = 20;
export const TOOL_LIMIT = 10;
const TICKET_LIMIT_EACH = 5;

export type MachineHit = {
  id: string;
  code: string;
  legacyCode: string | null;
  serial: string | null;
  name: string;
  type: string;
  ownerGroup: string;
  statusLabel: string;
  conditionLabel: string;
  location: string | null;
  /** Nhóm đang giữ máy do mượn (nếu có). */
  heldBy: string | null;
};

export type ToolHit = { id: string; code: string | null; name: string; type: string; group: string; quantity: number; unit: string };

export type TicketHit = {
  key: string;
  kind: string;
  code: string;
  label: string;
  statusLabel: string;
  groups: string;
  href: string;
};

export type GlobalSearchResult = {
  query: string;
  tooShort: boolean;
  machines: { rows: MachineHit[]; total: number };
  tools: { rows: ToolHit[]; total: number };
  tickets: TicketHit[];
};

const statusLabel = (status: string) => (WORKFLOW_LABELS as Record<string, string>)[status] ?? status;

/**
 * Tìm máy / CCDC theo số lượng của TOÀN Xưởng (khớp quyền xem trang "Dụng cụ toàn xưởng": ai đăng
 * nhập cũng xem được) và phiếu theo mã — phiếu chỉ hiện nếu liên quan nhóm của người dùng
 * (vai trò xem toàn Xưởng thấy hết).
 */
export async function globalSearch(auth: AuthContext, rawQuery: string): Promise<GlobalSearchResult> {
  const query = cleanQuery(rawQuery);
  const empty: GlobalSearchResult = { query, tooShort: query.length < MIN_QUERY_LENGTH, machines: { rows: [], total: 0 }, tools: { rows: [], total: 0 }, tickets: [] };
  if (empty.tooShort) return empty;

  const [groupRows, machineRows, toolRows] = await Promise.all([
    db.select({ id: groups.id, name: groups.name }).from(groups),
    db.select({
      id: equipment.id, code: equipment.code, legacyCode: equipment.legacyCode, serial: equipment.serial, name: equipment.name,
      brand: equipment.brand, model: equipment.model, type: equipment.equipmentType, categoryCode: equipment.categoryCode,
      ownerGroupId: equipment.ownerGroupId, status: equipment.status, condition: equipment.condition, location: equipment.currentLocation,
    }).from(equipment).where(eq(equipment.recordStatus, "active")).orderBy(asc(equipment.code)),
    db.select({
      id: toolCatalog.id, code: toolCatalog.code, name: toolCatalog.name, type: toolCatalog.equipmentType, categoryCode: toolCatalog.categoryCode,
      specification: toolCatalog.specification, groupId: toolCatalog.groupId, quantity: toolCatalog.quantityOnHand, unit: toolCatalog.unit,
    }).from(toolCatalog).where(and(eq(toolCatalog.isActive, true), eq(toolCatalog.recordStatus, "active"))).orderBy(asc(toolCatalog.code), asc(toolCatalog.name)),
  ]);
  const groupName = new Map(groupRows.map((g) => [g.id, g.name]));

  const machineMatches = searchItems(machineRows, query, (m) => ({
    primary: [m.code, m.legacyCode, m.serial],
    text: [m.name, m.brand, m.model, m.type, getEquipmentCategoryLabel(m.categoryCode), groupName.get(m.ownerGroupId), m.location],
  }), MACHINE_LIMIT);
  const toolMatches = searchItems(toolRows, query, (t) => ({
    primary: [t.code],
    text: [t.name, t.type, getEquipmentCategoryLabel(t.categoryCode), t.specification, groupName.get(t.groupId)],
  }), TOOL_LIMIT);

  // Nhóm đang giữ máy do mượn: chỉ tra cho các máy hiển thị.
  const heldBy = new Map<string, string>();
  if (machineMatches.rows.length) {
    const loans = await db.select({ equipmentId: machineLoans.equipmentId, borrowerGroupId: machineLoans.borrowerGroupId })
      .from(machineLoans)
      .where(and(inArray(machineLoans.equipmentId, machineMatches.rows.map((m) => m.id)), inArray(machineLoans.status, [...BORROWER_HOLDING_STATUSES])));
    for (const loan of loans) heldBy.set(loan.equipmentId, groupName.get(loan.borrowerGroupId) ?? "—");
  }

  return {
    query,
    tooShort: false,
    machines: {
      total: machineMatches.total,
      rows: machineMatches.rows.map((m) => ({
        id: m.id, code: m.code, legacyCode: m.legacyCode, serial: m.serial, name: m.name, type: m.type,
        ownerGroup: groupName.get(m.ownerGroupId) ?? "—",
        statusLabel: EQUIPMENT_STATUS_LABELS[m.status] ?? m.status,
        conditionLabel: CONDITION_LABELS[m.condition] ?? m.condition,
        location: m.location,
        heldBy: heldBy.get(m.id) ?? null,
      })),
    },
    tools: {
      total: toolMatches.total,
      rows: toolMatches.rows.map((t) => ({
        id: t.id, code: t.code, name: t.name, type: t.type, group: groupName.get(t.groupId) ?? "—", quantity: Number(t.quantity), unit: t.unit,
      })),
    },
    tickets: await searchTickets(auth, query, groupName),
  };
}

async function searchTickets(auth: AuthContext, query: string, groupName: ReadonlyMap<string, string>): Promise<TicketHit[]> {
  const whole = canViewWholeWorkshop(auth);
  const myGroups = auth.permissions.map((p) => p.groupId);
  if (!whole && !myGroups.length) return [];
  // Danh sách rỗng làm inArray lỗi; với vai trò xem toàn Xưởng điều kiện nhóm bị bỏ qua nên dùng UUID rỗng cho đủ cú pháp.
  const ids = myGroups.length ? myGroups : ["00000000-0000-0000-0000-000000000000"];

  const pattern = `%${escapeLike(query)}%`;
  const name = (id: string) => groupName.get(id) ?? "—";
  const scope = (...conditions: Array<SQL | undefined>): SQL | undefined => (whole ? undefined : or(...conditions));

  const [loanRows, quickRows, transferRows, repairRows, disposalRows, toolDisposalRows, lossRows] = await Promise.all([
    db.select({ id: machineLoans.id, code: machineLoans.code, status: machineLoans.status, owner: machineLoans.ownerGroupId, borrower: machineLoans.borrowerGroupId, eqCode: equipment.code, eqName: equipment.name })
      .from(machineLoans).innerJoin(equipment, eq(equipment.id, machineLoans.equipmentId))
      .where(and(ilike(machineLoans.code, pattern), scope(inArray(machineLoans.ownerGroupId, ids), inArray(machineLoans.borrowerGroupId, ids))))
      .orderBy(desc(machineLoans.createdAt)).limit(TICKET_LIMIT_EACH),
    db.select({ id: quickLoans.id, code: quickLoans.code, status: quickLoans.status, source: quickLoans.sourceGroupId, borrower: quickLoans.borrowerGroupId, item: quickLoans.itemName })
      .from(quickLoans)
      .where(and(ilike(quickLoans.code, pattern), scope(inArray(quickLoans.sourceGroupId, ids), inArray(quickLoans.borrowerGroupId, ids))))
      .orderBy(desc(quickLoans.createdAt)).limit(TICKET_LIMIT_EACH),
    db.select({ id: transfers.id, code: transfers.code, status: transfers.status, source: transfers.sourceGroupId, target: transfers.targetGroupId, eqCode: equipment.code, eqName: equipment.name })
      .from(transfers).innerJoin(equipment, eq(equipment.id, transfers.equipmentId))
      .where(and(ilike(transfers.code, pattern), scope(inArray(transfers.sourceGroupId, ids), inArray(transfers.targetGroupId, ids))))
      .orderBy(desc(transfers.createdAt)).limit(TICKET_LIMIT_EACH),
    db.select({ id: repairs.id, code: repairs.code, status: repairs.status, reporter: repairs.reportedByGroupId, owner: equipment.ownerGroupId, eqCode: equipment.code, eqName: equipment.name })
      .from(repairs).innerJoin(equipment, eq(equipment.id, repairs.equipmentId))
      .where(and(ilike(repairs.code, pattern), scope(inArray(repairs.reportedByGroupId, ids), inArray(equipment.ownerGroupId, ids))))
      .orderBy(desc(repairs.createdAt)).limit(TICKET_LIMIT_EACH),
    db.select({ id: disposals.id, code: disposals.code, status: disposals.status, owner: disposals.ownerGroupId, eqCode: equipment.code, eqName: equipment.name })
      .from(disposals).innerJoin(equipment, eq(equipment.id, disposals.equipmentId))
      .where(and(ilike(disposals.code, pattern), scope(inArray(disposals.ownerGroupId, ids))))
      .orderBy(desc(disposals.createdAt)).limit(TICKET_LIMIT_EACH),
    db.select({ id: toolDisposals.id, code: toolDisposals.code, status: toolDisposals.status, owner: toolDisposals.ownerGroupId, toolName: toolCatalog.name })
      .from(toolDisposals).innerJoin(toolCatalog, eq(toolCatalog.id, toolDisposals.toolId))
      .where(and(ilike(toolDisposals.code, pattern), scope(inArray(toolDisposals.ownerGroupId, ids))))
      .orderBy(desc(toolDisposals.createdAt)).limit(TICKET_LIMIT_EACH),
    db.select({ id: lossReports.id, code: lossReports.code, status: lossReports.status, owner: lossReports.ownerGroupId, eqCode: equipment.code, eqName: equipment.name, toolName: toolCatalog.name })
      .from(lossReports)
      .leftJoin(equipment, eq(equipment.id, lossReports.equipmentId))
      .leftJoin(toolCatalog, eq(toolCatalog.id, lossReports.toolId))
      .where(and(ilike(lossReports.code, pattern), scope(inArray(lossReports.ownerGroupId, ids))))
      .orderBy(desc(lossReports.createdAt)).limit(TICKET_LIMIT_EACH),
  ]);

  return [
    ...loanRows.map((r) => ({ key: `loan:${r.id}`, kind: "Mượn máy", code: r.code, label: `${r.eqName} (${r.eqCode})`, statusLabel: statusLabel(r.status), groups: `${name(r.borrower)} mượn của ${name(r.owner)}`, href: "/machine-loans" })),
    ...quickRows.map((r) => ({ key: `quick:${r.id}`, kind: "Mượn nhanh", code: r.code, label: r.item, statusLabel: statusLabel(r.status), groups: `${name(r.borrower)} mượn của ${name(r.source)}`, href: "/quick-loans" })),
    ...transferRows.map((r) => ({ key: `transfer:${r.id}`, kind: "Điều chuyển", code: r.code, label: `${r.eqName} (${r.eqCode})`, statusLabel: statusLabel(r.status), groups: `${name(r.source)} → ${name(r.target)}`, href: "/transfers" })),
    ...repairRows.map((r) => ({ key: `repair:${r.id}`, kind: "Sửa chữa", code: r.code, label: `${r.eqName} (${r.eqCode})`, statusLabel: statusLabel(r.status), groups: `Nhóm quản lý: ${name(r.owner)}`, href: "/repairs" })),
    ...disposalRows.map((r) => ({ key: `disposal:${r.id}`, kind: "Thanh lý", code: r.code, label: `${r.eqName} (${r.eqCode})`, statusLabel: statusLabel(r.status), groups: `Nhóm quản lý: ${name(r.owner)}`, href: "/disposals" })),
    ...lossRows.map((r) => ({ key: `loss:${r.id}`, kind: "Báo mất", code: r.code, label: r.eqName ? `${r.eqName} (${r.eqCode})` : (r.toolName ?? "CCDC"), statusLabel: statusLabel(r.status), groups: `Nhóm quản lý: ${name(r.owner)}`, href: "/losses" })),
    ...toolDisposalRows.map((r) => ({ key: `tooldisposal:${r.id}`, kind: "Thanh lý CCDC", code: r.code, label: r.toolName, statusLabel: statusLabel(r.status), groups: `Nhóm quản lý: ${name(r.owner)}`, href: "/disposals" })),
  ];
}
