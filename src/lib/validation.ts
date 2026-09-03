import { z } from "zod";
import { USERNAME_PATTERN } from "@/lib/constants";

export const loginSchema = z.object({
  employeeCode: z.string().trim().min(1, "Vui lòng nhập số danh bộ.").max(30),
  password: z.string().min(1, "Vui lòng nhập mật khẩu."),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  employeeCode: z.string().trim().min(1).max(30).transform((v) => v.toUpperCase()),
  requestedGroupId: z.string().uuid(),
  username: z.string().transform((v) => v.trim().toLowerCase()).refine((v) => USERNAME_PATTERN.test(v), "Tên đăng nhập không hợp lệ."),
  password: z.string().min(8).max(72),
  confirmPassword: z.string().min(8).max(72),
}).refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Mật khẩu nhập lại không khớp." });
