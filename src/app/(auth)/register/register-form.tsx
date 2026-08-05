"use client";

import { useActionState } from "react";
import { registerAction, type RegisterState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { PasswordInput } from "@/components/password-input";
import { GROUP_CATEGORY_LABELS, type GroupCategory } from "@/lib/group-structure";

type RegistrationGroup = {
  id: string;
  code: string;
  name: string;
  category: GroupCategory;
};

const registrationCategoryOrder: GroupCategory[] = ["mechanical", "electrical", "external"];

export function RegisterForm({ groups }: { groups: RegistrationGroup[] }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction, {});
  return (
    <form action={action} className="auth-form" noValidate>
      <div className="form-grid two">
        <FormField label="Họ và tên" required><input name="fullName" autoComplete="name" /></FormField>
        <FormField label="Mã nhân viên" required><input name="employeeCode" autoComplete="off" /></FormField>
      </div>
      <FormField label="Nhóm công tác" required hint="Danh sách được chia theo Bảo trì cơ, Bảo trì điện và Nhóm khác.">
        <select name="requestedGroupId" defaultValue="">
          <option value="" disabled>Chọn nhóm</option>
          {registrationCategoryOrder.map((category) => {
            const rows = groups.filter((group) => group.category === category);
            if (!rows.length) return null;
            return (
              <optgroup key={category} label={GROUP_CATEGORY_LABELS[category]}>
                {rows.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </optgroup>
            );
          })}
        </select>
      </FormField>
      <FormField label="Tên đăng nhập" required hint="4–30 ký tự; chữ thường, số, dấu chấm hoặc gạch dưới."><input name="username" autoComplete="username" /></FormField>
      <div className="form-grid two">
        <FormField label="Mật khẩu" required><PasswordInput name="password" autoComplete="new-password" /></FormField>
        <FormField label="Nhập lại mật khẩu" required><PasswordInput name="confirmPassword" autoComplete="new-password" /></FormField>
      </div>
      {state.error ? <p className="form-message error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="form-message success" role="status">{state.success}</p> : null}
      <Button type="submit" size="lg" disabled={pending}>{pending ? "Đang gửi..." : "Đăng ký tài khoản"}</Button>
    </form>
  );
}
