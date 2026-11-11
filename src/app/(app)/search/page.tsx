import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { requireUser } from "@/lib/auth/guards";
import { MIN_QUERY_LENGTH, cleanQuery } from "@/lib/global-search";
import { MACHINE_LIMIT, TOOL_LIMIT, globalSearch } from "@/lib/global-search-data";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const auth = await requireUser();
  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = cleanQuery(raw);
  const result = await globalSearch(auth, query);
  const { machines, tools, tickets } = result;
  const anything = machines.total + tools.total + tickets.length > 0;
  const equipmentLink = (text: string) => `/equipment?q=${encodeURIComponent(text)}`;

  return (
    <div className="search-page">
      <PageHeader title="Tìm kiếm" description="Tìm máy theo mã hệ thống, tem nhôm, serial, tên, loại, nhóm, vị trí — hoặc tìm phiếu theo mã (PM-, CM-, DC-, SC-, TL-)." />

      <form className="search-page-form" action="/search" method="get" role="search">
        <Search size={18} aria-hidden="true" />
        <input name="q" defaultValue={query} placeholder="Ví dụ: CBL-0001, máy hàn, SN12345, PM-2026-0007…" aria-label="Từ khóa tìm kiếm" autoFocus={!query} autoComplete="off" />
        <button type="submit" className="btn btn-primary">Tìm</button>
      </form>

      {!query ? (
        <Card><CardContent><EmptyState title="Gõ từ khóa để tìm" description="Không cần gõ dấu và không phân biệt hoa/thường. Gõ nhiều từ để thu hẹp, ví dụ “han jasic”." /></CardContent></Card>
      ) : result.tooShort ? (
        <Card><CardContent><EmptyState title="Từ khóa quá ngắn" description={`Hãy gõ ít nhất ${MIN_QUERY_LENGTH} ký tự.`} /></CardContent></Card>
      ) : !anything ? (
        <Card><CardContent><EmptyState title={`Không thấy kết quả cho “${query}”`} description="Thử bớt từ, gõ một phần mã, hoặc kiểm tra lại chính tả." /></CardContent></Card>
      ) : (
        <>
          <p className="muted search-summary">
            Tìm “{query}”: <b>{machines.total}</b> máy · <b>{tools.total}</b> CCDC theo số lượng · <b>{tickets.length}</b> phiếu
          </p>

          {machines.total ? (
            <Card>
              <CardHeader><CardTitle>Máy ({machines.total})</CardTitle></CardHeader>
              <CardContent>
                <div className="report-table">
                  <DataTable
                    headers={["Mã hệ thống", "Tem nhôm", "Tên CCDC", "Loại", "Nhóm quản lý", "Trạng thái", "Vị trí"]}
                    rows={machines.rows.map((m) => [
                      <Link key="code" href={equipmentLink(m.code)}><b>{m.code}</b></Link>,
                      m.legacyCode || "—",
                      <span key="name">{m.name}{m.serial ? <small className="search-serial"> · Serial {m.serial}</small> : null}</span>,
                      m.type,
                      m.ownerGroup,
                      <span key="status">{m.statusLabel} · {m.conditionLabel}{m.heldBy ? <small className="search-serial"> · đang ở {m.heldBy}</small> : null}</span>,
                      m.location || "—",
                    ])}
                  />
                </div>
                {machines.total > machines.rows.length ? (
                  <p className="muted search-more">Hiện {MACHINE_LIMIT} máy khớp nhất. <Link href={equipmentLink(query)}>Xem danh sách đầy đủ ở Dụng cụ toàn xưởng</Link> hoặc gõ thêm từ để thu hẹp.</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {tools.total ? (
            <Card>
              <CardHeader><CardTitle>CCDC theo số lượng ({tools.total})</CardTitle></CardHeader>
              <CardContent>
                <div className="report-table">
                  <DataTable
                    headers={["Mã", "Tên CCDC", "Loại", "Nhóm", "Số lượng"]}
                    rows={tools.rows.map((t) => [
                      <Link key="code" href={equipmentLink(t.code || t.name)}>{t.code || "—"}</Link>,
                      t.name, t.type, t.group, `${t.quantity} ${t.unit}`,
                    ])}
                  />
                </div>
                {tools.total > tools.rows.length ? <p className="muted search-more">Hiện {TOOL_LIMIT} mục khớp nhất.</p> : null}
              </CardContent>
            </Card>
          ) : null}

          {tickets.length ? (
            <Card>
              <CardHeader><CardTitle>Phiếu ({tickets.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="report-table">
                  <DataTable
                    headers={["Loại", "Mã phiếu", "Máy / CCDC", "Trạng thái", "Nhóm"]}
                    rows={tickets.map((t) => [t.kind, <Link key="code" href={t.href}><b>{t.code}</b></Link>, t.label, t.statusLabel, t.groups])}
                  />
                </div>
                <p className="muted search-more">Chỉ hiện phiếu liên quan đến nhóm của bạn{auth.isAdmin || auth.isWsManager || auth.isReadOnlyViewer ? " (vai trò toàn Xưởng thấy tất cả)" : ""}. Bấm mã phiếu để mở trang nghiệp vụ.</p>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
