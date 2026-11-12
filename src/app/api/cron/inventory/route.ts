import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runMonthlyInventory } from "@/lib/inventory-schedule-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron hằng ngày của Vercel (xem vercel.json): ngày 1–15 mở đợt kiểm kê tháng cho nhóm có máy, sau ngày 15 tự đóng.
 * Vercel tự gửi `Authorization: Bearer $CRON_SECRET`; thiếu / sai thì từ chối.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runMonthlyInventory();
    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    revalidatePath("/activities");
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("cron inventory failed", error);
    return NextResponse.json({ ok: false, message: "Không chạy được kiểm kê định kỳ." }, { status: 500 });
  }
}
