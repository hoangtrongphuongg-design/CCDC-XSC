import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import "./ui-current.css";
import { APP_NAME } from "@/lib/constants";

/** Phông thiết kế cho tiếng Việt: dấu thanh rõ, dễ đọc ở cỡ nhỏ trên điện thoại. */
const fontSans = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Quản lý máy móc, công cụ dụng cụ Xưởng Sửa chữa",
  icons: { icon: "/brand/app-icon.png", apple: "/brand/app-icon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi" className={fontSans.variable}><body>{children}</body></html>;
}
