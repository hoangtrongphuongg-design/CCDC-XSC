import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PAGE_SIZE, pageWindow, paginate } from "../src/lib/pagination";

test("phân trang 50 dòng: trang, khoảng hiển thị, trang cuối", () => {
  assert.equal(DEFAULT_PAGE_SIZE, 50);
  assert.deepEqual(paginate(1240, "1"), { page: 1, pageCount: 25, size: 50, total: 1240, from: 1, to: 50, offset: 0 });
  assert.deepEqual(paginate(1240, "25"), { page: 25, pageCount: 25, size: 50, total: 1240, from: 1201, to: 1240, offset: 1200 });
  assert.equal(paginate(1240, "999").page, 25, "quá số trang về trang cuối");
  assert.equal(paginate(1240, "0").page, 1);
  assert.equal(paginate(1240, "-3").page, 1);
  assert.equal(paginate(1240, "abc").page, 1);
  assert.equal(paginate(1240, undefined).page, 1);
  assert.equal(paginate(1240, ["3", "9"]).page, 3);
  assert.deepEqual(paginate(0, "1"), { page: 1, pageCount: 1, size: 50, total: 0, from: 0, to: 0, offset: 0 });
  assert.equal(paginate(50, "1").pageCount, 1);
  assert.equal(paginate(51, "1").pageCount, 2);
});

test("dãy số trang gọn: đầu, cuối, trang hiện tại ± 1, chỗ ngắt là null", () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(1, 3), [1, 2, 3]);
  assert.deepEqual(pageWindow(1, 25), [1, 2, null, 25]);
  assert.deepEqual(pageWindow(12, 25), [1, null, 11, 12, 13, null, 25]);
  assert.deepEqual(pageWindow(25, 25), [1, null, 24, 25]);
  assert.deepEqual(pageWindow(2, 5), [1, 2, 3, null, 5]);
});
