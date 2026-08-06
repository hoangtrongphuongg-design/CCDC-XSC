import type { Metadata } from "next";
import "./globals.css";
import "./ui-current.css";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Quản lý máy móc, công cụ dụng cụ Xưởng Sửa chữa",
  icons: { icon: "/brand/app-icon.png", apple: "/brand/app-icon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
