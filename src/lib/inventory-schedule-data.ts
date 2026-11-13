/**
 * Chạy kiểm kê định kỳ hàng tháng (server). Gọi từ cron hằng ngày `/api/cron/inventory` và từ nút "Chạy kiểm kê định kỳ ngay".
 * Idempotent: chạy lại cùng ngày không tạo/đóng thêm. Mỗi nhóm một transaction riêng nên một nhóm lỗi không chặn nhóm khác.
 */
import { and, eq, or, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { equipment, inventoryItems, inventorySessions } from "@/lib/db/schema";
import { loadOperationalGroups } from "@/lib/equipment-data";
import { vnDate } from "@/lib/export/equipment-export";
import { isToolQuarter, summarizeInventory } from "@/lib/inventory";
import { createInventorySession, groupHasActiveTools } from "@/lib/inventory-create";
import { periodOf, periodTitle, plan, type ScheduleAction } from "@/lib/inventory-schedule";

export type ScheduleRunSummary = {
  today: string;
  period: string;
  created: number;
  adopted: number;
  closed: number;
  /** Tổng số máy tại chỗ chưa kiểm của các đợt vừa tự đóng. */
  unchecked: number;
  errors: string[];
};

export async function runMonthlyInventory(today: string = vnDate()): Promise<ScheduleRunSummary> {
  const period = periodOf(today);
  const summary: ScheduleRunSummary = { today, period, created: 0, adopted: 0, closed: 0, unchecked: 0, errors: [] };

  const [groupRows, machineCounts, sessions] = await Promise.all([
    loadOperationalGroups(),
    db.select({ groupId: equipment.ownerGroupId, count: sql<number>`count(*)`.mapWith(Number) }).from(equipment)
      .where(eq(equipment.recordStatus, "active")).groupBy(equipment.ownerGroupId),
    db.select({ id: inventorySessions.id, groupId: inventorySessions.groupId, status: inventorySessions.status, period: inventorySessions.period, code: inventorySessions.code })
      .from(inventorySessions)
      .where(or(eq(inventorySessions.status, "open"), eq(inventorySessions.period, period))),
  ]);
  const countByGroup = new Map(machineCounts.map((row) => [row.groupId, row.count]));
  const groupNameById = new Map(groupRows.map((group) => [group.id, group.name]));
  const codeBySession = new Map(sessions.map((session) => [session.id, session.code]));

  const actions = plan({
    today,
    groups: groupRows.map((group) => ({ groupId: group.id, machineCount: countByGroup.get(group.id) ?? 0 })),
    sessions,
  });
  const detail: Array<{ action: ScheduleAction["type"]; group: string; code?: string; unchecked?: number }> = [];

  for (const action of actions) {
    const groupName = groupNameById.get(action.groupId) ?? "—";
    try {
      if (action.type === "close") {
        const result = await closeScheduledSession(action.sessionId);
        if (!result) continue;
        summary.closed += 1;
        summary.unchecked += result.unchecked;
        detail.push({ action: "close", group: groupName, code: codeBySession.get(action.sessionId), unchecked: result.unchecked });
      } else if (action.type === "adopt") {
        const adopted = await adoptManualSession(action.sessionId, action.groupId, groupName, action.period);
        if (!adopted) continue;
        summary.adopted += 1;
        detail.push({ action: "adopt", group: groupName, code: codeBySession.get(action.sessionId) });
      } else {
        const created = await createInventorySession({ groupId: action.groupId, title: periodTitle(action.period), createdBy: null, period: action.period });
        summary.created += 1;
        detail.push({ action: "create", group: groupName, code: created.code });
      }
    } catch (error) {
      summary.errors.push(`${groupName}: ${error instanceof Error ? error.message : "lỗi không rõ"}`);
    }
  }

  if (detail.length) {
    await db.transaction(async (tx) => {
      await writeAudit(tx, {
        actorUserId: null,
        actorRole: "Hệ thống",
        action: "inventory.schedule_run",
        entityType: "inventory_session",
        description: `Kiểm kê định kỳ ${period}: mở ${summary.created} đợt, nhận ${summary.adopted} đợt đang mở, tự đóng ${summary.closed} đợt (còn ${summary.unchecked} máy chưa kiểm)${summary.errors.length ? `; ${summary.errors.length} nhóm lỗi` : ""}`,
        afterData: { ...summary, detail },
      });
    });
  }
  return summary;
}

/** Đóng đợt định kỳ quá hạn: `closed_by` NULL + `auto_closed`; máy chưa kiểm vẫn ghi "chưa kiểm" trong biên bản. */
async function closeScheduledSession(sessionId: string): Promise<{ unchecked: number } | null> {
  return db.transaction(async (tx) => {
    const [updated] = await tx.update(inventorySessions)
      .set({ status: "closed", closedBy: null, closedAt: new Date(), autoClosed: true, updatedAt: new Date() })
      .where(and(eq(inventorySessions.id, sessionId), eq(inventorySessions.status, "open"))).returning({ id: inventorySessions.id });
    if (!updated) return null;
    const items = await tx.select({ result: inventoryItems.result, offsite: inventoryItems.offsite, unexpected: inventoryItems.unexpected })
      .from(inventoryItems).where(eq(inventoryItems.sessionId, sessionId));
    return { unchecked: summarizeInventory(items).pending };
  });
}

/** Đợt mở tay còn đang mở được nhận làm đợt của tháng (không tạo thêm đợt thứ hai cho nhóm). */
async function adoptManualSession(sessionId: string, groupId: string, groupName: string, period: string): Promise<boolean> {
  const includesTools = isToolQuarter(period) && (await groupHasActiveTools(groupId));
  return db.transaction(async (tx) => {
    const [updated] = await tx.update(inventorySessions)
      .set({ period, includesTools, title: sql`coalesce(${inventorySessions.title}, ${periodTitle(period)})`, updatedAt: new Date() })
      .where(and(eq(inventorySessions.id, sessionId), eq(inventorySessions.status, "open"), sql`${inventorySessions.period} is null`))
      .returning({ id: inventorySessions.id, code: inventorySessions.code });
    if (!updated) return false;
    await writeAudit(tx, {
      actorUserId: null,
      actorGroupId: groupId,
      actorRole: "Hệ thống",
      action: "inventory.schedule_create",
      entityType: "inventory_session",
      entityId: sessionId,
      description: `Nhận đợt kiểm kê ${updated.code} đang mở của ${groupName} làm đợt định kỳ kỳ ${period}`,
    });
    return true;
  });
}

