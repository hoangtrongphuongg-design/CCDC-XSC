import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { REMEMBER_SESSION_TTL_SECONDS, SESSION_TTL_SECONDS, sessionTtlSeconds } from "../src/lib/constants";

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("phiên thường 8 giờ, ghi nhớ thiết bị 30 ngày", () => {
  assert.equal(SESSION_TTL_SECONDS, 8 * 60 * 60);
  assert.equal(REMEMBER_SESSION_TTL_SECONDS, 30 * 24 * 60 * 60);
  assert.equal(sessionTtlSeconds(false), SESSION_TTL_SECONDS);
  assert.equal(sessionTtlSeconds(true), REMEMBER_SESSION_TTL_SECONDS);
});

test("ghi nhớ đăng nhập: ô chọn ở form, server đọc, JWT và cookie cùng hạn; vẫn kiểm sessionVersion", async () => {
  assert.match(await source("src/app/(auth)/login/login-form.tsx"), /name="remember"/);
  const action = await source("src/app/(auth)/login/actions.ts");
  assert.match(action, /formData\.get\("remember"\) === "on"/);
  assert.match(action, /setSessionCookie\(user\.id, [^)]*remember\)/);
  const session = await source("src/lib/auth/session.ts");
  assert.match(session, /createSessionToken\(userId, sessionVersion, ttl\)/, "JWT dùng cùng thời hạn với cookie");
  assert.match(session, /maxAge: ttl/);
  assert.match(session, /httpOnly: true/);
  assert.match(session, /sessionVersion/, "đổi quyền / mật khẩu vẫn vô hiệu phiên cũ");
});
