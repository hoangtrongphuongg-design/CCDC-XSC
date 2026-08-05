"use client";

import { useActionState } from "react";
import { registerAction, type RegisterState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";

export function RegisterForm({ groups }: { groups: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction, {});
  return (
    <form action={action} className="auth-form" noValidate>
      <div className="form-grid two">
        <FormField label="Họ và tên" required><input name="fullName" autoComplete="name" /></FormField>
        <FormField label="Mã nhân viên" required><input name="employeeCode" autoComplete="off" /></FormField>
      </div>
      <FormField label="Nhóm công tác" required><select name="requestedGroupId" defaultValue=""><option value="" disabled>Chọn nhóm</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></FormField>
      <FormField label="Tên đăng nhập" required hint="4–30 ký tự; chữ thường, số, dấu chấm hoặc gạch dưới."><input name="username" autoComplete="username" /></FormField>
      <div className="form-grid two">
        <FormField label="Mật khẩu" required><input name="password" type="password" autoComplete="new-password" /></FormField>
        <FormField label="Nhập lại mật khẩu" required><input name="confirmPassword" type="password" autoComplete="new-password" /></FormField>
      </div>
      {state.error ? <p className="form-message error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="form-message success" role="status">{state.success}</p> : null}
      <Button type="submit" size="lg" disabled={pending}>{pending ? "Đang gửi..." : "Đăng ký tài khoản"}</Button>
    </form>
  );
}
