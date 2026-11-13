import Link from "next/link";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  Handshake,
  RotateCcw,
  Search,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import { activityLogs, equipment, groups, machineLoans, quickLoans, repairs, transfers, users } from "@/lib/db/schema";
import { canViewWholeWorkshop, hasGroupPermission, requireUser } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/utils";
import { vnDate } from "@/lib/export/equipment-export";
import { DUE_SOON_DAYS, attentionText, buildAttention, overdueTaskKeys } from "@/lib/attention";
import { dmy } from "@/lib/reports";
import { WORKFLOW_LABELS } from "@/lib/constants";
import { loadMyTasks } from "@/lib/my-tasks-data";
import { buildHomeActions, greetingFor, kpiLinks, shortName, type HomeActionIcon } from "@/lib/home-actions";
import { getRoleSummary } from "@/lib/auth/roles";
import { approveMachineLoanAction, confirmMachineReturnAction, rejectMachineLoanAction, requestMachineReturnAction } from "@/actions/machine-loans";
import { approveQuickLoanAction, closeQuickLoanAction, rejectQuickLoanAction, reportQuickLoanReturnAction } from "@/actions/quick-loans";

const statusMeta = {
  in_use_owner: ["Sẵn sàng", "#7BA7CC"],
  wait_handover: ["Đang điều chuyển", "#4C91C7"],
  on_loan: ["Đang mượn", "#1F6FAE"],
  return_requested: ["Chờ nhận lại", "#2C83BF"],
  wait_inspection: ["Chờ kiểm tra", "#8AB6D6"],
  repairing: ["Đang sửa chữa", "#E08A19"],
  wait_repair_confirm: ["Chờ xác nhận sửa", "#D3A23C"],
  wait_disposal: ["Chờ thanh lý", "#D65A4A"],
  disposal_warehouse: ["Kho thanh lý", "#8996A5"],
  lost: ["Đã mất", "#6B7280"],
  inactive: ["Ngừng sử dụng", "#AEB7C2"],
} as const;

const openLoanStatuses = ["pending_owner", "approved", "wait_handover", "on_loan", "return_requested", "incident"] as const;
const openRepairStatuses = ["pending_acceptance", "repairing", "wait_owner_confirm", "wait_owner_receive"] as const;
const openQuickLoanStatuses = ["pending_approval", "pending_receipt", "borrowed", "return_reported"] as const;
const openTransferStatuses = ["pending_source", "pending_target", "pending_ws", "wait_handover"] as const;

export const dynamic = "force-dynamic";

/** Số việc hiện sẵn trên thẻ "Việc chờ tôi xử lý"; còn lại bấm vào từng trang nghiệp vụ. */
const MY_TASKS_SHOWN = 8;
const MOBILE_TASKS_SHOWN = 5;
const ATTENTION_SHOWN = 8;
const MOBILE_ATTENTION_SHOWN = 4;

const ACTION_ICONS: Record<HomeActionIcon, LucideIcon> = {
  loan: Handshake,
  return: RotateCcw,
  repair: Wrench,
  search: Search,
  inventory: ClipboardCheck,
  approve: CheckCircle2,
  report: BarChart3,
  import: FileSpreadsheet,
  equipment: Boxes,
};

