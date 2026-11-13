import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipment, groups, inventoryItems, inventorySessions, inventoryToolCounts, lossReports, toolCatalog, users } from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/session";
import { canViewWholeWorkshop } from "@/lib/auth/roles";
import { canCheckInventory, canManageInventory, canViewInventory, type ChecklistItem, type InventoryResult } from "@/lib/inventory";
import { hasGroupPermission } from "@/lib/auth/guards";
import { OPEN_LOSS_STATUSES } from "@/lib/workflow-status";
import { isUuid } from "@/lib/machine-profile";

export type InventoryListRow = {
  id: string;
  code: string;
  title: string | null;
  groupId: string;
  groupName: string;
  status: "open" | "closed";
  createdAt: Date;
  closedAt: Date | null;
  createdByName: string | null;
  /** "YYYY-MM" nếu là đợt định kỳ hàng tháng. */
  period: string | null;
  /** Hệ thống tự đóng khi quá hạn. */
  autoClosed: boolean;
  /** Đợt quý có kèm đếm CCDC theo số lượng. */
  includesTools: boolean;
  onsite: number;
  checkedOnsite: number;
  found: number;
  missing: number;
};

/** Các đợt kiểm kê trong phạm vi tài khoản (vai trò toàn Xưởng: tất cả), đợt đang mở lên đầu. */
export async function loadInventoryList(auth: AuthContext): Promise<InventoryListRow[]> {
  const whole = canViewWholeWorkshop(auth);
  const myGroups = auth.permissions.map((p) => p.groupId);
  if (!whole && !myGroups.length) return [];

  const sessions = await db.select({
    id: inventorySessions.id,
    code: inventorySessions.code,
    title: inventorySessions.title,
    groupId: inventorySessions.groupId,
    groupName: groups.name,
    status: inventorySessions.status,
    createdAt: inventorySessions.createdAt,
    closedAt: inventorySessions.closedAt,
    createdByName: users.fullName,
    period: inventorySessions.period,
    autoClosed: inventorySessions.autoClosed,
    includesTools: inventorySessions.includesTools,
  }).from(inventorySessions)
    .innerJoin(groups, eq(groups.id, inventorySessions.groupId))
    .leftJoin(users, eq(users.id, inventorySessions.createdBy))
    .where(whole ? undefined : inArray(inventorySessions.groupId, myGroups))
    .orderBy(sql`${inventorySessions.status} = 'open' desc`, desc(inventorySessions.createdAt))
    .limit(100);
  if (!sessions.length) return [];

  const counts = await db.select({
    sessionId: inventoryItems.sessionId,
    onsite: sql<number>`count(*) filter (where ${inventoryItems.offsite} = false and ${inventoryItems.unexpected} = false)`.mapWith(Number),
    checkedOnsite: sql<number>`count(*) filter (where ${inventoryItems.offsite} = false and ${inventoryItems.unexpected} = false and ${inventoryItems.result} is not null)`.mapWith(Number),
    found: sql<number>`count(*) filter (where ${inventoryItems.result} = 'found')`.mapWith(Number),
    missing: sql<number>`count(*) filter (where ${inventoryItems.result} = 'missing')`.mapWith(Number),
  }).from(inventoryItems)
    .where(inArray(inventoryItems.sessionId, sessions.map((s) => s.id)))
    .groupBy(inventoryItems.sessionId);
  const bySession = new Map(counts.map((row) => [row.sessionId, row]));

  return sessions.map((s) => {
    const c = bySession.get(s.id);
    return { ...s, onsite: c?.onsite ?? 0, checkedOnsite: c?.checkedOnsite ?? 0, found: c?.found ?? 0, missing: c?.missing ?? 0 };
  });
}

/** Phiếu báo mất gắn với dòng kiểm kê: đang chờ duyệt hoặc đã duyệt (null = chưa báo mất). */
export type LossBadge = "pending_ws" | "completed" | null;

export type InventoryDetailItem = ChecklistItem & { note: string | null; checkedByName: string | null; checkedAt: Date | null; lossStatus: LossBadge };

/** Một CCDC theo số lượng trong đợt kiểm kê quý. `expected` = số hệ thống tại lúc đếm (null nếu chưa đếm). */
export type InventoryToolRow = {
  toolId: string;
  code: string | null;
  name: string;
  specification: string | null;
  unit: string;
  onHand: number;
  counted: number | null;
  expected: number | null;
  note: string | null;
  checkedByName: string | null;
  lossQuantity: number | null;
  lossStatus: LossBadge;
};

