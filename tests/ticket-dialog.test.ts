import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LOAN_VIEW_KEYS, countLoanViews, loanDaysLate, matchesLoanView, parseLoanView } from "../src/lib/loan-views";
import { TICKET_GENERIC_ERROR, ticketErrorMessage } from "../src/lib/ticket-state";
import { OPEN_MACHINE_LOAN_STATUSES } from "../src/lib/loan-status";
import { OPEN_QUICK_LOAN_STATUSES } from "../src/lib/workflow-status";

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const TODAY = "2026-11-13";

test("thanh lọc nhanh Mượn – Trả: mỗi trạng thái đang mở rơi vào đúng thẻ", () => {
  const row = (status: string, dueDate: string | null = "2026-11-20") => ({ status, dueDate });
  assert.equal(matchesLoanView(row("pending_owner"), "pending", TODAY), true);
  assert.equal(matchesLoanView(row("pending_approval"), "pending", TODAY), true);
  assert.equal(matchesLoanView(row("on_loan"), "active", TODAY), true);
  assert.equal(matchesLoanView(row("borrowed"), "active", TODAY), true);
  assert.equal(matchesLoanView(row("return_requested"), "return", TODAY), true);
  assert.equal(matchesLoanView(row("return_reported"), "return", TODAY), true);
  assert.equal(matchesLoanView(row("on_loan"), "pending", TODAY), false);
  // mọi phiếu đang mở (mượn máy + mượn nhanh) phải thuộc ít nhất một thẻ cụ thể: không có phiếu "mồ côi"
  for (const status of [...OPEN_MACHINE_LOAN_STATUSES, ...OPEN_QUICK_LOAN_STATUSES]) {
    const hit = LOAN_VIEW_KEYS.filter((key) => key !== "all" && key !== "overdue" && matchesLoanView(row(status), key, TODAY));
    assert.ok(hit.length >= 1, `${status} không thuộc thẻ nào`);
  }
});

test("trễ hạn chỉ tính phiếu đang được giữ, theo ngày (không phải giờ)", () => {
  assert.equal(loanDaysLate({ status: "on_loan", dueDate: "2026-11-10" }, TODAY), 3);
  assert.equal(loanDaysLate({ status: "borrowed", dueDate: "2026-11-12" }, TODAY), 1);
  assert.equal(loanDaysLate({ status: "on_loan", dueDate: TODAY }, TODAY), 0, "hạn hôm nay chưa trễ");
  assert.equal(loanDaysLate({ status: "on_loan", dueDate: null }, TODAY), 0);
  assert.equal(loanDaysLate({ status: "pending_owner", dueDate: "2026-11-01" }, TODAY), 0, "chưa giao máy thì chưa trễ");
  assert.equal(loanDaysLate({ status: "return_requested", dueDate: "2026-11-01" }, TODAY), 0, "đã báo trả thì không còn trễ");
});

test("đếm theo thẻ + đọc ?view= (giá trị lạ về 'all')", () => {
  const counts = countLoanViews([
    { status: "pending_owner", dueDate: "2026-12-01" },
    { status: "on_loan", dueDate: "2026-11-01" },
    { status: "on_loan", dueDate: "2026-12-01" },
    { status: "return_requested", dueDate: "2026-11-01" },
  ], TODAY);
  assert.deepEqual(counts, { all: 4, pending: 1, active: 2, return: 1, overdue: 1 });
  assert.equal(parseLoanView("overdue"), "overdue");
  assert.equal(parseLoanView(["return", "x"]), "return");
  assert.equal(parseLoanView("<script>"), "all");
  assert.equal(parseLoanView(undefined), "all");
});

test("lỗi tạo phiếu: giữ thông báo tiếng Việt, che lỗi cơ sở dữ liệu, ném tiếp lỗi điều hướng", () => {
  assert.equal(ticketErrorMessage(new Error("Vui lòng nhập đủ thông tin mượn máy.")), "Vui lòng nhập đủ thông tin mượn máy.");
  assert.equal(ticketErrorMessage(Object.assign(new Error("duplicate key"), { code: "23505" })), TICKET_GENERIC_ERROR);
  assert.equal(ticketErrorMessage(new Error("Failed query: insert into ...")), TICKET_GENERIC_ERROR);
  assert.equal(ticketErrorMessage("chuỗi lạ"), TICKET_GENERIC_ERROR);
  const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
  assert.throws(() => ticketErrorMessage(redirect), redirect);
});

const PAGES: Array<{ path: string; button: string }> = [
  { path: "src/app/(app)/machine-loans/page.tsx", button: "Tạo phiếu mượn - trả" },
  { path: "src/app/(app)/quick-loans/page.tsx", button: "Tạo phiếu mượn nhanh" },
  { path: "src/app/(app)/transfers/page.tsx", button: "Tạo điều chuyển" },
  { path: "src/app/(app)/repairs/page.tsx", button: "Tạo phiếu sửa chữa" },
  { path: "src/app/(app)/disposals/page.tsx", button: "Tạo phiếu thanh lý" },
];

