import Link from "next/link";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  ChevronRight,
  Clock3,
  Handshake,
  Plus,
  Search,
  Wrench,
} from "lucide-react";
import { db } from "@/lib/db";
import { activityLogs, equipment, groups, machineLoans, quickLoans, repairs, transfers } from "@/lib/db/schema";
import { hasGroupPermission, requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/utils";
import { WORKFLOW_LABELS } from "@/lib/constants";
import { approveMachineLoanAction, confirmMachineReturnAction, rejectMachineLoanAction, requestMachineReturnAction } from "@/actions/machine-loans";
import { approveQuickLoanAction, closeQuickLoanAction, rejectQuickLoanAction, reportQuickLoanReturnAction } from "@/actions/quick-loans";

const statusMeta = {
  in_use_owner: ["Sẵn sàng", "#7BA7CC"],
  wait_handover: ["Chờ giao", "#4C91C7"],
  on_loan: ["Đang mượn", "#1F6FAE"],
  return_requested: ["Chờ nhận lại", "#2C83BF"],
  wait_inspection: ["Chờ kiểm tra", "#8AB6D6"],
  repairing: ["Đang sửa chữa", "#E08A19"],
  wait_repair_confirm: ["Chờ xác nhận sửa", "#D3A23C"],
  wait_disposal: ["Chờ thanh lý", "#D65A4A"],
  disposal_warehouse: ["Kho thanh lý", "#8996A5"],
  inactive: ["Ngừng sử dụng", "#AEB7C2"],
} as const;

const openLoanStatuses = ["pending_owner", "approved", "wait_handover", "on_loan", "return_requested", "incident"] as const;
const openRepairStatuses = ["pending_acceptance", "repairing", "wait_owner_confirm"] as const;
const openQuickLoanStatuses = ["pending_approval", "pending_receipt", "borrowed", "return_reported"] as const;
const openTransferStatuses = ["pending_source", "pending_target", "pending_ws", "wait_handover"] as const;

export const dynamic = "force-dynamic";

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
  const fullWorkshopScope = auth.isAdmin || auth.isWsManager || auth.isReadOnlyViewer;
  const allowedGroupIds = new Set(auth.permissions.map((permission) => permission.groupId));
  const today = new Date().toISOString().slice(0, 10);

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
    db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(30),
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

  const pendingLoanCount = scopedLoans.filter((row) => row.status === "pending_owner").length;
  const overdueLoanCount = scopedLoans.filter((row) => row.expectedReturnDate < today && ["on_loan", "return_requested", "incident"].includes(row.status)).length;
  const repairCount = scopedRepairs.length;
  const transferCount = scopedTransfers.length;
  const onLoanEquipmentIds = new Set(scopedLoans.filter((row) => ["on_loan", "return_requested", "incident"].includes(row.status)).map((row) => row.equipmentId));
  const repairEquipmentIds = new Set(scopedRepairs.map((row) => row.equipmentId));
  const transferEquipmentIds = new Set(scopedTransfers.map((row) => row.equipmentId));
  const readyCount = scopedEquipment.filter((item) => item.status === "in_use_owner" && item.condition === "good").length;
  const actionCount = pendingLoanCount + overdueLoanCount + repairCount + transferCount;

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

  const tasks = [
    { label: "Phiếu mượn chờ duyệt", count: pendingLoanCount, href: "/machine-loans", icon: Handshake, tone: "blue", visible: !auth.isReadOnlyViewer },
    { label: "Dụng cụ quá hạn trả", count: overdueLoanCount, href: "/machine-loans", icon: AlertTriangle, tone: "red", visible: !auth.isReadOnlyViewer },
    { label: "Dụng cụ đang sửa chữa", count: repairCount, href: "/repairs", icon: Wrench, tone: "orange", visible: !auth.isReadOnlyViewer },
    { label: "Đề nghị điều chuyển", count: transferCount, href: "/transfers", icon: ArrowLeftRight, tone: "sky", visible: !auth.isReadOnlyViewer && (auth.isWorkshopAdmin || auth.permissions.some((p) => p.level === "manager")) },
  ].filter((task) => task.visible);

  const scopeLabel = fullWorkshopScope ? "toàn XSC" : auth.permissions.length === 1 ? auth.permissions[0].groupName : "các nhóm được phân quyền";
  const canOperate = !auth.isReadOnlyViewer && (auth.isWorkshopAdmin || auth.permissions.length > 0);
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

        <form className="mobile-ops-search" action="/equipment" method="get" role="search">
          <Search size={18} aria-hidden="true" />
          <input name="q" placeholder="Tìm mã hoặc tên CCDC..." aria-label="Tìm CCDC" />
        </form>

        {canOperate ? (
          <div className="mobile-ops-primary mobile-ops-primary-v2" id="mobile-actions">
            <Link href="/machine-loans" className="mobile-action-card">
              <span><Handshake size={20} /></span><div><strong>Mượn CCDC</strong><small>{borrowedCountForMobile ? `${borrowedCountForMobile} đang mượn` : "Xem phiếu mượn"}</small></div><ChevronRight size={16} />
            </Link>
            <Link href="/machine-loans#mobile-active-loans" className="mobile-action-card">
              <span><Clock3 size={20} /></span><div><strong>Trả CCDC</strong><small>{returnWaitingCount ? `${returnWaitingCount} chờ nhận lại` : "Xem CCDC cần trả"}</small></div><ChevronRight size={16} />
            </Link>
            <Link href="/repairs" className="mobile-action-card is-compact">
              <span><Wrench size={18} /></span><div><strong>Báo hư</strong><small>{repairCount ? `${repairCount} phiếu đang mở` : "Xem phiếu báo hư"}</small></div><ChevronRight size={16} />
            </Link>
            <Link href="/my-equipment" className="mobile-action-card is-compact">
              <span><Boxes size={18} /></span><div><strong>CCDC nhóm tôi</strong><small>{scopedEquipment.length} CCDC</small></div><ChevronRight size={16} />
            </Link>
          </div>
        ) : (
          <div className="mobile-ops-primary mobile-ops-primary-v2 viewer-only">
            <Link href="/equipment" className="mobile-action-card"><span><Boxes size={20} /></span><div><strong>Dụng cụ toàn xưởng</strong><small>Xem và tra cứu</small></div><ChevronRight size={16} /></Link>
          </div>
        )}

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
      <PageHeader
        title="Tổng quan vận hành"
        description={`Theo dõi tình hình CCDC, cảnh báo và công việc cần xử lý trong ${scopeLabel}.`}
        actions={!auth.isReadOnlyViewer ? (
          <>
            <Link href="/machine-loans" className="btn btn-secondary"><Handshake size={16} /> Tạo phiếu mượn</Link>
            <Link href="/my-equipment" className="btn btn-primary"><Plus size={16} /> Thêm dụng cụ</Link>
          </>
        ) : null}
      />

      <section className="executive-kpis dashboard-kpi-six" aria-label="Chỉ số vận hành">
        <article className="executive-kpi is-focus"><div><span>Cần xử lý</span><strong>{actionCount}</strong></div><AlertTriangle size={24} /><small>{pendingLoanCount} chờ duyệt · {overdueLoanCount} quá hạn</small></article>
        <article className="executive-kpi"><div><span>Tổng CCDC</span><strong>{totalEquipment}</strong></div><Boxes size={23} /><small>{scopeLabel}</small></article>
        <article className="executive-kpi"><div><span>Sẵn sàng</span><strong>{readyCount}</strong></div><Boxes size={23} /><small>Trạng thái sẵn sàng · tình trạng tốt</small></article>
        <article className="executive-kpi"><div><span>Đang mượn</span><strong>{onLoanEquipmentIds.size}</strong></div><Handshake size={23} /><small>{overdueLoanCount} phiếu quá hạn</small></article>
        <article className="executive-kpi"><div><span>Sửa chữa</span><strong>{repairCount}</strong></div><Wrench size={23} /><small>Phiếu sửa đang mở</small></article>
        <article className="executive-kpi"><div><span>Điều chuyển</span><strong>{transferCount}</strong></div><ArrowLeftRight size={23} /><small>Phiếu điều chuyển đang mở</small></article>
      </section>

      <section className="dashboard-search-analysis" aria-label="Tìm kiếm và phân tích CCDC">
        <Card>
          <CardHeader><CardTitle>Tìm kiếm & phân tích CCDC</CardTitle><Search size={18} /></CardHeader>
          <CardContent>
            <form method="get" className="dashboard-search-form">
              <label className="dashboard-search-box"><Search size={17} /><input name="q" defaultValue={q} placeholder="Gõ mã, tên máy, model, loại, vị trí..." /></label>
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
        <Card className="operations-card">
          <CardHeader><CardTitle>Công việc cần xử lý</CardTitle><Clock3 size={18} /></CardHeader>
          <CardContent>
            {tasks.length ? <div className="task-list">
              {tasks.map(({ label, count: value, href, icon: Icon, tone }) => (
                <Link href={href} key={label} className="task-row" data-tone={tone}>
                  <span className="task-icon"><Icon size={17} /></span><strong>{label}</strong><b>{value}</b><ChevronRight size={16} />
                </Link>
              ))}
            </div> : <EmptyState title="Chế độ chỉ xem" description="Không có nghiệp vụ cần thao tác với vai trò hiện tại." />}
          </CardContent>
        </Card>

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

        <Card className="recent-card">
          <CardHeader><CardTitle>Hoạt động gần đây</CardTitle><Link href="/activities">Xem tất cả</Link></CardHeader>
          <CardContent>
            {scopedRecent.length ? <div className="recent-activity-list">
              {scopedRecent.map((row) => <div className="recent-activity-row" key={row.id}><span className="activity-icon"><Activity size={15} /></span><div><strong>{row.action}</strong><span>{row.description}</span></div><time>{formatDateTime(row.createdAt)}</time></div>)}
            </div> : <EmptyState description="Chưa có hoạt động được ghi nhận." />}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
