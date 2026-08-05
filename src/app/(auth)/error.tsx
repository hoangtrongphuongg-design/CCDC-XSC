"use client";

import { Button } from "@/components/ui/button";

export default function AuthError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Không thể xử lý yêu cầu</h1>
        <p className="notice danger">{error.message || "Vui lòng thử lại."}</p>
        <Button type="button" onClick={reset} style={{ width: "100%" }}>Thử lại</Button>
      </section>
    </main>
  );
}
