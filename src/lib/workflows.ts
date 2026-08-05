import { and, eq, inArray, sql } from "drizzle-orm";
import { disposals, equipment, machineLoans, repairs, transfers } from "@/lib/db/schema";

export type DbTx = any; // Transaction object của Drizzle; giữ tương thích giữa các phiên bản Drizzle.

export async function nextWorkflowCode(tx: DbTx, prefix: string) {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const result = (await tx.execute(sql`
    insert into workflow_counters (key, value, updated_at)
    values (${key}, 1, now())
    on conflict (key) do update set value = workflow_counters.value + 1, updated_at = now()
    returning value
  `)) as { rows: Array<{ value: number | string }> };
  const value = Number(result.rows[0]?.value ?? 1);
  return `${prefix}-${year}-${String(value).padStart(4, "0")}`;
}


export async function nextAssetCode(
  tx: DbTx,
  input: { groupCode: string; equipmentPrefix: string; mode: "individual" | "quantity" },
) {
  const counterKind = input.mode === "individual" ? "ASSET" : "TOOL";
  const key = `${counterKind}:${input.groupCode}`;
  const result = (await tx.execute(sql`
    insert into workflow_counters (key, value, updated_at)
    values (${key}, 1, now())
    on conflict (key) do update
      set value = workflow_counters.value + 1, updated_at = now()
    returning value
  `)) as { rows: Array<{ value: number | string }> };
  const value = Number(result.rows[0]?.value ?? 1);
  const serial = String(value).padStart(4, "0");
  return input.mode === "individual"
    ? `${input.equipmentPrefix}-${serial}`
    : `${input.equipmentPrefix}-VT-${serial}`;
}

export type LockedEquipment = {
  id: string;
  code: string;
  owner_group_id: string;
  current_group_id: string;
  status: string;
  condition: string;
  record_status: "draft" | "active";
};

export async function lockEquipment(tx: DbTx, equipmentId: string): Promise<LockedEquipment> {
  const result = (await tx.execute(sql`
    select id, code, owner_group_id, current_group_id, status, condition, record_status
    from equipment where id = ${equipmentId} for update
  `)) as { rows: LockedEquipment[] };
  const item = result.rows[0];
  if (!item) throw new Error("Không tìm thấy máy/CCDC.");
  return item;
}

export async function assertEquipmentHasNoOtherOpenWorkflow(
  tx: DbTx,
  equipmentId: string,
  except: { machineLoanId?: string; transferId?: string; repairId?: string; disposalId?: string } = {},
) {
  const [loan] = await tx.select({ id: machineLoans.id }).from(machineLoans).where(and(
    eq(machineLoans.equipmentId, equipmentId),
    inArray(machineLoans.status, ["pending_owner", "approved", "wait_handover", "on_loan", "return_requested", "incident"]),
  )).limit(1);
  if (loan && except.machineLoanId !== loan.id) throw new Error("Máy đang có phiếu mượn chưa hoàn tất.");

  const [transfer] = await tx.select({ id: transfers.id }).from(transfers).where(and(
    eq(transfers.equipmentId, equipmentId),
    inArray(transfers.status, ["pending_source", "pending_target", "pending_ws", "wait_handover"]),
  )).limit(1);
  if (transfer && except.transferId !== transfer.id) throw new Error("Máy đang có phiếu điều chuyển chưa hoàn tất.");

  const [repair] = await tx.select({ id: repairs.id }).from(repairs).where(and(
    eq(repairs.equipmentId, equipmentId),
    inArray(repairs.status, ["pending_acceptance", "repairing", "wait_owner_confirm"]),
  )).limit(1);
  if (repair && except.repairId !== repair.id) throw new Error("Máy đang có phiếu sửa chữa chưa hoàn tất.");

  const [disposal] = await tx.select({ id: disposals.id }).from(disposals).where(and(
    eq(disposals.equipmentId, equipmentId),
    inArray(disposals.status, ["pending_group", "pending_ws", "wait_warehouse"]),
  )).limit(1);
  if (disposal && except.disposalId !== disposal.id) throw new Error("Máy đang có phiếu thanh lý chưa hoàn tất.");
}