test("mỗi trang nghiệp vụ: nút đỏ 'Tạo phiếu …' mở cửa sổ, hai bảng riêng, không còn khung bên phải", async () => {
  for (const { path, button } of PAGES) {
    const page = await source(path);
    assert.match(page, new RegExp(`buttonLabel="${button}"`), `${path}: thiếu nút "${button}"`);
    assert.match(page, /<TicketDialog/, path);
    assert.doesNotMatch(page, /side-panel|content-grid/, `${path}: còn khung tạo phiếu bên phải`);
    assert.match(page, /<TicketTableCard[^>]*title="[^"]*[Cc]hờ xử lý"/, `${path}: thiếu bảng Chờ xử lý`);
    assert.match(page, /<TicketTableCard[^>]*title="[^"]*[Đđ]ã hoàn thành"/, `${path}: thiếu bảng Đã hoàn thành`);
    assert.match(page, /has-ticket-fab/, `${path}: thiếu khoảng đệm cho nút nổi`);
  }
  assert.match(await source("src/app/(app)/disposals/page.tsx"), /buttonLabel="Tạo thanh lý CCDC số lượng"/);
});

test("bảng Đã hoàn thành không có cột Thao tác; bảng Chờ xử lý có", async () => {
  for (const { path } of PAGES) {
    const page = await source(path);
    const blocks = page.split("<TicketTableCard").slice(1);
    for (const block of blocks) {
      const done = /tone="done"/.test(block.slice(0, 200));
      const headers = block.match(/headers=\{\[([^\]]*)\]\}/)?.[1] ?? "";
      assert.equal(headers.includes('"Thao tác"'), !done, `${path}: ${done ? "bảng đã hoàn thành" : "bảng chờ xử lý"} sai cột Thao tác`);
    }
  }
});

test("nút gửi trong cửa sổ giữ màu xanh (Button primary), chỉ nút nổi ngoài trang màu đỏ; lỗi trả về dạng dữ liệu", async () => {
  const dialog = await source("src/components/ticket-dialog.tsx");
  assert.match(dialog, /<Button type="submit" disabled=\{pending \|\| submitDisabled\}>/);
  assert.doesNotMatch(dialog, /variant="danger"/);
  assert.match(dialog, /className="ticket-fab"/);
  assert.match(dialog, /event\.preventDefault\(\)/, "không dùng form action để khỏi bị xóa ô khi lỗi");
  const css = await source("src/app/ui-current.css");
  assert.match(css, /\.ticket-fab\s*\{[^}]*position: fixed;[^}]*background: #d92d20;/);
  const wrappers = await source("src/actions/ticket-forms.ts");
  assert.match(wrappers, /status: "error", message: ticketErrorMessage\(error\)/);
  for (const name of ["submitMachineLoan", "submitQuickLoan", "submitTransfer", "submitRepair", "submitDisposal", "submitToolDisposal"]) {
    assert.match(wrappers, new RegExp(`export async function ${name}\\(`), name);
  }
  for (const { path } of PAGES) assert.match(await source(path), /@\/actions\/ticket-forms/, path);
});

test("thống kê thu gọn ở các trang Điều chuyển / Sửa chữa / Thanh lý; hành động tạo phiếu báo 'Đã tạo phiếu thành công'", async () => {
  for (const path of ["src/app/(app)/transfers/page.tsx", "src/app/(app)/repairs/page.tsx", "src/app/(app)/disposals/page.tsx"]) {
    assert.match(await source(path), /<section className="stat-grid compact">/, path);
  }
  for (const [path, cls] of [["equipment", "compact"], ["reports", "compact with-notes"], ["groups", "compact with-notes"]]) {
    assert.match(await source(`src/app/(app)/${path}/page.tsx`), new RegExp(`className="stat-grid ${cls}"`), path);
  }
  for (const path of ["machine-loans", "quick-loans", "transfers", "repairs", "disposals"]) {
    assert.match(await source(`src/actions/${path}.ts`), /setFlashMessage\("success", "Đã tạo phiếu thành công"/, path);
  }
});

test("trang Thanh lý: nút đỏ luôn hiện theo quyền tạo phiếu (không ẩn khi chưa có máy đủ điều kiện); cửa sổ giải thích và khóa nút gửi", async () => {
  const page = await source("src/app/(app)/disposals/page.tsx");
  assert.doesNotMatch(page, /disposableEquipment\.length > 0 &&|disposableTools\.length > 0 &&/, "nút không phụ thuộc số máy đủ điều kiện");
  assert.match(page, /const canCreate = !auth\.isReadOnlyViewer && \(auth\.isWorkshopAdmin \|\|/);
  assert.match(page, /submitDisabled=\{disposableEquipment\.length === 0\}/);
  assert.match(page, /submitDisabled=\{disposableTools\.length === 0\}/);
  assert.match(await source("src/components/ticket-dialog.tsx"), /disabled=\{pending \|\| submitDisabled\}/);
});