export type InventoryDetail = {
  session: {
    id: string;
    code: string;
    title: string | null;
    groupId: string;
    groupName: string;
    status: "open" | "closed";
    createdAt: Date;
    closedAt: Date | null;
    createdByName: string | null;
    closedByName: string | null;
    period: string | null;
    autoClosed: boolean;
    includesTools: boolean;
  };
  items: InventoryDetailItem[];
  tools: InventoryToolRow[];
  canManage: boolean;
  canCheck: boolean;
  /** Kỹ sư giám sát trở lên của nhóm (hoặc Quản lý Xưởng/Admin): có nút Báo mất. */
  canReportLoss: boolean;
};

/** Một đợt kiểm kê + danh sách máy; null nếu không có hoặc tài khoản không được xem. */
export async function loadInventoryDetail(auth: AuthContext, id: string): Promise<InventoryDetail | null> {
  if (!isUuid(id)) return null;
  const [session] = await db.select({
    id: inventorySessions.id,
    code: inventorySessions.code,
    title: inventorySessions.title,
    groupId: inventorySessions.groupId,
    groupName: groups.name,
    status: inventorySessions.status,
    createdAt: inventorySessions.createdAt,
    closedAt: inventorySessions.closedAt,
    createdBy: inventorySessions.createdBy,
    closedBy: inventorySessions.closedBy,
    period: inventorySessions.period,
    autoClosed: inventorySessions.autoClosed,
    includesTools: inventorySessions.includesTools,
  }).from(inventorySessions).innerJoin(groups, eq(groups.id, inventorySessions.groupId)).where(eq(inventorySessions.id, id)).limit(1);
  if (!session || !canViewInventory(auth, session.groupId)) return null;

  const [rows, userRows] = await Promise.all([
    db.select({
      equipmentId: inventoryItems.equipmentId,
      code: equipment.code,
      legacyCode: equipment.legacyCode,
      name: equipment.name,
      type: equipment.equipmentType,
      expectedNote: inventoryItems.expectedNote,
      offsite: inventoryItems.offsite,
      unexpected: inventoryItems.unexpected,
      result: inventoryItems.result,
      note: inventoryItems.note,
      checkedBy: inventoryItems.checkedBy,
      checkedAt: inventoryItems.checkedAt,
    }).from(inventoryItems)
      .innerJoin(equipment, eq(equipment.id, inventoryItems.equipmentId))
      .where(eq(inventoryItems.sessionId, id))
      .orderBy(asc(equipment.code)),
    db.select({ id: users.id, name: users.fullName }).from(users)
      .where(inArray(users.id, [...(session.createdBy ? [session.createdBy] : []), ...(session.closedBy ? [session.closedBy] : [])])),
  ]);
  const userName = new Map(userRows.map((u) => [u.id, u.name]));

  // Người kiểm: tải riêng các tài khoản xuất hiện trong kết quả.
  const checkerIds = [...new Set(rows.map((r) => r.checkedBy).filter((v): v is string => Boolean(v)))];
  if (checkerIds.length) {
    const checkers = await db.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, checkerIds));
    for (const c of checkers) userName.set(c.id, c.name);
  }

  // Phiếu báo mất liên quan đợt này (máy trong đợt, hoặc phiếu lập từ chính đợt này).
  const machineIds = rows.map((r) => r.equipmentId);
  const lossRows = await db.select({ equipmentId: lossReports.equipmentId, toolId: lossReports.toolId, quantity: lossReports.quantity, status: lossReports.status, createdAt: lossReports.createdAt, sessionId: lossReports.sourceInventorySessionId })
    .from(lossReports)
    .where(and(
      inArray(lossReports.status, [...OPEN_LOSS_STATUSES, "completed"]),
      or(eq(lossReports.sourceInventorySessionId, id), machineIds.length ? inArray(lossReports.equipmentId, machineIds) : undefined),
    ))
    .orderBy(desc(lossReports.createdAt));
  const lossByMachine = new Map<string, LossBadge>();
  const lossByTool = new Map<string, { quantity: number; status: LossBadge }>();
  for (const loss of lossRows) {
    // Phiếu mới nhất của mỗi máy / CCDC (danh sách đã sắp mới → cũ). "Đã mất" thắng "chờ duyệt".
    if (loss.equipmentId && !lossByMachine.has(loss.equipmentId)) lossByMachine.set(loss.equipmentId, loss.status as LossBadge);
    if (loss.toolId && loss.sessionId === id && !lossByTool.has(loss.toolId)) lossByTool.set(loss.toolId, { quantity: Number(loss.quantity), status: loss.status as LossBadge });
  }

  let tools: InventoryToolRow[] = [];
  if (session.includesTools) {
    const toolRows = await db.select({
      toolId: toolCatalog.id, code: toolCatalog.code, name: toolCatalog.name, specification: toolCatalog.specification, unit: toolCatalog.unit,
      onHand: toolCatalog.quantityOnHand, counted: inventoryToolCounts.countedQty, expected: inventoryToolCounts.expectedQty,
      note: inventoryToolCounts.note, checkedBy: inventoryToolCounts.checkedBy,
    }).from(toolCatalog)
      .leftJoin(inventoryToolCounts, and(eq(inventoryToolCounts.toolId, toolCatalog.id), eq(inventoryToolCounts.sessionId, id)))
      .where(and(eq(toolCatalog.groupId, session.groupId), eq(toolCatalog.isActive, true), eq(toolCatalog.recordStatus, "active")))
      .orderBy(asc(toolCatalog.name));
    const toolCheckerIds = [...new Set(toolRows.map((r) => r.checkedBy).filter((v): v is string => Boolean(v) && !userName.has(v as string)))];
    if (toolCheckerIds.length) {
      const checkers = await db.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, toolCheckerIds));
      for (const c of checkers) userName.set(c.id, c.name);
    }
    tools = toolRows.map((r) => ({
      toolId: r.toolId, code: r.code, name: r.name, specification: r.specification, unit: r.unit,
      onHand: Number(r.onHand), counted: r.counted === null ? null : Number(r.counted), expected: r.expected === null ? null : Number(r.expected),
      note: r.note, checkedByName: r.checkedBy ? userName.get(r.checkedBy) ?? null : null,
      lossQuantity: lossByTool.get(r.toolId)?.quantity ?? null, lossStatus: lossByTool.get(r.toolId)?.status ?? null,
    }));
  }

  return {
    session: {
      id: session.id, code: session.code, title: session.title, groupId: session.groupId, groupName: session.groupName,
      status: session.status, createdAt: session.createdAt, closedAt: session.closedAt,
      createdByName: session.createdBy ? userName.get(session.createdBy) ?? null : "Hệ thống",
      closedByName: session.closedBy ? userName.get(session.closedBy) ?? null : session.autoClosed ? "Hệ thống (tự đóng)" : null,
      period: session.period,
      autoClosed: session.autoClosed,
      includesTools: session.includesTools,
    },
    items: rows.map((r) => ({
      equipmentId: r.equipmentId, code: r.code, legacyCode: r.legacyCode, name: r.name, type: r.type,
      expectedNote: r.expectedNote, offsite: r.offsite, unexpected: r.unexpected, result: r.result as InventoryResult | null,
      note: r.note, checkedByName: r.checkedBy ? userName.get(r.checkedBy) ?? null : null, checkedAt: r.checkedAt,
      lossStatus: lossByMachine.get(r.equipmentId) ?? null,
    })),
    tools,
    canManage: canManageInventory(auth, session.groupId),
    canCheck: canCheckInventory(auth, session.groupId),
    canReportLoss: !auth.isReadOnlyViewer && (auth.isWorkshopAdmin || hasGroupPermission(auth, session.groupId, "operator")),
  };
}

