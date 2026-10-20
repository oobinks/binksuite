// How rooms are named and drawn in the app chrome (the registry keeps the full names).
import type { RoomId } from "../../shared/registry";
import type { IconName } from "../components/Icon";

export const ROOM_ICON: Record<RoomId, IconName> = {
  research: "research",
  studio: "studio",
  mockups: "mockups",
  listing: "listing",
  compliance: "compliance",
  launch: "launch",
  orders: "orders",
  finance: "finance",
  care: "care",
  marketing: "marketing",
  strategy: "strategy",
};

export const ROOM_LABEL: Record<RoomId, string> = {
  research: "Research",
  studio: "Product Studio",
  mockups: "Mockups",
  listing: "Listings",
  compliance: "Compliance",
  launch: "Launch",
  orders: "Orders",
  finance: "Finance",
  care: "Customer Care",
  marketing: "Marketing",
  strategy: "Strategy",
};

/** The product pipeline, in order. */
export const PIPELINE: RoomId[] = ["research", "studio", "mockups", "listing", "compliance", "launch"];
export const BUSINESS: RoomId[] = ["orders", "finance"];
export const LATER: RoomId[] = ["care", "marketing", "strategy"];

/** Each area's colour: a tinted tile, a coloured icon and a solid hex for bars. */
export interface Tone {
  tile: string;
  icon: string;
  hex: string;
}

export const ROOM_TONE: Record<RoomId, Tone> = {
  research: { tile: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300", icon: "text-sky-500 dark:text-sky-400", hex: "#0ea5e9" },
  studio: { tile: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300", icon: "text-violet-500 dark:text-violet-400", hex: "#8b5cf6" },
  mockups: { tile: "bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300", icon: "text-pink-500 dark:text-pink-400", hex: "#ec4899" },
  listing: { tile: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300", icon: "text-amber-500 dark:text-amber-400", hex: "#f59e0b" },
  compliance: { tile: "bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300", icon: "text-teal-500 dark:text-teal-400", hex: "#14b8a6" },
  launch: { tile: "bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300", icon: "text-orange-500 dark:text-orange-400", hex: "#f97316" },
  orders: { tile: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300", icon: "text-rose-500 dark:text-rose-400", hex: "#f43f5e" },
  finance: { tile: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300", icon: "text-emerald-500 dark:text-emerald-400", hex: "#10b981" },
  care: { tile: "bg-zinc-50 text-zinc-400 dark:bg-white/[0.03] dark:text-zinc-500", icon: "", hex: "#a1a1aa" },
  marketing: { tile: "bg-zinc-50 text-zinc-400 dark:bg-white/[0.03] dark:text-zinc-500", icon: "", hex: "#a1a1aa" },
  strategy: { tile: "bg-zinc-50 text-zinc-400 dark:bg-white/[0.03] dark:text-zinc-500", icon: "", hex: "#a1a1aa" },
};
