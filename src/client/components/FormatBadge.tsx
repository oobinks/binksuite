// 🎨 ART / 📊 EXCEL / 📄 PDF: what kind of product this is, at a glance.
import { FORMAT_INFO, type ProductFormat } from "../../shared/format";

export function FormatBadge({ format, className = "" }: { format: ProductFormat | null | undefined; className?: string }) {
  if (!format) return null;
  const f = FORMAT_INFO[format];
  return (
    <span className={`chip shrink-0 !px-1.5 !py-0 text-[10px] font-black tracking-wide ${f.chip} ${className}`} title={f.long}>
      {f.icon} {f.label}
    </span>
  );
}
