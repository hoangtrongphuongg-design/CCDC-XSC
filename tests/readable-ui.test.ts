import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { CONDITION_LABELS, EQUIPMENT_STATUS_LABELS, WORKFLOW_LABELS } from "../src/lib/constants";
import { TONE_GLYPHS, conditionTone, equipmentStatusTone, workflowTone, type Tone } from "../src/lib/status-style";

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const TONES: Tone[] = ["neutral", "info", "success", "warning", "danger"];

test("sàn cỡ chữ: không còn khai báo font-size dưới 12px trong CSS của ứng dụng", async () => {
  for (const file of ["src/app/globals.css", "src/app/ui-current.css"]) {
    const css = await source(file);
    const small = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].filter((m) => Number(m[1]) < 12).map((m) => m[0]);
    assert.deepEqual(small, [], `${file} còn cỡ chữ nhỏ hơn 12px`);
  }
});

test("phông Be Vietnam Pro (subset tiếng Việt) được nạp và dùng làm phông chính; ui-v3.css đã bỏ", async () => {
  const layout = await source("src/app/layout.tsx");
  assert.match(layout, /Be_Vietnam_Pro/);
  assert.match(layout, /subsets:\s*\["vietnamese"/);
  assert.match(layout, /variable:\s*"--font-sans"/);
  assert.match(layout, /className=\{fontSans\.variable\}/);
  assert.match(await source("src/app/globals.css"), /font-family:\s*var\(--font-sans\)/);
  assert.match(await source("src/app/ui-current.css"), /font-family:\s*var\(--font-sans\)/);
  await assert.rejects(access(new URL("../src/app/ui-v3.css", import.meta.url)), "ui-v3.css không còn được dùng");
  assert.doesNotMatch(await source("src/app/layout.tsx"), /ui-v3/);
});

test("màn cảm ứng: nút và ô nhập cao ≥ 44px, ô nhập điện thoại 16px", async () => {
  const css = await source("src/app/ui-current.css");
  assert.match(css, /@media \(pointer: coarse\) \{[\s\S]*\.btn, \.btn-sm, \.btn-md \{ min-height: 44px; \}/);
  assert.match(css, /@media \(max-width: 760px\) \{\s*body \{ font-size: 16px; \}\s*input, select, textarea \{ font-size: 16px; \}/);
});

test("mọi trạng thái máy / tình trạng / phiếu đều có tông, đúng quy ước màu", () => {
  for (const status of Object.keys(EQUIPMENT_STATUS_LABELS)) assert.ok(TONES.includes(equipmentStatusTone(status)), status);
  for (const condition of Object.keys(CONDITION_LABELS)) assert.ok(TONES.includes(conditionTone(condition)), condition);
  for (const status of Object.keys(WORKFLOW_LABELS)) assert.ok(TONES.includes(workflowTone(status)), status);

  assert.equal(equipmentStatusTone("in_use_owner"), "success");
  assert.equal(equipmentStatusTone("on_loan"), "info");
  assert.equal(equipmentStatusTone("repairing"), "warning");
  assert.equal(equipmentStatusTone("wait_disposal"), "warning");
  assert.equal(equipmentStatusTone("disposal_warehouse"), "neutral");
  assert.equal(equipmentStatusTone("inactive"), "neutral");

  assert.equal(conditionTone("good"), "success");
  assert.equal(conditionTone("major_damage"), "danger");
  assert.equal(conditionTone("minor_damage"), "danger", "nhãn 'Hư hỏng' cùng một màu dù dữ liệu cũ");
  assert.equal(conditionTone("irreparable"), "danger");
  for (const unrated of ["awaiting_assessment", "limited", "unknown"]) assert.equal(conditionTone(unrated), "neutral", "'Chưa đánh giá' cùng một màu");

  assert.equal(workflowTone("completed"), "success");
  assert.equal(workflowTone("rejected"), "danger");
  assert.equal(workflowTone("incident"), "danger");
  assert.equal(workflowTone("cancelled"), "neutral");
  for (const waiting of ["pending_owner", "pending_ws", "pending_group", "wait_warehouse", "return_requested", "pending_acceptance"]) assert.equal(workflowTone(waiting), "warning", waiting);
  for (const running of ["approved", "on_loan", "borrowed", "repairing"]) assert.equal(workflowTone(running), "info", running);
});

test("huy hiệu có ký hiệu theo tông (không chỉ màu), khớp CSS", async () => {
  const css = await source("src/app/globals.css");
  assert.equal(new Set(Object.values(TONE_GLYPHS)).size, 5, "mỗi tông một ký hiệu khác nhau");
  for (const tone of TONES) {
    if (tone === "info") continue; // mặc định ●
    assert.ok(css.includes(`.status-badge[data-tone="${tone}"]::before { content: "${TONE_GLYPHS[tone]}"; }`), `CSS thiếu ký hiệu của ${tone}`);
  }
  assert.match(css, /\.status-badge::before \{ content: "●";/);
  assert.match(await source("src/components/ui/status-badge.tsx"), />\{label\}</, "luôn có chữ");
});

test("các trang dùng chung hệ tông trạng thái, không tự quyết màu riêng", async () => {
  const offenders: string[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!/\.tsx$/.test(entry.name)) continue;
      const text = await readFile(full, "utf8");
      if (/function tone\(status: string\)/.test(text)) offenders.push(`${full}: hàm tone() riêng`);
      if (/tone=\{row\.(status|condition) ===/.test(text)) offenders.push(`${full}: tông tự tính theo row.status`);
      if (/function (statusTone|conditionTone)\(/.test(text)) offenders.push(`${full}: statusTone/conditionTone riêng`);
    }
  }
  await walk(join(process.cwd(), "src"));
  assert.deepEqual(offenders, []);
  const workspace = await source("src/components/equipment/equipment-workspace.tsx");
  assert.match(workspace, /from "@\/lib\/status-style"/);
});