/** Ô số liệu: bấm được để mở danh sách tương ứng (không có trang với vai trò này thì chỉ hiện số). */
function Kpi({ href, label, value, note, icon: Icon, focus }: { href: string | null; label: string; value: number; note: string; icon: LucideIcon; focus?: boolean }) {
  const content = (
    <>
      <div><span>{label}</span><strong>{value}</strong></div>
      <Icon size={23} aria-hidden="true" />
      <small>{note}</small>
    </>
  );
  const className = focus ? "executive-kpi is-focus" : "executive-kpi";
  return href ? <Link href={href} className={className + " is-link"}>{content}</Link> : <article className={className}>{content}</article>;
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function DashboardPage({ searchParams }: { searchParams?: SearchParams }) {
  const auth = await requireUser();
  const params = searchParams ? await searchParams : {};
  const q = one(params.q).trim();
  const filterGroup = one(params.group);
  const filterStatus = one(params.status);
  const showMobileInbox = one(params.inbox) === "1";
  const showMobileRelated = one(params.related) === "1";
  const fullWorkshopScope = canViewWholeWorkshop(auth);
  const allowedGroupIds = new Set(auth.permissions.map((permission) => permission.groupId));
  const today = vnDate();

  const myTasks = await loadMyTasks(auth);
  const shownTasks = myTasks.slice(0, MY_TASKS_SHOWN);

  const [groupRows, equipmentRows, loanRows, quickLoanRows, repairRows, transferRows, recentRows] = await Promise.all([
    db.select({ id: groups.id, name: groups.name, code: groups.code }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name)),
    db.select({
      id: equipment.id,
      code: equipment.code,
      legacyCode: equipment.legacyCode,
      name: equipment.name,
      model: equipment.model,
      equipmentType: equipment.equipmentType,
      categoryCode: equipment.categoryCode,
      ownerGroupId: equipment.ownerGroupId,
      currentLocation: equipment.currentLocation,
      status: equipment.status,
      condition: equipment.condition,
    }).from(equipment).where(and(isNull(equipment.archivedAt), eq(equipment.recordStatus, "active"))).orderBy(asc(equipment.code)),
    db.select().from(machineLoans).where(inArray(machineLoans.status, [...openLoanStatuses])).orderBy(desc(machineLoans.createdAt)),
    db.select().from(quickLoans).where(inArray(quickLoans.status, [...openQuickLoanStatuses])).orderBy(desc(quickLoans.createdAt)),
    db.select().from(repairs).where(inArray(repairs.status, [...openRepairStatuses])).orderBy(desc(repairs.createdAt)),
    db.select().from(transfers).where(inArray(transfers.status, [...openTransferStatuses])).orderBy(desc(transfers.createdAt)),
    db.select({
      id: activityLogs.id,
      action: activityLogs.action,
      description: activityLogs.description,
      createdAt: activityLogs.createdAt,
      actorGroupId: activityLogs.actorGroupId,
      actorName: users.fullName,
      actorEmployeeCode: users.employeeCode,
    }).from(activityLogs)
      .leftJoin(users, eq(activityLogs.actorUserId, users.id))
      .orderBy(desc(activityLogs.createdAt)).limit(30),
  ]);

  const groupMap = new Map(groupRows.map((group) => [group.id, group.name]));
  const equipmentMap = new Map(equipmentRows.map((item) => [item.id, item]));
  const scopedEquipment = equipmentRows.filter((item) => fullWorkshopScope || allowedGroupIds.has(item.ownerGroupId));
  const scopedEquipmentIds = new Set(scopedEquipment.map((item) => item.id));
  const scopedLoans = loanRows.filter((row) => fullWorkshopScope || allowedGroupIds.has(row.ownerGroupId) || allowedGroupIds.has(row.borrowerGroupId));
  const scopedQuickLoans = quickLoanRows.filter((row) => fullWorkshopScope || allowedGroupIds.has(row.sourceGroupId) || allowedGroupIds.has(row.borrowerGroupId));
  const scopedRepairs = repairRows.filter((row) => fullWorkshopScope || allowedGroupIds.has(row.reportedByGroupId) || scopedEquipmentIds.has(row.equipmentId));
  const scopedTransfers = transferRows.filter((row) => fullWorkshopScope || allowedGroupIds.has(row.sourceGroupId) || allowedGroupIds.has(row.targetGroupId));
  const scopedRecent = recentRows.filter((row) => fullWorkshopScope || (row.actorGroupId ? allowedGroupIds.has(row.actorGroupId) : false)).slice(0, 6);

  const overdueLoanCount = scopedLoans.filter((row) => row.expectedReturnDate < today && ["on_loan", "return_requested", "incident"].includes(row.status)).length;
  const repairCount = scopedRepairs.length;
  const transferCount = scopedTransfers.length;
  const onLoanEquipmentIds = new Set(scopedLoans.filter((row) => ["on_loan", "return_requested", "incident"].includes(row.status)).map((row) => row.equipmentId));
  const repairEquipmentIds = new Set(scopedRepairs.map((row) => row.equipmentId));
  const transferEquipmentIds = new Set(scopedTransfers.map((row) => row.equipmentId));
  const readyCount = scopedEquipment.filter((item) => item.status === "in_use_owner" && item.condition === "good").length;

  const actionableMachineLoans = scopedLoans.filter((row) =>
    (row.status === "pending_owner" && hasGroupPermission(auth, row.ownerGroupId, "operator")) ||
    (row.status === "return_requested" && hasGroupPermission(auth, row.ownerGroupId, "operator")) ||
    (row.status === "on_loan" && hasGroupPermission(auth, row.borrowerGroupId, "viewer"))
  );
  const actionableQuickLoans = scopedQuickLoans.filter((row) =>
    (row.status === "pending_approval" && hasGroupPermission(auth, row.sourceGroupId, "operator")) ||
    (row.status === "return_reported" && hasGroupPermission(auth, row.sourceGroupId, "operator")) ||
    (["pending_receipt", "borrowed"].includes(row.status) && hasGroupPermission(auth, row.borrowerGroupId, "viewer"))
  );
  const mobileActionCount = actionableMachineLoans.length + actionableQuickLoans.length;
  const mobileRelatedMachine = scopedLoans.filter((row) => ["on_loan", "return_requested", "incident"].includes(row.status));
  const mobileRelatedQuick = scopedQuickLoans.filter((row) => ["pending_receipt", "borrowed", "return_reported"].includes(row.status));
  const mobileRelatedCount = mobileRelatedMachine.length + mobileRelatedQuick.length;
  const machineBorrowedByMe = mobileRelatedMachine.filter((row) => hasGroupPermission(auth, row.borrowerGroupId, "viewer")).length;
  const machineLentByMe = mobileRelatedMachine.filter((row) => hasGroupPermission(auth, row.ownerGroupId, "viewer")).length;
  const quickBorrowedByMe = mobileRelatedQuick.filter((row) => hasGroupPermission(auth, row.borrowerGroupId, "viewer")).length;
  const quickLentByMe = mobileRelatedQuick.filter((row) => hasGroupPermission(auth, row.sourceGroupId, "viewer")).length;

  const statusData = Object.entries(
    scopedEquipment.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {}),
  ).map(([status, value]) => ({
    status,
    value,
    label: statusMeta[status as keyof typeof statusMeta]?.[0] || status,
    color: statusMeta[status as keyof typeof statusMeta]?.[1] || "#AEB7C2",
  })).sort((a, b) => b.value - a.value);

  const totalEquipment = scopedEquipment.length;
  const donutStops = statusData.length
    ? statusData.reduce<{ stop: number; part: string }[]>((acc, item) => {
        const previous = acc.at(-1)?.stop || 0;
        const stop = previous + (totalEquipment ? item.value / totalEquipment * 100 : 0);
        acc.push({ stop, part: `${item.color} ${previous}% ${stop}%` });
        return acc;
      }, []).map((item) => item.part).join(", ")
    : "#DDE5EC 0% 100%";

  const groupDistribution = groupRows
    .map((group) => ({ group, count: scopedEquipment.filter((item) => item.ownerGroupId === group.id).length }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxGroupCount = Math.max(1, ...groupDistribution.map((row) => row.count));

  const normalizedQuery = q.toLocaleLowerCase("vi");
  const hasDynamicFilter = Boolean(q || filterGroup || filterStatus);
  const filteredEquipment = scopedEquipment.filter((item) => {
    if (filterGroup && item.ownerGroupId !== filterGroup) return false;
    if (filterStatus && item.status !== filterStatus) return false;
    if (!normalizedQuery) return true;
    const haystack = [
      item.code,
      item.legacyCode,
      item.name,
      item.model,
      item.equipmentType,
      item.categoryCode,
      item.currentLocation,
      groupMap.get(item.ownerGroupId),
    ].filter(Boolean).join(" ").toLocaleLowerCase("vi");
    return haystack.includes(normalizedQuery);
  });
  const filteredIds = new Set(filteredEquipment.map((item) => item.id));
  const filteredDistribution = groupRows
    .map((group) => ({ group, count: filteredEquipment.filter((item) => item.ownerGroupId === group.id).length }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
  const filteredReady = filteredEquipment.filter((item) => item.status === "in_use_owner" && item.condition === "good").length;
  const filteredLoans = [...filteredIds].filter((id) => onLoanEquipmentIds.has(id)).length;
  const filteredRepairs = [...filteredIds].filter((id) => repairEquipmentIds.has(id)).length;
  const filteredTransfers = [...filteredIds].filter((id) => transferEquipmentIds.has(id)).length;

  const scopeLabel = fullWorkshopScope ? "toàn XSC" : auth.permissions.length === 1 ? auth.permissions[0].groupName : "các nhóm được phân quyền";
  const attention = buildAttention({
    loans: loanRows.map((row) => { const machine = equipmentMap.get(row.equipmentId); return { id: row.id, code: row.code, label: machine ? `${machine.name} (${machine.code})` : "Máy/CCDC", status: row.status, ownerGroupId: row.ownerGroupId, borrowerGroupId: row.borrowerGroupId, expectedReturnDate: row.expectedReturnDate }; }),
    quickLoans: quickLoanRows.map((row) => ({ id: row.id, code: row.code, label: `${row.itemName} × ${Number(row.quantityBorrowed)} ${row.unit}`, status: row.status, sourceGroupId: row.sourceGroupId, borrowerGroupId: row.borrowerGroupId, expectedReturnAt: row.expectedReturnAt })),
    groupNames: groupMap,
    today,
    scope: { whole: fullWorkshopScope, groupIds: allowedGroupIds },
    excludeKeys: overdueTaskKeys(myTasks.map((task) => task.key)),
  });
  const shownAttention = attention.slice(0, ATTENTION_SHOWN);
  const homeActions = buildHomeActions(auth, { pendingTasks: myTasks.length, inventoryTasks: myTasks.filter((task) => task.section === "inventory").length });
  const links = kpiLinks(auth);
  const todayLabel = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const borrowedCountForMobile = machineBorrowedByMe + quickBorrowedByMe;
  const lentCountForMobile = machineLentByMe + quickLentByMe;
  const returnWaitingCount = mobileRelatedMachine.filter((row) => row.status === "return_requested").length
    + mobileRelatedQuick.filter((row) => row.status === "return_reported").length;

  return (
    <div className="dashboard-page">
      <section className="mobile-ops-home" aria-label="Trang chủ CCDC trên điện thoại">
        <header className="mobile-ops-header mobile-ops-header-v2">
          <div>
            <strong>{auth.fullName}</strong>
            <small>{auth.primaryGroupName || (fullWorkshopScope ? "Toàn XSC" : "CCDC Xưởng Sửa chữa")}</small>
          </div>
          <Link href="/profile" className="mobile-ops-avatar" aria-label="Hồ sơ cá nhân">{auth.fullName.trim().slice(0, 1).toUpperCase()}</Link>
        </header>

        <form className="mobile-ops-search" action="/search" method="get" role="search">
          <Search size={18} aria-hidden="true" />
          <input name="q" placeholder="Tìm máy, tem nhôm, serial, mã phiếu..." aria-label="Tìm kiếm chung" />
        </form>

        <section className="mobile-ops-block mobile-tasks" id="mobile-my-tasks" aria-label="Việc chờ tôi">
          <div className="mobile-ops-block-title">
            <div><strong>Việc chờ tôi</strong><small>{auth.isReadOnlyViewer ? "Tài khoản chỉ xem" : myTasks.length ? "Bấm vào việc để xử lý" : "Không có việc nào đang chờ bạn"}</small></div>
            <span>{myTasks.length}</span>
          </div>
          {myTasks.slice(0, MOBILE_TASKS_SHOWN).map((task) => (
            <Link href={task.href} key={task.key} className="mobile-task-card" data-tone={task.tone}>
              <div><strong>{task.action}</strong><span>{task.label}</span><small>{task.detail}</small></div>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          ))}
          {myTasks.length > MOBILE_TASKS_SHOWN ? <p className="mobile-ops-empty">Còn {myTasks.length - MOBILE_TASKS_SHOWN} việc nữa — mở mục Mượn – Trả, Điều chuyển… trong menu (có số đỏ).</p> : null}
        </section>

        {attention.length ? (
          <section className="mobile-ops-block mobile-attention" id="mobile-attention" aria-label="Chú ý hôm nay">
            <div className="mobile-ops-block-title">
              <div><strong>Chú ý hôm nay</strong><small>Phiếu quá hạn hoặc sắp đến hạn trả</small></div>
              <span>{attention.length}</span>
            </div>
            {attention.slice(0, MOBILE_ATTENTION_SHOWN).map((row) => (
              <Link href={row.href} key={row.key} className="mobile-task-card" data-tone={row.state === "overdue" ? "red" : "orange"}>
                <div><strong>{attentionText(row)}</strong><span>{row.label}</span><small>{row.borrowerGroup} mượn của {row.ownerGroup}</small></div>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            ))}
            {attention.length > MOBILE_ATTENTION_SHOWN ? <p className="mobile-ops-empty">Còn {attention.length - MOBILE_ATTENTION_SHOWN} phiếu nữa — mở mục Mượn – Trả.</p> : null}
          </section>
        ) : null}

        <div className="mobile-ops-primary mobile-ops-primary-v2" id="mobile-actions">
          {homeActions.map((action) => {
            const Icon = ACTION_ICONS[action.icon];
            return (
              <Link href={action.href} key={action.key} className="mobile-action-card">
                <span><Icon size={20} /></span>
                <div><strong>{action.label}</strong><small>{action.hint}</small></div>
                {action.badge ? <b className="home-action-badge">{action.badge}</b> : <ChevronRight size={16} />}
              </Link>
            );
          })}
        </div>

        <section className="mobile-ops-block mobile-ops-summary" id="mobile-work-inbox">
          <Link className="mobile-ops-block-title is-link" href={showMobileInbox ? "/dashboard" : "/dashboard?inbox=1#mobile-work-inbox"}>
            <div><strong>Việc cần xử lý</strong><small>{mobileActionCount ? "Bấm để xem và xử lý các lệnh đang chờ" : "Không có việc cần xử lý"}</small></div>
            <span>{mobileActionCount}</span><ChevronRight size={17} />
          </Link>
          {showMobileInbox && mobileActionCount ? (
            <div className="mobile-unified-inbox">
              {actionableMachineLoans.slice(0, 8).map((loan) => {
                const machine = equipmentMap.get(loan.equipmentId);
                const owner = groupMap.get(loan.ownerGroupId) || "—";
                const borrower = groupMap.get(loan.borrowerGroupId) || "—";
                return (
                  <article className="mobile-inbox-card" key={`machine-${loan.id}`}>
                    <div className="mobile-inbox-copy"><small>Mượn máy · {loan.code}</small><strong>{machine?.name || "Máy/CCDC"}</strong><span>{machine?.code || "—"} · {owner} → {borrower}</span></div>
                    {loan.status === "pending_owner" ? (
                      <div className="mobile-inbox-actions">
                        <form action={rejectMachineLoanAction}><input type="hidden" name="loanId" value={loan.id} /><Button size="sm" variant="secondary">Từ chối</Button></form>
                        <form action={approveMachineLoanAction}><input type="hidden" name="loanId" value={loan.id} /><Button size="sm">Duyệt</Button></form>
                      </div>
                    ) : loan.status === "return_requested" ? (
                      <form action={confirmMachineReturnAction} className="mobile-inbox-actions"><input type="hidden" name="loanId" value={loan.id} /><input type="hidden" name="condition" value="good" /><Button size="sm">Xác nhận nhận lại</Button></form>
                    ) : (
                      <form action={requestMachineReturnAction} className="mobile-inbox-actions"><input type="hidden" name="loanId" value={loan.id} /><Button size="sm" variant="secondary">Báo trả</Button></form>
                    )}
                  </article>
                );
              })}
              {actionableQuickLoans.slice(0, 8).map((loan) => (
                <article className="mobile-inbox-card" key={`quick-${loan.id}`}>
                  <div className="mobile-inbox-copy"><small>Mượn nhanh · {loan.code}</small><strong>{loan.itemName}</strong><span>{loan.quantityBorrowed} {loan.unit} · {groupMap.get(loan.sourceGroupId) || "—"} → {groupMap.get(loan.borrowerGroupId) || "—"}</span></div>
                  {loan.status === "pending_approval" ? (
                    <div className="mobile-inbox-actions">
                      <form action={rejectQuickLoanAction}><input type="hidden" name="loanId" value={loan.id} /><Button size="sm" variant="secondary">Từ chối</Button></form>
                      <form action={approveQuickLoanAction}><input type="hidden" name="loanId" value={loan.id} /><Button size="sm">Duyệt</Button></form>
                    </div>
                  ) : loan.status === "return_reported" ? (
                    <form action={closeQuickLoanAction} className="mobile-inbox-actions">
                      <input type="hidden" name="loanId" value={loan.id} /><input type="hidden" name="returnedGood" value={Number(loan.quantityBorrowed)} /><input type="hidden" name="returnedDamaged" value="0" /><input type="hidden" name="lostQuantity" value="0" /><Button size="sm">Xác nhận nhận lại</Button>
                    </form>
                  ) : (
                    <form action={reportQuickLoanReturnAction} className="mobile-inbox-actions"><input type="hidden" name="loanId" value={loan.id} /><Button size="sm" variant="secondary">Báo trả</Button></form>
                  )}
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className="mobile-ops-block mobile-ops-summary" id="mobile-related">
          <Link className="mobile-ops-block-title is-link" href={showMobileRelated ? "/dashboard" : "/dashboard?related=1#mobile-related"}>
            <div><strong>Đang liên quan</strong><small>{mobileRelatedCount ? `${borrowedCountForMobile} đang mượn · ${lentCountForMobile} đang cho mượn${returnWaitingCount ? ` · ${returnWaitingCount} chờ nhận lại` : ""}` : "Không có giao dịch đang diễn ra"}</small></div>
            <span>{mobileRelatedCount}</span><ChevronRight size={17} />
          </Link>
          {showMobileRelated && mobileRelatedCount ? (
            <div className="mobile-related-list">
              {mobileRelatedMachine.slice(0, 6).map((loan) => {
                const machine = equipmentMap.get(loan.equipmentId);
                const ownerView = hasGroupPermission(auth, loan.ownerGroupId, "viewer");
                const label = loan.status === "return_requested" ? (ownerView ? "Chờ nhận lại" : "Đã báo trả") : (ownerView ? "Đang cho mượn" : "Đang mượn");
                return <Link href="/machine-loans" key={`related-machine-${loan.id}`} className="mobile-related-item"><div><strong>{machine?.name || "Máy/CCDC"}</strong><span>{machine?.code || loan.code} · {groupMap.get(loan.ownerGroupId) || "—"} → {groupMap.get(loan.borrowerGroupId) || "—"}</span></div><small>{label}</small></Link>;
              })}
              {mobileRelatedQuick.slice(0, 6).map((loan) => {
                const ownerView = hasGroupPermission(auth, loan.sourceGroupId, "viewer");
                const label = loan.status === "return_reported" ? (ownerView ? "Chờ nhận lại" : "Đã báo trả") : (ownerView ? "Đang cho mượn" : "Đang mượn");
                return <Link href="/quick-loans" key={`related-quick-${loan.id}`} className="mobile-related-item"><div><strong>{loan.itemName}</strong><span>{loan.quantityBorrowed} {loan.unit} · {groupMap.get(loan.sourceGroupId) || "—"} → {groupMap.get(loan.borrowerGroupId) || "—"}</span></div><small>{label}</small></Link>;
              })}
            </div>
          ) : null}
        </section>
      </section>
      <section className="home-hero" aria-label="Xin chào">
        <div className="home-hero-copy">
          <span className="home-date">{todayLabel}</span>
          <h1>{greetingFor()}, {shortName(auth.fullName)}</h1>
          <p>{getRoleSummary(auth)} · {scopeLabel}</p>
          <p className="home-hero-status" data-state={auth.isReadOnlyViewer ? "view" : myTasks.length ? "busy" : "clear"}>
            {auth.isReadOnlyViewer ? "Tài khoản chỉ xem: tra cứu máy và xem báo cáo." : myTasks.length ? `Bạn có ${myTasks.length} việc đang chờ xử lý.` : "Không có việc nào đang chờ bạn."}
          </p>
        </div>
        <div className="home-actions">
          {homeActions.map((action) => {
            const Icon = ACTION_ICONS[action.icon];
            return (
              <Link href={action.href} key={action.key} className="home-action">
                <span className="home-action-icon"><Icon size={22} aria-hidden="true" /></span>
                <strong>{action.label}</strong>
                <small>{action.hint}</small>
                {action.badge ? <b className="home-action-badge" aria-label={`${action.badge} việc`}>{action.badge}</b> : null}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="my-tasks" id="viec-cho-toi" aria-label="Việc chờ tôi xử lý">
        <Card>
          <CardHeader>
            <CardTitle>Việc chờ tôi xử lý</CardTitle>
            <span className={myTasks.length ? "my-tasks-count" : "my-tasks-count is-zero"}>{myTasks.length}</span>
          </CardHeader>
          <CardContent>
            {auth.isReadOnlyViewer ? (
              <EmptyState title="Chế độ chỉ xem" description="Tài khoản xem toàn xưởng không có phiếu cần xử lý." />
            ) : myTasks.length ? (
              <>
                <div className="my-task-list">
                  {shownTasks.map((task) => (
                    <div className="my-task-row" data-tone={task.tone} key={task.key}>
                      <div className="my-task-main">
                        <strong>{task.action}</strong>
                        <span>{task.label}</span>
                        <small>{task.detail} · chờ từ {formatDateTime(task.since)}</small>
                      </div>
                      <Link href={task.href} className="btn btn-primary btn-sm">Xử lý <ChevronRight size={14} /></Link>
                    </div>
                  ))}
                </div>
                {myTasks.length > shownTasks.length ? <p className="my-tasks-more">Còn {myTasks.length - shownTasks.length} việc nữa — mở từng mục nghiệp vụ trên menu (có số đỏ) để xử lý.</p> : null}
              </>
            ) : (
              <EmptyState title="Không có việc nào đang chờ bạn" description="Phiếu cần bạn duyệt hoặc xác nhận sẽ hiện ở đây và trên chuông thông báo." />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="home-attention" aria-label="Chú ý hôm nay">
        <Card>
          <CardHeader>
            <div><CardTitle>Chú ý hôm nay</CardTitle><p className="card-subtitle">Phiếu mượn đã quá hạn hoặc sắp đến hạn trả (trong {DUE_SOON_DAYS} ngày), trong phạm vi {scopeLabel}.</p></div>
            <span className={attention.length ? "my-tasks-count" : "my-tasks-count is-zero"}>{attention.length}</span>
          </CardHeader>
          <CardContent>
            {shownAttention.length ? (
              <>
                <div className="my-task-list">
                  {shownAttention.map((row) => (
                    <div className="my-task-row" data-tone={row.state === "overdue" ? "red" : "orange"} key={row.key}>
                      <div className="my-task-main">
                        <strong>{attentionText(row)} · hạn {dmy(row.dueDate)}</strong>
                        <span>{row.label}</span>
                        <small>{row.kind} {row.code} · {row.borrowerGroup} mượn của {row.ownerGroup}</small>
                      </div>
                      {auth.isReadOnlyViewer ? null : <Link href={row.href} className="btn btn-secondary btn-sm">Xử lý <ChevronRight size={14} /></Link>}
                    </div>
                  ))}
                </div>
                {attention.length > shownAttention.length ? <p className="my-tasks-more">Còn {attention.length - shownAttention.length} phiếu nữa — {fullWorkshopScope ? "xem đủ ở Báo cáo → Phiếu quá hạn trả" : "mở mục Mượn – Trả"}.</p> : null}
              </>
            ) : (
              <p className="home-attention-clear"><CheckCircle2 size={18} aria-hidden="true" /> Không có phiếu nào quá hạn hoặc sắp đến hạn trả.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="executive-kpis dashboard-kpi-six" aria-label="Chỉ số vận hành">
        <Kpi focus href={links.tasks} label="Chờ tôi xử lý" value={myTasks.length} note={myTasks.length ? "Xem danh sách phía trên" : "Không có việc đang chờ bạn"} icon={AlertTriangle} />
        <Kpi href={links.total} label="Tổng CCDC" value={totalEquipment} note={scopeLabel} icon={Boxes} />
        <Kpi href={links.ready} label="Sẵn sàng" value={readyCount} note="Sẵn sàng · tình trạng tốt" icon={Boxes} />
        <Kpi href={links.loans} label="Đang mượn" value={onLoanEquipmentIds.size} note={`${overdueLoanCount} phiếu quá hạn`} icon={Handshake} />
        <Kpi href={links.repairs} label="Sửa chữa" value={repairCount} note="Phiếu sửa đang mở" icon={Wrench} />
        <Kpi href={links.transfers} label="Điều chuyển" value={transferCount} note="Phiếu điều chuyển đang mở" icon={ArrowLeftRight} />
      </section>

      <section className="home-recent" aria-label="Hoạt động gần đây">
          <Card className="recent-card">
            <CardHeader><CardTitle>Hoạt động gần đây</CardTitle><Link href="/activities">Xem tất cả</Link></CardHeader>
            <CardContent>
              {scopedRecent.length ? <div className="recent-activity-list">
                {scopedRecent.map((row) => <div className="recent-activity-row" key={row.id}><span className="activity-icon"><Activity size={15} /></span><div><strong>{row.actorName || "Hệ thống"}</strong><span>{row.description}</span></div><time>{formatDateTime(row.createdAt)}</time></div>)}
              </div> : <EmptyState description="Chưa có hoạt động được ghi nhận." />}
            </CardContent>
          </Card>
      </section>

      <details className="home-more" open={hasDynamicFilter}>
        <summary><BarChart3 size={18} aria-hidden="true" /> <span>Biểu đồ và phân tích</span> <small>Trạng thái dụng cụ, phân bố theo nhóm, tìm kiếm phân tích</small></summary>
      <section className="dashboard-search-analysis" aria-label="Tìm kiếm và phân tích CCDC">
        <Card>
          <CardHeader><CardTitle>Tìm kiếm & phân tích CCDC</CardTitle><Search size={18} /></CardHeader>
          <CardContent>
            <form method="get" className="dashboard-search-form">
              <label className="dashboard-search-box"><Search size={17} /><input name="q" defaultValue={q} placeholder="Gõ mã hệ thống, tem nhôm, tên máy, model, loại, vị trí..." /></label>
              <select name="group" defaultValue={filterGroup} aria-label="Lọc theo nhóm">
                <option value="">Tất cả nhóm</option>
                {groupRows.filter((group) => fullWorkshopScope || allowedGroupIds.has(group.id)).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
              <select name="status" defaultValue={filterStatus} aria-label="Lọc theo trạng thái">
                <option value="">Tất cả trạng thái</option>
                {Object.entries(statusMeta).map(([value, [label]]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button className="btn btn-primary" type="submit">Phân tích</button>
              {hasDynamicFilter ? <Link className="btn btn-secondary" href="/dashboard">Xóa lọc</Link> : null}
            </form>

            {hasDynamicFilter ? (
              <div className="dynamic-analysis-panel">
                <div className="dynamic-analysis-kpis">
                  <div><span>Kết quả</span><strong>{filteredEquipment.length}</strong></div>
                  <div><span>Sẵn sàng</span><strong>{filteredReady}</strong></div>
                  <div><span>Đang mượn</span><strong>{filteredLoans}</strong></div>
                  <div><span>Sửa chữa</span><strong>{filteredRepairs}</strong></div>
                  <div><span>Điều chuyển</span><strong>{filteredTransfers}</strong></div>
                </div>
                <div className="dynamic-group-summary">
                  <strong>Phân bố theo nhóm</strong>
                  <div>{filteredDistribution.length ? filteredDistribution.map(({ group, count }) => <span key={group.id}>{group.name}<b>{count}</b></span>) : <em>Không có CCDC phù hợp.</em>}</div>
                </div>
                {filteredEquipment.length ? <Link href={`/equipment?q=${encodeURIComponent(q)}${filterGroup ? `&group=${encodeURIComponent(filterGroup)}` : ""}${filterStatus ? `&status=${encodeURIComponent(filterStatus)}` : ""}`} className="dashboard-analysis-link">Xem danh sách CCDC phù hợp <ChevronRight size={15} /></Link> : null}
              </div>
            ) : <p className="dashboard-search-hint">Gõ ví dụ <strong>máy hàn</strong> để tạo dashboard thống kê riêng theo kết quả tìm kiếm. Dashboard Tổng quan phía trên vẫn giữ nguyên.</p>}
          </CardContent>
        </Card>
      </section>

      <section className="dashboard-operations-grid">
        <Card className="status-card">
          <CardHeader><CardTitle>Trạng thái dụng cụ</CardTitle><Boxes size={18} /></CardHeader>
          <CardContent>
            <div className="status-overview">
              <div className="status-donut" style={{ background: `conic-gradient(${donutStops})` }}><div><strong>{totalEquipment}</strong><span>Tổng số</span></div></div>
              <div className="status-legend">
                {statusData.slice(0, 6).map((item) => <div key={item.status}><i style={{ background: item.color }} /><span>{item.label}</span><strong>{item.value}</strong></div>)}
                {!statusData.length ? <span className="muted">Chưa có dữ liệu thiết bị.</span> : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group-distribution-card">
          <CardHeader><CardTitle>Phân bố CCDC theo nhóm</CardTitle><Boxes size={18} /></CardHeader>
          <CardContent>
            {groupDistribution.length ? <div className="dashboard-group-bars">
              {groupDistribution.map(({ group, count }) => <div key={group.id}><span>{group.name}</span><i><b style={{ width: `${Math.max(5, count / maxGroupCount * 100)}%` }} /></i><strong>{count}</strong></div>)}
            </div> : <EmptyState description="Chưa có dữ liệu phân bố." />}
          </CardContent>
        </Card>

      </section>
      </details>
    </div>
  );
}
