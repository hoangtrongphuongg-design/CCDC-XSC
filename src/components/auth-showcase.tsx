import { Activity, Boxes, ShieldCheck, Workflow, Wrench } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

export function AuthShowcase() {
  const features = [
    [Boxes, "Một mã máy duy nhất", "Theo dõi xuyên suốt vòng đời CCDC"],
    [Workflow, "Quy trình rõ trách nhiệm", "Mượn, trả, sửa chữa và điều chuyển"],
    [Activity, "Lịch sử minh bạch", "Mọi thay đổi đều được ghi nhận"],
    [ShieldCheck, "Phân quyền theo nhóm", "Đúng người, đúng phạm vi thao tác"],
  ] as const;

  return (
    <aside className="auth-showcase" aria-label="Giới thiệu hệ thống">
      <div className="auth-showcase-brand">
        <div className="brand-mark"><Wrench size={23} /></div>
        <div><strong>{APP_NAME}</strong><span>Nền tảng vận hành CCDC Xưởng Sửa chữa</span></div>
      </div>

      <div className="auth-showcase-content">
        <div className="auth-showcase-kicker"><ShieldCheck size={14} /> QUẢN LÝ TẬP TRUNG · VẬN HÀNH MINH BẠCH</div>
        <h2>Kiểm soát công cụ dụng cụ toàn xưởng trên một hệ thống thống nhất.</h2>
        <p>Từ danh mục máy, mượn trả, điều chuyển đến sửa chữa và thanh lý — dữ liệu được cập nhật theo đúng vai trò, đúng nhóm và có lịch sử đầy đủ.</p>
        <div className="auth-features">
          {features.map(([Icon, title, description]) => (
            <div className="auth-feature" key={title}>
              <div className="auth-feature-icon"><Icon size={18} /></div>
              <div><strong>{title}</strong><span>{description}</span></div>
            </div>
          ))}
        </div>
      </div>

      <div className="auth-showcase-footer"><i /> Hệ thống nội bộ · Xưởng Sửa chữa</div>
    </aside>
  );
}
