"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { loginAction, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { PasswordInput } from "@/components/password-input";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  return (
    <form action={action} className="auth-form" noValidate>
      <FormField label="Tên đăng nhập" required><input name="username" autoComplete="username" placeholder="Nhập tên đăng nhập" /></FormField>
      <FormField label="Mật khẩu" required><PasswordInput name="password" autoComplete="current-password" placeholder="Nhập mật khẩu" /></FormField>
      {state.error ? <p className="form-message error" role="alert">{state.error}</p> : null}
      <Button type="submit" size="lg" disabled={pending}><LogIn size={16} />{pending ? "Đang đăng nhập..." : "Đăng nhập"}</Button>
    </form>
  );
}
