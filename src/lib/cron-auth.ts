import { timingSafeEqual } from "node:crypto";

/**
 * Kiểm tra lời gọi cron của Vercel: header `Authorization: Bearer <CRON_SECRET>`.
 * Thiếu `CRON_SECRET` trong môi trường thì TỪ CHỐI mọi lời gọi (không bao giờ để mở).
 */
export function isAuthorizedCron(authorizationHeader: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || secret.length < 8) return false;
  if (!authorizationHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorizationHeader);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
