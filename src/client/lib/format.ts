export { formatGBP } from "../../shared/fees";

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function pounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

export function toPence(input: string): number {
  const n = Number(String(input).replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
