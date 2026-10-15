import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useSnapshot, useSaveSettings, applyTheme } from "../lib/hooks";
import { useUi } from "../lib/store";
import { pounds, toPence, timeAgo } from "../lib/format";
import { AGENTS, ROOM_BY_ID } from "../../shared/registry";
import type { Settings } from "../../shared/settings";
import type { FeeSettings } from "../../shared/fees";
import { ErrorNote, ProgressBar, Section, Toggle } from "../components/ui";
import { Avatar } from "../agents/Avatar";

export function SettingsPage() {
  const { data: snap } = useSnapshot();
  if (!snap) return <p>Loading…</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">⚙️ Settings</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <General s={snap.settings} />
        <Demo s={snap.settings} />
        <Fees s={snap.settings} />
        <Money s={snap.settings} />
        <Agents s={snap.settings} />
        <KeyVault />
        <Storage />
        <Account />
      </div>
    </div>
  );
}

function useSaved() {
  const save = useSaveSettings();
  const toast = useUi((s) => s.toast);
  return {
    ...save,
    saveNow: (patch: Record<string, unknown>) => save.mutate(patch, { onSuccess: () => toast({ icon: "💾", title: "Saved" }) }),
  };
}

function General({ s }: { s: Settings }) {
  const save = useSaved();
  const [shopName, setShopName] = useState(s.shopName);
  const [tone, setTone] = useState(s.toneOfVoice);
  return (
    <Section title="Shop & look" icon="🏡">
      <div className="space-y-3">
        <label className="block">
          <span className="label">Shop name</span>
          <input className="input" value={shopName} onChange={(e) => setShopName(e.target.value)} onBlur={() => shopName !== s.shopName && save.saveNow({ shopName })} />
        </label>
        <label className="block">
          <span className="label">Tone of voice (used by the writing agents)</span>
          <textarea className="input min-h-20" value={tone} onChange={(e) => setTone(e.target.value)} onBlur={() => tone !== s.toneOfVoice && save.saveNow({ toneOfVoice: tone })} />
        </label>
        <div>
          <span className="label">Theme</span>
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                className={`btn flex-1 capitalize ${s.theme === t ? "bg-ink text-cream dark:bg-honey dark:text-night" : "bg-black/5 dark:bg-white/10"}`}
                onClick={() => {
                  applyTheme(t);
                  save.saveNow({ theme: t });
                }}
              >
                {t === "light" ? "☀️" : t === "dark" ? "🌙" : "🖥️"} {t}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function Demo({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const save = useSaved();
  const reset = useMutation({ mutationFn: () => api.post("/demo/reset"), onSuccess: () => qc.invalidateQueries() });
  const clear = useMutation({ mutationFn: () => api.post("/demo/clear"), onSuccess: () => qc.invalidateQueries() });
  return (
    <Section title="Demo mode" icon="🧪">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm">
          Demo mode fills the HQ with a pretend shop and runs fake agents through the real task queue. Real ledger entries you add are always kept and always count.
        </p>
        <Toggle checked={s.demoMode} onChange={(v) => save.saveNow({ demoMode: v })} label="Demo mode" />
      </div>
      <p className="mt-2 text-xs text-cocoa dark:text-stone-400">Turning it off hides demo data (and demo XP) so you start your real game at Lv 1.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-soft" onClick={() => confirm("Reset the demo shop to its starting state?") && reset.mutate()} disabled={reset.isPending}>
          🔄 Reset demo shop
        </button>
        <button className="btn-bad" onClick={() => confirm("Delete all demo data and switch demo mode off? Your real entries stay.") && clear.mutate()} disabled={clear.isPending}>
          🧹 Clear demo data
        </button>
      </div>
      <ErrorNote error={reset.error ?? clear.error} />
    </Section>
  );
}

const FEE_FIELDS: { key: keyof FeeSettings; label: string; kind: "pct" | "num" | "pence" }[] = [
  { key: "listingFeeUsd", label: "Listing fee (USD)", kind: "num" },
  { key: "usdToGbp", label: "£ per $1", kind: "num" },
  { key: "transactionRate", label: "Transaction fee %", kind: "pct" },
  { key: "processingRate", label: "Payment processing %", kind: "pct" },
  { key: "processingFixedPence", label: "Processing fixed (£)", kind: "pence" },
  { key: "regulatoryRate", label: "Regulatory operating fee %", kind: "pct" },
  { key: "vatRate", label: "VAT on fees %", kind: "pct" },
  { key: "offsiteAdsRate", label: "Offsite Ads %", kind: "pct" },
  { key: "offsiteAdsCapUsd", label: "Offsite Ads cap (USD)", kind: "num" },
  { key: "currencyConversionRate", label: "Currency conversion %", kind: "pct" },
];

function Fees({ s }: { s: Settings }) {
  const save = useSaved();
  const show = (k: (typeof FEE_FIELDS)[number]) => {
    const v = s.fees[k.key] as number;
    return k.kind === "pct" ? +(v * 100).toFixed(3) + "" : k.kind === "pence" ? pounds(v) : String(v);
  };
  const [vals, setVals] = useState(() => Object.fromEntries(FEE_FIELDS.map((f) => [f.key, show(f)])));
  useEffect(() => setVals(Object.fromEntries(FEE_FIELDS.map((f) => [f.key, show(f)]))), [s.fees]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (f: (typeof FEE_FIELDS)[number]) => {
    const raw = vals[f.key];
    const n = f.kind === "pence" ? toPence(raw) : f.kind === "pct" ? Number(raw) / 100 : Number(raw);
    if (!Number.isFinite(n) || n === s.fees[f.key]) return;
    save.saveNow({ fees: { [f.key]: n } });
  };
  return (
    <Section title="Etsy fee rates" icon="🏷️" right={<span className="chip">checked Oct 2026</span>}>
      <div className="grid grid-cols-2 gap-2">
        {FEE_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="label !text-[10px]">{f.label}</span>
            <input className="input" inputMode="decimal" value={vals[f.key]} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} onBlur={() => commit(f)} />
          </label>
        ))}
      </div>
      <label className="mt-3 flex items-center justify-between gap-2 text-sm font-semibold">
        Charge VAT on payment processing too
        <Toggle checked={s.fees.vatOnProcessing} onChange={(v) => save.saveNow({ fees: { vatOnProcessing: v } })} label="VAT on processing" />
      </label>
      <ErrorNote error={save.error} />
    </Section>
  );
}

function Money({ s }: { s: Settings }) {
  const save = useSaved();
  const fields = [
    ["minProfitPence", "Minimum profit per sale"],
    ["monthlyTargetPence", "Monthly profit goal"],
    ["dailyCapPence", "Daily AI spend cap"],
    ["monthlyCapPence", "Monthly AI spend cap"],
  ] as const;
  const [vals, setVals] = useState(() => Object.fromEntries(fields.map(([k]) => [k, pounds(s[k])])));
  return (
    <Section title="Targets & guardrails" icon="🎯">
      <div className="grid grid-cols-2 gap-2">
        {fields.map(([k, label]) => (
          <label key={k} className="block">
            <span className="label !text-[10px]">{label} (£)</span>
            <input
              className="input"
              inputMode="decimal"
              value={vals[k]}
              onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
              onBlur={() => toPence(vals[k]) !== s[k] && save.saveNow({ [k]: toPence(vals[k]) })}
            />
          </label>
        ))}
      </div>
      <label className="mt-3 flex items-center justify-between gap-2 text-sm font-semibold">
        My image provider's licence allows selling the images
        <Toggle checked={s.providerLicenceOk} onChange={(v) => save.saveNow({ providerLicenceOk: v })} label="Provider licence OK" />
      </label>
      <label className="mt-3 block">
        <span className="label">Compliance blocklist (comma separated)</span>
        <textarea
          className="input min-h-16"
          defaultValue={s.blocklist.join(", ")}
          onBlur={(e) => {
            const list = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
            if (list.join() !== s.blocklist.join()) save.saveNow({ blocklist: list });
          }}
        />
      </label>
    </Section>
  );
}

function Agents({ s }: { s: Settings }) {
  const save = useSaved();
  return (
    <Section title="Agents on duty" icon="👥">
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {AGENTS.map((a) => {
          const on = s.agentsEnabled[a.id] !== false;
          return (
            <li key={a.id} className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-black/5 dark:hover:bg-white/5">
              <Avatar agent={a} size={30} showProp={false} status={on ? "idle" : "off"} />
              <span className="min-w-0 flex-1 text-sm">
                <b>{a.name}</b>
                <span className="block truncate text-xs text-cocoa dark:text-stone-400">{ROOM_BY_ID[a.room].icon} {a.role}</span>
              </span>
              <Toggle checked={on} onChange={(v) => save.saveNow({ agentsEnabled: { [a.id]: v } })} label={`${a.name} on duty`} />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

interface VaultResp {
  ready: boolean;
  providers: { id: string; name: string; phase: number }[];
  keys: { provider: string; last4: string; updatedAt: string }[];
}

function KeyVault() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["vault"], queryFn: () => api.get<VaultResp>("/vault") });
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const save = useMutation({
    mutationFn: () => api.put(`/vault/${editing}`, { key: value }),
    onSuccess: () => {
      setEditing(null);
      setValue("");
      qc.invalidateQueries({ queryKey: ["vault"] });
    },
  });
  const del = useMutation({ mutationFn: (p: string) => api.del(`/vault/${p}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["vault"] }) });
  return (
    <Section title="Key Vault" icon="🔐">
      <p className="mb-3 text-xs text-cocoa dark:text-stone-400">Keys are encrypted on Cloudflare with your VAULT_MASTER_KEY. The app only ever shows the last 4 characters. None are needed in Phase 1.</p>
      {data && !data.ready && <p className="mb-2 rounded-xl bg-berry/10 p-2 text-sm font-bold text-berry">Set the VAULT_MASTER_KEY secret first.</p>}
      <ul className="space-y-2">
        {data?.providers.map((p) => {
          const k = data.keys.find((x) => x.provider === p.id);
          return (
            <li key={p.id} className="rounded-xl p-2 ring-1 ring-black/5 dark:ring-white/10">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm">
                  <b>{p.name}</b> <span className="chip">Phase {p.phase}</span>
                  <span className="block font-mono text-xs text-cocoa dark:text-stone-400">{k ? `••••${k.last4} · ${timeAgo(k.updatedAt)}` : "not set"}</span>
                </span>
                <button className="btn-soft !py-1 text-xs" onClick={() => (setEditing(editing === p.id ? null : p.id), setValue(""))}>
                  {k ? "Replace" : "Add"}
                </button>
                {k && (
                  <button className="btn-bad !py-1 text-xs" onClick={() => confirm(`Remove the ${p.name} key?`) && del.mutate(p.id)}>
                    Remove
                  </button>
                )}
              </div>
              {editing === p.id && (
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save.mutate();
                  }}
                >
                  <input className="input font-mono" type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste key" aria-label={`${p.name} key`} />
                  <button className="btn-primary" disabled={save.isPending || !data.ready}>
                    Save
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      <ErrorNote error={save.error} />
    </Section>
  );
}

function Storage() {
  const { data } = useQuery({ queryKey: ["storage"], queryFn: () => api.get<{ bytes: number; objects: number; freeBytes: number }>("/storage") });
  const gb = (b: number) => (b / 1024 ** 3).toFixed(b < 1024 ** 3 ? 3 : 2);
  return (
    <Section title="File storage (R2)" icon="🗄️">
      {data ? (
        <>
          <div className="flex justify-between text-sm font-bold">
            <span>{data.objects} files</span>
            <span>
              {gb(data.bytes)} GB / {gb(data.freeBytes)} GB free
            </span>
          </div>
          <ProgressBar value={data.bytes / data.freeBytes} color={data.bytes / data.freeBytes > 0.8 ? "#e0607e" : "#7c9cf5"} label="Storage used" />
          <p className="mt-2 text-xs text-cocoa dark:text-stone-400">Roughly 2–4k print-ready products fit in the free 10 GB. After that it's about $0.015 per GB per month.</p>
        </>
      ) : (
        <p className="text-sm">Checking…</p>
      )}
    </Section>
  );
}

function Account() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const toast = useUi((s) => s.toast);
  const change = useMutation({
    mutationFn: () => api.post("/auth/password", { current, next }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      toast({ icon: "🔑", title: "Password changed", body: "Other devices have been logged out" });
    },
  });
  const logout = async (all: boolean) => {
    await api.post(all ? "/auth/logout-all" : "/auth/logout").catch(() => {});
    location.href = "/login";
  };
  return (
    <Section title="Account & data" icon="🔑">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        <input className="input" type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} aria-label="Current password" />
        <input className="input" type="password" autoComplete="new-password" placeholder="New password (10+ characters)" value={next} onChange={(e) => setNext(e.target.value)} aria-label="New password" />
        <ErrorNote error={change.error} />
        <button className="btn-primary" disabled={change.isPending || !current || next.length < 10}>
          Change password
        </button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-black/5 pt-3 dark:border-white/10">
        <a className="btn-soft" href="/api/export" download>
          ⬇️ Export all data (JSON)
        </a>
        <button className="btn-soft" onClick={() => logout(false)}>
          👋 Log out
        </button>
        <button className="btn-bad" onClick={() => confirm("Log out on every device?") && logout(true)}>
          Log out everywhere
        </button>
      </div>
      <p className="mt-2 text-xs text-cocoa dark:text-stone-400">The export never includes your API keys.</p>
    </Section>
  );
}
