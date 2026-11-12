import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { requireUser } from "@/lib/auth/guards";
import { loadOperationalGroups } from "@/lib/equipment-data";
import { LABELS_PER_PAGE, MAX_LABELS, canPrintLabels, normalizeBaseUrl, paginateLabels, parseIds, parseStart, resolveBaseUrl } from "@/lib/labels";
import { loadLabelsByGroup, loadLabelsByIds, type LabelItem } from "@/lib/labels-data";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

function Label({ item }: { item: LabelItem }) {
  return (
    <div className="label-cell">
      {/* SVG do thư viện sinh từ địa chỉ do hệ thống dựng (chỉ gồm mã UUID của máy). */}
      <div className="label-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: item.qrSvg }} />
      <div className="label-text">
        <strong className="label-code">{item.code}</strong>
        {item.legacyCode ? <span className="label-legacy">Tem nhôm: {item.legacyCode}</span> : null}
        <span className="label-name">{item.name}</span>
        <small className="label-group">{item.groupName}</small>
      </div>
    </div>
  );
}

export default async function LabelsPage({ searchParams }: { searchParams: Params }) {
  const auth = await requireUser();
  // Chỉ Quản lý Xưởng / Admin in tem; người khác gõ thẳng đường dẫn thì như không có trang này.
  if (!canPrintLabels(auth)) notFound();
  const params = await searchParams;
  const requestHeaders = await headers();
  const resolved = resolveBaseUrl({
    configured: process.env.APP_BASE_URL,
    host: requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
    proto: requestHeaders.get("x-forwarded-proto"),
  });
  const baseUrl = normalizeBaseUrl(one(params.base), resolved.baseUrl);
  const start = parseStart(one(params.start));
  const ids = parseIds(one(params.ids));

  // Quản lý Xưởng / Admin chọn được mọi nhóm nghiệp vụ.
  const allowedGroups = await loadOperationalGroups();
  const groupId = allowedGroups.some((group) => group.id === one(params.group)) ? one(params.group) : "";

  const result = ids.length
    ? await loadLabelsByIds(ids, baseUrl)
    : groupId
      ? await loadLabelsByGroup(groupId, baseUrl)
      : null;
  const pages = result ? paginateLabels(result.items, start) : [];
  const groupName = allowedGroups.find((group) => group.id === groupId)?.name;

  return (
    <div className="labels-page-root">
      <div className="no-print">
        <PageHeader
          title="In tem QR dán máy"
          description={`Tem decal A4 lưới 3 cột × 8 hàng (${LABELS_PER_PAGE} tem/tờ, mỗi tem 70 × 37 mm). Quét mã bằng điện thoại sẽ mở hồ sơ máy.`}
          actions={result?.items.length ? <PrintButton label={`In ${result.items.length} tem`} /> : null}
        />

        {resolved.mismatch ? (
          <p className="notice warning">Bạn đang mở trang từ một địa chỉ khác địa chỉ chính thức. Mã QR vẫn dùng địa chỉ chính thức <b>{resolved.baseUrl}</b>, nên tem in ở đây giống hệt tem in từ bản chính thức.</p>
        ) : null}

        <Card>
          <CardContent>
            <form className="labels-controls" action="/labels" method="get">
              {ids.length ? (
                <>
                  <input type="hidden" name="ids" value={ids.join(",")} />
                  <p className="labels-ids-note">In tem cho <b>{ids.length}</b> máy đã chọn. <Link href="/labels">Chọn theo nhóm thay vì vậy</Link></p>
                </>
              ) : (
                <label>
                  <span>Nhóm quản lý</span>
                  <select name="group" defaultValue={groupId}>
                    <option value="">— Chọn nhóm —</option>
                    {allowedGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </label>
              )}
              <label>
                <span>Bắt đầu từ ô số</span>
                <input type="number" name="start" min={1} max={LABELS_PER_PAGE} defaultValue={start} />
              </label>
              <label className="labels-base">
                <span>Địa chỉ web trong mã QR</span>
                <input name="base" defaultValue={baseUrl} spellCheck={false} />
              </label>
              <button type="submit" className="btn btn-secondary">Xem tem</button>
            </form>
            <p className="muted labels-hint">
              Ô số: dùng khi tờ decal đã bóc một số tem (1 = ô trên cùng bên trái, đếm từng hàng sang phải).
              <b> Kiểm tra địa chỉ web</b> là tên miền chính thức của hệ thống trước khi in — mở trang này từ bản đang dùng thật, không phải bản xem thử.
              Khi in chọn khổ A4, tỉ lệ 100% (không “Fit to page”), lề “Không có”.
            </p>
          </CardContent>
        </Card>
      </div>

      {!result ? (
        <Card className="no-print"><CardContent><EmptyState title="Chọn nhóm để xem tem" description="Chọn nhóm quản lý, hoặc mở từ nút “In tem QR” ở hồ sơ một máy." /></CardContent></Card>
      ) : !result.items.length ? (
        <Card className="no-print"><CardContent><EmptyState title="Không có máy để in" description={groupName ? `Nhóm ${groupName} chưa có máy hoàn thành hồ sơ.` : "Không tìm thấy máy phù hợp."} /></CardContent></Card>
      ) : (
        <>
          {result.total > result.items.length ? (
            <p className="notice warning no-print">Nhóm có {result.total} máy; mỗi lần in tối đa {MAX_LABELS} tem ({MAX_LABELS / LABELS_PER_PAGE} tờ A4). Đang hiện {result.items.length} tem đầu theo mã hệ thống.</p>
          ) : null}
          <div className="labels-preview">
            {pages.map((cells, pageIndex) => (
              <section className="labels-page" key={pageIndex} aria-label={`Tờ ${pageIndex + 1}`}>
                {cells.map((item, cellIndex) => (item ? <Label key={item.id} item={item} /> : <div className="label-cell is-blank" key={`blank-${cellIndex}`} />))}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
