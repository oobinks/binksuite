// Shapes returned by /api/strategy/* (mirrors src/worker/engine/strategy.ts).
import type { RoomId } from "../../../shared/registry";

export type FormatKey = "art" | "excel" | "pdf" | "unlinked";

export interface PeriodNumbers {
  from: string;
  to: string;
  days: number;
  sales: number;
  revenuePence: number;
  feesPence: number;
  costsPence: number;
  aiSpendPence: number;
  netPence: number;
  bestSellers: { productId: string | null; title: string; format: FormatKey; sales: number; revenuePence: number }[];
  byFormat: { format: FormatKey; sales: number; revenuePence: number; share: number }[];
  pipeline: { started: number; drafted: number; live: number; dropped: number };
}

export interface ShopNumbers {
  at: string;
  demoMode: boolean;
  week: PeriodNumbers;
  prevWeek: PeriodNumbers;
  month: PeriodNumbers;
  liveListings: number;
  expiringSoon: { productId: string; title: string; endsAt: string; daysLeft: number }[];
  weekly: { weekStart: string; week: string; netPence: number; revenuePence: number; sales: number }[];
}

export interface StrategyReport {
  id: string;
  week: string;
  at: string;
  headline: string;
  wentWell: string[];
  didnt: string[];
  nextSteps: { text: string; room: RoomId | null }[];
  redo: number;
  auto: boolean;
  numbers: ShopNumbers;
}

export interface ReportsResp {
  reports: StrategyReport[];
  pending: boolean;
  aiOn: boolean;
}

export const FORMAT_NAME: Record<FormatKey, string> = { excel: "Excel", pdf: "PDF", art: "Art", unlinked: "Not linked to a product" };
