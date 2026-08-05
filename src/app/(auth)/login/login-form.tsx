"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginAction, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { PasswordInput } from "@/components/password-input";

const initialState: LoginState = {};

export function LoginForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(loginAction, initialState);
  useEffect(() => { if (state.success) router.replace("/dashboard"); }, [state.success, router]);
  return (
    <form action={action} className="auth-form" noValidate>
      <FormField label="Tên đăng nhập" required><input name="username" autoComplete="username" placeholder="Ví dụ: phuong_xsc" /></FormField>
      <FormField label="Mật khẩu" required><PasswordInput name="password" autoComplete="current-password" placeholder="Nhập mật khẩu" /></FormField>
      {state.error ? <p className="form-message error" role="alert">{state.error}</p> : null}
      <Button type="submit" size="lg" disabled={pending}>{pending ? "Đang đăng nhập..." : "Đăng nhập"}</Button>
    </form>
  );
}
