import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("StatusBadge bắt buộc hiển thị label, không chỉ dựa vào màu", async () => {
  const source = await readFile(new URL("../src/components/ui/status-badge.tsx", import.meta.url), "utf8");
  assert.match(source, /label:\s*string/);
  assert.match(source, />\{label\}</);
});

test("CSS mobile chuyển bảng thành thẻ và không cuộn ngang toàn trang", async () => {
  const source = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(source, /overflow-x:\s*hidden/);
  assert.match(source, /\.table-wrap td::before/);
  assert.match(source, /content:\s*attr\(data-label\)/);
});
