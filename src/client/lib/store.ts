// Client-only UI state: what we've already celebrated, toasts, theme.
import { create } from "zustand";
import type { HandoffSnapshot, NotificationSnapshot } from "../../shared/api";
import { plain } from "./format";

export interface Toast {
  id: number;
  icon: string;
  title: string;
  body?: string | null;
  /** "bad" draws a warning mark; worked out from the icon when not given. */
  tone?: "good" | "bad";
}

interface UiState {
  lastNotification: number;
  lastHandoff: number;
  baselineSet: boolean;
  toasts: Toast[];
  parcels: HandoffSnapshot[];
  setBaseline(n: number, h: number): void;
  seeNotifications(list: NotificationSnapshot[]): void;
  seeHandoffs(list: HandoffSnapshot[]): void;
  toast(t: Omit<Toast, "id">): void;
  dismissToast(id: number): void;
  parcelArrived(id: number): void;
}

let toastId = 1;

export const useUi = create<UiState>((set, get) => ({
  lastNotification: 0,
  lastHandoff: 0,
  baselineSet: false,
  toasts: [],
  parcels: [],
  setBaseline: (n, h) => set({ lastNotification: n, lastHandoff: h, baselineSet: true }),
  seeNotifications: (list) => {
    if (!list.length) return;
    const fresh = list.filter((n) => n.id > get().lastNotification);
    if (!fresh.length) return;
    set((s) => ({ lastNotification: Math.max(s.lastNotification, ...fresh.map((n) => n.id)) }));
    // Levels and XP stay in the Activity page; only real events pop up.
    for (const n of fresh.filter((n) => n.kind !== "level")) {
      get().toast({ icon: "", title: n.title, body: n.body });
    }
  },
  seeHandoffs: (list) => {
    const fresh = list.filter((h) => h.id > get().lastHandoff);
    if (!fresh.length) return;
    set((s) => ({ lastHandoff: Math.max(s.lastHandoff, ...fresh.map((h) => h.id)), parcels: [...s.parcels, ...fresh].slice(-6) }));
  },
  toast: (t) => {
    const id = toastId++;
    const tone = t.tone ?? (/[⚠❌⛔]/u.test(t.icon) ? "bad" : "good");
    set((s) => ({ toasts: [...s.toasts, { ...t, title: plain(t.title), body: t.body ? plain(t.body) : t.body, tone, id }].slice(-4) }));
    setTimeout(() => get().dismissToast(id), 5000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  parcelArrived: (id) => set((s) => ({ parcels: s.parcels.filter((p) => p.id !== id) })),
}));
