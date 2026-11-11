/** Trả file .xlsx để trình duyệt tải về. Tên file chỉ gồm a-z0-9 và gạch ngang (xem slugify). */
export function xlsxResponse(buffer: Uint8Array | Buffer, fileName: string): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}

/** Chưa đăng nhập hoặc phiên không hợp lệ → về trang đăng nhập. */
export function redirectToLogin(request: Request): Response {
  return Response.redirect(new URL("/login", request.url), 302);
}
