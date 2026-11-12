import { splitTokens } from "@/lib/table-columns";

/** Chữ trong bảng: mã / model có gạch nối ("ZX7-315") giữ liền một khối, chỉ xuống dòng ở dấu cách giữa các từ. */
export function SafeText({ children }: { children: string }) {
  return (
    <>
      {splitTokens(children).map((part, index) => (part.nowrap ? <span className="nobreak" key={index}>{part.text}</span> : part.text))}
    </>
  );
}