export type MachineInventoryPrompt = { sessionId: string; code: string; groupName: string; inList: boolean; result: InventoryResult | null };

/**
 * Các đợt kiểm kê ĐANG MỞ mà tài khoản có thể đánh dấu máy này (hiện ở hồ sơ máy sau khi quét QR).
 * Chỉ tính nhóm của tài khoản; Admin / Quản lý Xưởng thêm nhóm quản lý và nhóm đang giữ máy.
 * Lỗi (vd chưa chạy update.sql tạo bảng kiểm kê) → không hiện gì, không làm hỏng hồ sơ máy.
 */
export async function loadInventoryPromptsForMachine(auth: AuthContext, equipmentId: string, groupHints: string[]): Promise<MachineInventoryPrompt[]> {
  try {
    if (auth.isReadOnlyViewer) return [];
    const candidates = new Set(auth.permissions.map((p) => p.groupId));
    if (auth.isAdmin || auth.isWsManager) for (const id of groupHints) candidates.add(id);
    if (!candidates.size) return [];

    const sessions = await db.select({ id: inventorySessions.id, code: inventorySessions.code, groupId: inventorySessions.groupId, groupName: groups.name })
      .from(inventorySessions).innerJoin(groups, eq(groups.id, inventorySessions.groupId))
      .where(and(eq(inventorySessions.status, "open"), inArray(inventorySessions.groupId, [...candidates])));
    const allowed = sessions.filter((s) => canCheckInventory(auth, s.groupId));
    if (!allowed.length) return [];

    const items = await db.select({ sessionId: inventoryItems.sessionId, result: inventoryItems.result }).from(inventoryItems)
      .where(and(eq(inventoryItems.equipmentId, equipmentId), inArray(inventoryItems.sessionId, allowed.map((s) => s.id))));
    const bySession = new Map(items.map((i) => [i.sessionId, i.result as InventoryResult | null]));
    return allowed.map((s) => ({ sessionId: s.id, code: s.code, groupName: s.groupName, inList: bySession.has(s.id), result: bySession.get(s.id) ?? null }));
  } catch (error) {
    console.error("loadInventoryPromptsForMachine failed", error);
    return [];
  }
}
