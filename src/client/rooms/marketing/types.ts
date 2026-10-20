// Shapes returned by /api/marketing.
import type { ProductFormat } from "../../../shared/format";

export interface PinCopy {
  titles: string[];
  description: string;
  boards: string[];
  at: string;
  real: boolean;
  rev: number;
}

export interface PromoProduct {
  id: string;
  title: string;
  stage: string;
  format: ProductFormat;
  pricePence: number | null;
  listing: { title: string; tags: string[]; description: string };
  images: string[];
  accent: string | null;
  live: boolean;
  url: string | null;
  pins: { copy: PinCopy | null; pinnedAt: string | null; pendingRev?: number | null };
}

export interface CalendarDay {
  date: string;
  channel: "Pinterest" | "Instagram" | "TikTok";
  productId: string | null;
  productTitle: string | null;
  idea: string;
  caption: string;
  done: boolean;
}

export interface Calendar {
  weekStart: string;
  at: string;
  real: boolean;
  rev: number;
  days: CalendarDay[];
  pendingRev?: number | null;
}

export interface MarketingResp {
  aiReady: boolean;
  products: PromoProduct[];
  calendar: Calendar | null;
}

export const PENDING_TOAST = { icon: "", title: "Added to Claude's to-do list", body: "Results appear when Claude's session finishes." };
