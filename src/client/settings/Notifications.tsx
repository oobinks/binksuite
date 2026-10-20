// Phone notifications: turn them on for this device, choose what pings you, send a test.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useUi } from "../lib/store";
import { currentSubscription, deviceLabel, isIos, pushSupport, subscribe } from "../lib/push";
import { ErrorNote, Section, Toggle } from "../components/ui";
import { Icon } from "../components/Icon";

interface PushState {
  ready: boolean;
  publicKey: string | null;
  kinds: { kind: string; label: string; hint: string }[];
  prefs: Record<string, boolean>;
  devices: { id: string; label: string; endpoint: string; createdAt: string }[];
}

export function Notifications() {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const { data } = useQuery({ queryKey: ["push"], queryFn: () => api.get<PushState>("/push") });
  const [here, setHere] = useState<string | null>(null);
  const support = pushSupport();

  useEffect(() => {
    currentSubscription().then((s) => setHere(s?.endpoint ?? null));
    if (location.hash === "#notifications") document.getElementById("notifications")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const refresh = () => qc.invalidateQueries({ queryKey: ["push"] });
  const turnOn = useMutation({
    mutationFn: async () => {
      if (!data?.publicKey) throw new Error("Notifications aren't ready on the server yet.");
      const sub = await subscribe(data.publicKey);
      await api.post("/push/devices", { endpoint: sub.endpoint, keys: sub.keys, label: deviceLabel() });
      setHere(sub.endpoint ?? null);
      return api.post<{ results: { ok: boolean }[] }>("/push/test");
    },
    onSuccess: () => (toast({ icon: "", title: "Notifications are on", body: "We've sent a test to check it works." }), refresh()),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const d = data?.devices.find((x) => x.id === id);
      if (d && d.endpoint === here) {
        await (await currentSubscription())?.unsubscribe();
        setHere(null);
      }
      return api.del(`/push/devices/${id}`);
    },
    onSuccess: refresh,
  });
  const test = useMutation({
    mutationFn: () => api.post<{ results: { label: string; ok: boolean }[] }>("/push/test"),
    onSuccess: (r) => toast({ icon: r.results.every((x) => x.ok) ? "" : "⚠️", title: r.results.length ? `Test sent to ${r.results.filter((x) => x.ok).length} of ${r.results.length} device${r.results.length === 1 ? "" : "s"}` : "No devices are turned on yet" }),
  });
  const prefs = useMutation({ mutationFn: (p: Record<string, boolean>) => api.put("/push/prefs", p), onSuccess: refresh });

  const onHere = !!here && !!data?.devices.some((d) => d.endpoint === here);

  return (
    <Section title="Phone notifications" id="notifications" right={<span className="chip">{data?.devices.length ? `${data.devices.length} device${data.devices.length === 1 ? "" : "s"}` : "Off"}</span>}>
      <div id="notifications" className="space-y-4 text-sm">
        <p className="text-zinc-600 dark:text-zinc-400">Get a ping on your phone when something needs you, even when BinkSuite is closed.</p>

        {data && !data.ready && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">Set the VAULT_MASTER_KEY secret first (see the Key vault card).</p>}

        {support === "ios-needs-home-screen" ? (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-indigo-950 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">
            <p className="mb-2 font-semibold">On iPhone, add BinkSuite to your home screen first:</p>
            <ol className="space-y-1.5">
              {[
                "Open BinkSuite in Safari.",
                "Tap the Share button (the square with an arrow pointing up) at the bottom of the screen.",
                "Scroll down and tap “Add to Home Screen”, then “Add”.",
                "Close Safari and open BinkSuite from the new icon on your home screen.",
                "Come back to Settings → Phone notifications and tap “Turn on notifications”.",
              ].map((s, i) => (
                <li key={s} className="flex gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-indigo-600 text-[11px] font-semibold text-white">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : support === "unsupported" ? (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">This browser can't show notifications. On a phone, use Safari (iPhone) or Chrome (Android).</p>
        ) : onHere ? (
          <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <Icon name="check" size={15} /> Notifications are on for this device.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" onClick={() => turnOn.mutate()} disabled={turnOn.isPending || !data?.ready}>
              {turnOn.isPending ? "Turning on…" : "Turn on notifications"}
            </button>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{isIos() ? "Your iPhone will ask you to allow them." : "Your browser will ask you to allow them."}</span>
          </div>
        )}
        <ErrorNote error={turnOn.error ?? remove.error ?? test.error ?? prefs.error} />

        {data && (
          <div>
            <div className="label">Ping me about</div>
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
              {data.kinds.map((k) => (
                <li key={k.kind} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{k.label}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">{k.hint}</div>
                  </div>
                  <Toggle checked={!!data.prefs[k.kind]} onChange={(v) => prefs.mutate({ [k.kind]: v })} label={k.label} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {!!data?.devices.length && (
          <div>
            <div className="label">Devices</div>
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
              {data.devices.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate">
                    {d.label}
                    {d.endpoint === here && <span className="chip ml-2">This device</span>}
                  </span>
                  <button className="btn-soft !px-2.5 !py-1 text-xs" onClick={() => remove.mutate(d.id)} disabled={remove.isPending}>
                    Turn off
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn-soft mt-3" onClick={() => test.mutate()} disabled={test.isPending}>
              {test.isPending ? "Sending…" : "Send a test notification"}
            </button>
          </div>
        )}
      </div>
    </Section>
  );
}
