import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

export function AuthShowcase() {
  return (
    <aside className="auth-showcase" aria-label="Nhận diện hệ thống">
      <div className="auth-brand-stage">
        <Image
          src="/brand/company-symbol.png"
          alt="Biểu tượng Kỳ Lân Xanh"
          width={220}
          height={286}
          className="company-symbol"
          priority
        />
        <div className="auth-system-name">
          <strong>{APP_NAME}</strong>
          <span>Hệ thống quản lý dụng cụ xưởng</span>
        </div>
        <Image
          src="/brand/company-slogan.png"
          alt="Thương hiệu xi măng đầu tiên từ 1964"
          width={430}
          height={80}
          className="company-slogan"
          priority
        />
      </div>
      <div className="auth-trust-line"><ShieldCheck size={15} /> Hệ thống nội bộ · Dữ liệu được phân quyền theo nhóm</div>
    </aside>
  );
}
