"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="empty-state" role="alert">
      <AlertTriangle size={36} aria-hidden="true" />
      <strong>Không thể hoàn tất thao tác</strong>
      <p>{error.message || "Đã xảy ra lỗi phía máy chủ. Vui lòng thử lại."}</p>
      <Button type="button" onClick={reset}>Thử lại</Button>
    </div>
  );
}
