// Client-only UI state: what we've already celebrated, toasts, theme.
import { create } from "zustand";
import type { HandoffSnapshot, NotificationSnapshot } from "../../shared/api";

export interface Toast {
  id: number;
  icon: string;
  title: string;
  body?: string | null;
}

interface UiState {
  lastNotification: number;
  lastHandoff: number;
  baselineSet: boolean;
  toasts: Toast[];
  parcels: HandoffSnapshot[];
  levelUp: NotificationSnapshot | null;
  setBaseline(n: number, h: number): void;
  seeNotifications(list: NotificationSnapshot[]): void;
  seeHandoffs(list: HandoffSnapshot[]): void;
  toast(t: Omit<Toast, "id">): void;
  dismissToast(id: number): void;
  parcelArrived(id: number): void;
  closeLevelUp(): void;
}

let toastId = 1;

export const useUi = create<UiState>((set, get) => ({
  lastNotification: 0,
  lastHandoff: 0,
  baselineSet: false,
  toasts: [],
  parcels: [],
  levelUp: null,
  setBaseline: (n, h) => set({ lastNotification: n, lastHandoff: h, baselineSet: true }),
  seeNotifications: (list) => {
    if (!list.length) return;
    const fresh = list.filter((n) => n.id > get().lastNotification);
    if (!fresh.length) return;
    const level = fresh.filter((n) => n.kind === "level").pop() ?? null;
    set((s) => ({
      lastNotification: Math.max(s.lastNotification, ...fresh.map((n) => n.id)),
      levelUp: level ?? s.levelUp,
    }));
    for (const n of fresh.filter((n) => n.kind !== "level")) {
      get().toast({ icon: iconFor(n.kind), title: n.title, body: n.body });
    }
    celebrate(fresh.some((n) => n.kind === "level" || n.kind === "launch") ? "big" : "small");
  },
  seeHandoffs: (list) => {
    const fresh = list.filter((h) => h.id > get().lastHandoff);
    if (!fresh.length) return;
    set((s) => ({ lastHandoff: Math.max(s.lastHandoff, ...fresh.map((h) => h.id)), parcels: [...s.parcels, ...fresh].slice(-6) }));
  },
  toast: (t) => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }].slice(-4) }));
    setTimeout(() => get().dismissToast(id), 5000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  parcelArrived: (id) => set((s) => ({ parcels: s.parcels.filter((p) => p.id !== id) })),
  closeLevelUp: () => set({ levelUp: null }),
}));

function iconFor(kind: string) {
  return kind === "sale" ? "💰" : kind === "achievement" ? "🏅" : kind === "launch" ? "🚀" : kind === "quest" ? "📜" : "✨";
}

export async function celebrate(size: "small" | "big" = "small") {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const confetti = (await import("canvas-confetti")).default;
  const colors = ["#f2b35b", "#e0607e", "#5bbf9a", "#7c9cf5", "#b48cf2"];
  if (size === "big") {
    confetti({ particleCount: 140, spread: 100, origin: { y: 0.6 }, colors });
    setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0 }, colors }), 250);
    setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1 }, colors }), 400);
  } else {
    confetti({ particleCount: 60, spread: 70, origin: { y: 0.75 }, colors, scalar: 0.9 });
  }
}
