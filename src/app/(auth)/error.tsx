"use client";

import { TriangleAlert, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShowcase } from "@/components/auth-showcase";

export default function AuthError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="auth-page">
      <AuthShowcase />
      <section className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-form-logo"><Wrench size={22} /></div>
            <h1>Không thể xử lý yêu cầu</h1>
            <p>Hệ thống gặp lỗi khi thực hiện thao tác đăng nhập.</p>
          </div>
          <p className="notice danger"><TriangleAlert size={14} /> {error.message || "Vui lòng thử lại."}</p>
          <Button type="button" onClick={reset} className="auth-full-button">Thử lại</Button>
        </div>
      </section>
    </main>
  );
}
