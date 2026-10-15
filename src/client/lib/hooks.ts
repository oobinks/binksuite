import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useUi } from "./store";
import type { Snapshot } from "../../shared/api";
import type { Settings } from "../../shared/settings";

/** The HQ heartbeat: polls the state (which also nudges the task engine). */
export function useSnapshot() {
  const { lastNotification, lastHandoff, baselineSet } = useUi();
  const q = useQuery({
    queryKey: ["state"],
    queryFn: () => api.get<Snapshot>(`/state?n=${useUi.getState().lastNotification}&h=${useUi.getState().lastHandoff}`),
    refetchInterval: () => (document.visibilityState === "visible" ? 4000 : false),
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    const s = q.data;
    if (!s) return;
    const ui = useUi.getState();
    if (!ui.baselineSet) {
      // First load: don't replay old celebrations or parcels.
      const n = Math.max(0, ...s.notifications.map((x) => x.id));
      const h = Math.max(0, ...s.handoffs.map((x) => x.id));
      ui.setBaseline(n, h);
      return;
    }
    ui.seeNotifications(s.notifications);
    ui.seeHandoffs(s.handoffs);
  }, [q.data, lastNotification, lastHandoff, baselineSet]);
  return q;
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings> | Record<string, unknown>) => api.put<Settings>("/settings", patch),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

export function applyTheme(theme: Settings["theme"]) {
  try {
    localStorage.setItem("bs-theme", theme);
  } catch {
    /* private mode */
  }
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Fire-and-forget game events (room visits, calculator use). */
export function logEvent(type: "room_visit" | "fee_calc") {
  api.post("/events", { type }).catch(() => {});
}
