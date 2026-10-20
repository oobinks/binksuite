import { useEffect, useState, type ReactNode } from "react";
import { Notifications } from "./Notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useSnapshot, useSaveSettings, applyTheme } from "../lib/hooks";
import { useUi } from "../lib/store";
import { plain, pounds, toPence, timeAgo } from "../lib/format";
import { AGENTS, ROOM_BY_ID } from "../../shared/registry";
import type { Settings } from "../../shared/settings";
import type { FeeSettings } from "../../shared/fees";
import { ErrorNote, ProgressBar, Section, Toggle } from "../components/ui";
import { Avatar } from "../agents/Avatar";
import { BUILD_INFO } from "../lib/buildInfo";
import type { AiStatus } from "../../shared/api";
import { useClaude } from "../components/ClaudeBar";
import { CopyButton } from "../rooms/shared/CopyButton";
import { FORMAT_INFO, FORMATS } from "../../shared/format";
import { FormatBadge } from "../components/FormatBadge";
import { PageHeader } from "../components/PageHeader";
import { Icon } from "../components/Icon";

function Status({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className="chip inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
      {children}
    </span>
  );
}

export function SettingsPage() {
  const { data: snap } = useSnapshot();
  if (!snap) return <p className="py-20 text-center text-sm text-zinc-500">Loading…</p>;
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Shop details, AI, Etsy connection, fees and your account." />
      <div className="grid gap-4 lg:grid-cols-2">
        <General s={snap.settings} />
        <ProductKinds s={snap.settings} />
        <ClaudeCode s={snap.settings} />
        <EtsyRadar s={snap.settings} />
        <EtsyShop />
        <Notifications />
        <AiEngine s={snap.settings} />
        <Demo s={snap.settings} />
        <Fees s={snap.settings} />
        <Money s={snap.settings} />
        <Agents s={snap.settings} />
        <KeyVault />
        <Storage />
        <Account />
        <About />
      </div>
    </div>
  );
}

function useSaved() {
  const save = useSaveSettings();
  const toast = useUi((s) => s.toast);
  return {
    ...save,
    saveNow: (patch: Record<string, unknown>) => save.mutate(patch, { onSuccess: () => toast({ icon: "", title: "Saved" }) }),
  };
}

/** Art / Excel / PDF: which kinds of product the agents research, suggest and make. */
function ProductKinds({ s }: { s: Settings }) {
  const save = useSaved();
  const on = s.formats;
  const count = FORMATS.filter((f) => on[f]).length;
  const blurb: Record<(typeof FORMATS)[number], string> = {
    art: "Printable wall art prints",
    excel: "Ready-made spreadsheets (Excel + Google Sheets), with a printable PDF copy",
    pdf: "Printable planners, trackers and checklists",
  };
  return (
    <Section title="Products we make">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Switch off a kind of product and Trend Radar, today's ideas and the Suggestion box stop offering it. Products already being made carry on.</p>
      <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
        {FORMATS.map((f) => (
          <li key={f} className={`flex items-center justify-between gap-3 px-3 py-2.5 ${on[f] ? "" : "opacity-60"}`}>
            <span className="flex min-w-0 items-center gap-2">
              <FormatBadge format={f} />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">{blurb[f]}</span>
            </span>
            <Toggle
              checked={on[f]}
              onChange={(v) => {
                if (!v && count === 1) return;
                save.saveNow({ formats: { ...on, [f]: v } });
              }}
              label={`Make ${FORMAT_INFO[f].label} products`}
            />
          </li>
        ))}
      </ul>
      {count === 1 && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">At least one kind stays on.</p>}
      <ErrorNote error={save.error} />
    </Section>
  );
}

function General({ s }: { s: Settings }) {
  const save = useSaved();
  const [shopName, setShopName] = useState(s.shopName);
  const [tone, setTone] = useState(s.toneOfVoice);
  return (
    <Section title="Shop and appearance">
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
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-white/10 dark:bg-white/[0.04]" role="radiogroup" aria-label="Theme">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={s.theme === t}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${s.theme === t ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-night-2 dark:text-white dark:ring-white/10" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"}`}
                onClick={() => {
                  applyTheme(t);
                  save.saveNow({ theme: t });
                }}
              >
                {t === "light" ? "Light" : t === "dark" ? "Dark" : "System"}
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
    <Section title="Demo mode">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Demo mode fills the app with a sample shop and runs fake agents through the real task queue. Real ledger entries you add are always kept and always count.
        </p>
        <Toggle checked={s.demoMode} onChange={(v) => save.saveNow({ demoMode: v })} label="Demo mode" />
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Turning it off hides demo data so you start from a clean slate.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-soft" onClick={() => confirm("Reset the demo shop to its starting state?") && reset.mutate()} disabled={reset.isPending}>
          Reset demo shop
        </button>
        <button className="btn-bad" onClick={() => confirm("Delete all demo data and switch demo mode off? Your real entries stay.") && clear.mutate()} disabled={clear.isPending}>
          Clear demo data
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
    <Section title="Etsy fee rates" right={<span className="chip">Checked Oct 2026</span>}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        {FEE_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="label !text-[10px]">{f.label}</span>
            <input className="input tabular-nums" inputMode="decimal" value={vals[f.key]} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} onBlur={() => commit(f)} />
          </label>
        ))}
      </div>
      <label className="mt-3 flex items-center justify-between gap-2 text-sm font-medium">
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
    <Section title="Targets and guardrails">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        {fields.map(([k, label]) => (
          <label key={k} className="block">
            <span className="label !text-[10px]">{label} (£)</span>
            <input
              className="input tabular-nums"
              inputMode="decimal"
              value={vals[k]}
              onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
              onBlur={() => toPence(vals[k]) !== s[k] && save.saveNow({ [k]: toPence(vals[k]) })}
            />
          </label>
        ))}
      </div>
      <label className="mt-3 flex items-center justify-between gap-2 text-sm font-medium">
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
    <Section title="Agents on duty">
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {AGENTS.map((a) => {
          const on = s.agentsEnabled[a.id] !== false;
          return (
            <li key={a.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
              <Avatar agent={a} size={30} showProp={false} status={on ? "idle" : "off"} />
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{a.name}</span>
                <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{a.role} · {plain(ROOM_BY_ID[a.room].name)}</span>
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
    <Section title="Key vault">
      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">Keys are encrypted on Cloudflare with your VAULT_MASTER_KEY. The app only ever shows the last 4 characters. None are needed in Phase 1.</p>
      {data && !data.ready && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 px-3 py-2 text-sm">Set the VAULT_MASTER_KEY secret first.</p>}
      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
        {data?.providers.map((p) => {
          const k = data.keys.find((x) => x.provider === p.id);
          return (
            <li key={p.id} className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm">
                  <span className="font-medium">{p.name}</span> <span className="chip ml-1">Phase {p.phase}</span>
                  <span className="mt-0.5 block font-mono text-xs text-zinc-500 dark:text-zinc-400">{k ? `••••${k.last4} · ${timeAgo(k.updatedAt)}` : "not set"}</span>
                </span>
                <button className="btn-soft px-2.5 py-1 text-xs" onClick={() => (setEditing(editing === p.id ? null : p.id), setValue(""))}>
                  {k ? "Replace" : "Add"}
                </button>
                {k && (
                  <button className="btn-bad px-2.5 py-1 text-xs" onClick={() => confirm(`Remove the ${p.name} key?`) && del.mutate(p.id)}>
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
    <Section title="File storage (R2)">
      {data ? (
        <>
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-medium tabular-nums">{data.objects} files</span>
            <span className="text-zinc-500 tabular-nums dark:text-zinc-400">
              {gb(data.bytes)} GB / {gb(data.freeBytes)} GB free
            </span>
          </div>
          <ProgressBar value={data.bytes / data.freeBytes} color={data.bytes / data.freeBytes > 0.8 ? "#e11d48" : "#4f46e5"} label="Storage used" />
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Roughly 2–4k print-ready products fit in the free 10 GB. After that it's about $0.015 per GB per month.</p>
        </>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Checking…</p>
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
      toast({ icon: "", title: "Password changed", body: "Other devices have been logged out" });
    },
  });
  const logout = async (all: boolean) => {
    await api.post(all ? "/auth/logout-all" : "/auth/logout").catch(() => {});
    location.href = "/login";
  };
  return (
    <Section title="Account and data">
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
      <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-white/[0.06]">
        <a className="btn-soft" href="/api/export" download>
          Export all data (JSON)
        </a>
        <button className="btn-soft" onClick={() => logout(false)}>
          Log out
        </button>
        <button className="btn-bad" onClick={() => confirm("Log out on every device?") && logout(true)}>
          Log out everywhere
        </button>
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">The export never includes your API keys.</p>
    </Section>
  );
}

function About() {
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <Section title="About">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-zinc-500 dark:text-zinc-400">Version</dt>
        <dd>
          <span className="chip font-mono">v{BUILD_INFO.version}</span>
        </dd>
        <dt className="text-zinc-500 dark:text-zinc-400">Last updated</dt>
        <dd>
          {when(BUILD_INFO.updatedAt)} <span className="text-zinc-500 dark:text-zinc-400">({timeAgo(BUILD_INFO.updatedAt)})</span>
        </dd>
        {BUILD_INFO.change && (
          <>
            <dt className="text-zinc-500 dark:text-zinc-400">Latest change</dt>
            <dd>{plain(BUILD_INFO.change)}</dd>
          </>
        )}
        <dt className="text-zinc-500 dark:text-zinc-400">Update code</dt>
        <dd className="font-mono">{BUILD_INFO.commit ?? "—"}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">Deployed</dt>
        <dd>{when(BUILD_INFO.builtAt)}</dd>
      </dl>
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">“Last updated” is when Claude last changed the code. “Deployed” is when Cloudflare built this copy. Quote the update code if you ever need to report a problem.</p>
    </Section>
  );
}

function ClaudeCode({ s }: { s: Settings }) {
  const save = useSaved();
  const qc = useQueryClient();
  const { data } = useClaude();
  const [key, setKey] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const makeKey = useMutation({ mutationFn: () => api.post<{ key: string }>("/claude/key"), onSuccess: (r) => (setKey(r.key), qc.invalidateQueries({ queryKey: ["claude"] })) });
  const saveRoutine = useMutation({
    mutationFn: () => api.put("/claude/routine", { url, token }),
    onSuccess: () => (setUrl(""), setToken(""), qc.invalidateQueries()),
  });
  const claude = s.ai.provider === "claude-code";
  return (
    <Section
      title="Claude Code"
      right={<Status ok={!!data?.connected}>{data?.connected ? "Connected" : "Not connected"}</Status>}
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Let <b>Claude</b> do the thinking on <b>your Claude plan</b>: research, spreadsheet designs, vector artwork and listings. While you're on the site, BinkSuite starts a
        Claude Code session that works through the jobs and sends the results back here for you to approve.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="AI engine">
        {(
          [
            ["claude-code", "Claude Code", "Your Claude plan"],
            ["workers", "Free Cloudflare AI", "Free, lower quality"],
          ] as const
        ).map(([id, label, sub]) => (
          <button
            key={id}
            role="radio"
            aria-checked={s.ai.provider === id}
            onClick={() => save.saveNow({ ai: { provider: id } })}
            className={`rounded-lg border px-3 py-2.5 text-left transition ${s.ai.provider === id ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500 dark:border-indigo-400 dark:bg-indigo-500/10 dark:ring-indigo-400" : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20"}`}
          >
            <span className="block text-sm font-medium">{label}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{sub}</span>
          </button>
        ))}
      </div>
      {claude && (
        <label className="mt-3 flex items-center justify-between gap-2 text-sm font-medium">
          Start Claude automatically while I'm on the site
          <Toggle checked={s.ai.claudeAutoStart} onChange={(v) => save.saveNow({ ai: { claudeAutoStart: v } })} label="Start Claude automatically" />
        </label>
      )}

      <ol className="mt-4 space-y-3 text-sm">
        <li>
          <span className="font-medium">1. Connection key</span> {data?.keySet && <span className="chip ml-1">Key made</span>}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Claude's sessions use this to fetch jobs and send results. Shown once.</p>
          {key ? (
            <div className="mt-1.5 space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.03] p-3 text-xs">
              <div>
                Add these two <b>environment variables</b> to your Claude Code environment:
              </div>
              <code className="block break-all">BINKSUITE_URL={window.location.origin}</code>
              <code className="block break-all">BINKSUITE_AGENT_KEY={key}</code>
              <CopyButton text={`BINKSUITE_URL=${window.location.origin}\nBINKSUITE_AGENT_KEY=${key}`} label="Copy both" />
            </div>
          ) : (
            <button className="btn-soft mt-1.5 px-2.5 py-1 text-xs" onClick={() => makeKey.mutate()} disabled={makeKey.isPending}>
              {data?.keySet ? "Make a new key (the old one stops working)" : "Make a connection key"}
            </button>
          )}
        </li>
        <li>
          <span className="font-medium">2. Routine link</span> {data?.routine && <span className="chip ml-1 font-mono">token ••••{data.routine.last4}</span>}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">From your routine's page on claude.ai/code/routines → API trigger.</p>
          <form
            className="mt-1 space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              saveRoutine.mutate();
            }}
          >
            <input className="input font-mono text-xs" placeholder="https://api.anthropic.com/v1/claude_code/routines/…/fire" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Routine API link" />
            <input className="input font-mono text-xs" type="password" autoComplete="off" placeholder="Routine token (sk-ant-…)" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Routine token" />
            <button className="btn-primary px-2.5 py-1 text-xs" disabled={!url || token.length < 20 || saveRoutine.isPending}>
              Save and switch to Claude
            </button>
          </form>
          <ErrorNote error={saveRoutine.error ?? makeKey.error} />
        </li>
      </ol>

      {data && data.jobs.length > 0 && (
        <div className="mt-4">
          <div className="label">Claude's to-do list</div>
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-xs dark:divide-white/[0.06] dark:border-white/10">
            {data.jobs.map((j) => (
              <li key={j.id} className="flex items-start gap-2 px-3 py-2">
                <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${j.status === "working" ? "bg-indigo-500" : "bg-zinc-400"}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{plain(j.title)}</span> <span className="text-zinc-500 dark:text-zinc-400">· {j.kind === "svg" ? "Artwork" : "Research"} · {j.status === "working" ? "In progress" : "Waiting"}</span>
                  {j.error && <span className="block text-amber-700 dark:text-amber-300">Sent back: {plain(j.error)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data?.run && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Last session: {timeAgo(data.run.at)}
          {data.run.finishedAt ? ` · finished, made ${data.run.answered ?? 0}` : data.running ? " · working" : ""}
          {data.run.error ? ` · Error: ${plain(data.run.error)}` : ""}
          {data.run.sessionUrl && (
            <>
              {" "}
              ·{" "}
              <a className="underline" href={data.run.sessionUrl} target="_blank" rel="noreferrer">
                open session
              </a>
            </>
          )}
        </p>
      )}
    </Section>
  );
}

function AiEngine({ s }: { s: Settings }) {
  const save = useSaved();
  const { data } = useQuery({ queryKey: ["ai-status"], queryFn: () => api.get<AiStatus>("/ai/status"), refetchInterval: 15_000 });
  return (
    <Section title="AI engine" right={<span className="chip">Free</span>}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {s.ai.provider === "claude-code" ? (
            <>
              Claude does the thinking now. <b>Cloudflare Workers AI</b> (free) only paints the empty rooms and desks behind your mockups.
            </>
          ) : (
            <>
              Your agents use <b>Cloudflare Workers AI</b>, which comes free with your Cloudflare account. No keys and no card. Real work happens for ideas you suggest; demo
              products use sample output.
            </>
          )}
        </p>
        <Toggle checked={s.ai.enabled} onChange={(v) => save.saveNow({ ai: { enabled: v } })} label="Real AI on" />
      </div>
      {data && !data.available && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 px-3 py-2 text-sm">AI isn't connected on this server yet. It will be after the next deploy.</p>}
      {data && (
        <div className="mt-3">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-medium">Free allowance used today</span>
            <span className="text-zinc-500 tabular-nums dark:text-zinc-400">
              {Math.round(data.usedToday).toLocaleString()} / {data.cap.toLocaleString()}
            </span>
          </div>
          <ProgressBar value={data.cap ? data.usedToday / data.cap : 0} color={data.usedToday / data.cap > 0.85 ? "#e11d48" : "#4f46e5"} label="Free AI used today" />
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Enough for about <b>{data.productsLeftToday}</b> more product{data.productsLeftToday === 1 ? "" : "s"} today. Resets at 1am UK time (midnight UTC). Stopping
            just under Cloudflare's 10,000 daily limit means you're never charged.
          </p>
        </div>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white">Advanced</summary>
        <div className="mt-2 space-y-2">
          <label className="block">
            <span className="label !text-[10px]">Writing model</span>
            <input className="input font-mono text-xs" defaultValue={s.ai.textModel} onBlur={(e) => e.target.value !== s.ai.textModel && save.saveNow({ ai: { textModel: e.target.value.trim() } })} />
          </label>
          <label className="block">
            <span className="label !text-[10px]">Image model</span>
            <input className="input font-mono text-xs" defaultValue={s.ai.imageModel} onBlur={(e) => e.target.value !== s.ai.imageModel && save.saveNow({ ai: { imageModel: e.target.value.trim() } })} />
          </label>
          <label className="block">
            <span className="label !text-[10px]">Daily cap (neurons)</span>
            <input
              className="input"
              inputMode="numeric"
              defaultValue={s.ai.dailyNeuronCap}
              onBlur={(e) => Number(e.target.value) !== s.ai.dailyNeuronCap && save.saveNow({ ai: { dailyNeuronCap: Math.max(0, Math.round(Number(e.target.value) || 0)) } })}
            />
          </label>
        </div>
      </details>
    </Section>
  );
}

interface EtsyStatus {
  apiKey: boolean;
  shop: { shopId: number; shopName: string; connectedAt: string } | null;
  callbackUrl: string;
}

/** Connect your own shop so finished products can be sent to Etsy as drafts. */
function EtsyShop() {
  const qc = useQueryClient();
  const toast = useUi((x) => x.toast);
  const { data } = useQuery({ queryKey: ["etsy"], queryFn: () => api.get<EtsyStatus>("/etsy") });
  // Back from Etsy: say how it went, once.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const result = q.get("etsy");
    if (!result) return;
    if (result === "connected") toast({ icon: "", title: `Connected to ${q.get("shop") ?? "your Etsy shop"}`, body: "Finished products can now go to Etsy as drafts." });
    else toast({ icon: "⚠️", title: "Etsy didn't connect", body: q.get("reason") ?? undefined });
    window.history.replaceState(null, "", "/settings#etsy");
    qc.invalidateQueries({ queryKey: ["etsy"] });
  }, [qc, toast]);
  const connect = useMutation({
    mutationFn: () => api.post<{ url: string }>("/etsy/connect"),
    onSuccess: (r) => (window.location.href = r.url),
  });
  const disconnect = useMutation({
    mutationFn: () => api.post("/etsy/disconnect"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["etsy"] }),
  });
  return (
    <Section title="Etsy shop (publishing)" right={<Status ok={!!data?.shop}>{data?.shop ? data.shop.shopName : "Not connected"}</Status>}>
      <div id="etsy" className="space-y-3 text-sm">
        <p className="text-zinc-600 dark:text-zinc-300">
          Connect your shop once and the Launch Pad can send each finished product to Etsy as a <b>draft</b>, with title, tags, description, price, listing photos and the
          download files. You check the draft on Etsy and press <b>Publish</b> yourself: BinkSuite never publishes.
        </p>
        {!data?.apiKey ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 px-3 py-2">Add your Etsy API key above first.</p>
        ) : data.shop ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.03] px-3 py-2">
            <span className="flex items-center gap-1.5">
              <Icon name="check" size={14} className="text-emerald-600 dark:text-emerald-400" /> Connected to <b>{data.shop.shopName}</b> · {timeAgo(data.shop.connectedAt)}
            </span>
            <span className="flex gap-2">
              <button className="btn-soft px-2.5 py-1 text-xs" onClick={() => connect.mutate()} disabled={connect.isPending}>
                Reconnect
              </button>
              <button className="btn-soft px-2.5 py-1 text-xs" onClick={() => confirm("Disconnect your Etsy shop from BinkSuite?") && disconnect.mutate()} disabled={disconnect.isPending}>
                Disconnect
              </button>
            </span>
          </div>
        ) : (
          <ol className="space-y-3 text-zinc-700 dark:text-zinc-300">
            <li>
              <b>1.</b> On Etsy, open <b>Your account → Developers → Your apps</b>, edit your app, and add this as a <b>Callback URL</b>:
              <span className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.03] px-2 py-1 text-xs">{data.callbackUrl}</code>
                <CopyButton text={data.callbackUrl} />
              </span>
            </li>
            <li>
              <b>2.</b> Tap Connect, sign in to Etsy if asked, and tap <b>Grant access</b>. You'll come straight back here.
              <button className="btn-primary mt-1 w-full" onClick={() => connect.mutate()} disabled={connect.isPending}>
                {connect.isPending ? "Opening Etsy…" : "Connect my Etsy shop"}
              </button>
            </li>
          </ol>
        )}
        <ErrorNote error={connect.error ?? disconnect.error} />
      </div>
    </Section>
  );
}

function EtsyRadar({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const save = useSaved();
  const toast = useUi((x) => x.toast);
  const [keystring, setKeystring] = useState("");
  const [secret, setSecret] = useState("");
  const vault = useQuery({ queryKey: ["vault"], queryFn: () => api.get<VaultResp>("/vault") });
  const etsyKey = vault.data?.keys.find((k) => k.provider === "etsy");
  const saveKey = useMutation({
    mutationFn: () => api.put("/vault/etsy", { key: `${keystring.trim()}:${secret.trim()}` }),
    onSuccess: () => {
      setKeystring("");
      setSecret("");
      qc.invalidateQueries();
      test.mutate();
    },
  });
  const test = useMutation({
    mutationFn: () => api.get<{ ok: boolean; message: string }>("/radar/test"),
    onSuccess: (r) => toast({ icon: r.ok ? "" : "⚠️", title: r.ok ? "Etsy connected" : "Etsy problem", body: r.message }),
  });
  const watchNow = useMutation({
    mutationFn: () => api.post<{ raised: number }>("/radar/price-watch"),
    onSuccess: (r) => (toast({ icon: "", title: r.raised ? `${r.raised} price alert${r.raised === 1 ? "" : "s"}` : "Prices look fine" }), qc.invalidateQueries()),
  });
  const num = (k: "dailyIdeas" | "undercutPercent" | "priceTolerancePercent", label: string, suffix: string) => (
    <label className="block">
      <span className="label !text-[10px]">{label}</span>
      <div className="flex items-center gap-1">
        <input
          className="input"
          inputMode="numeric"
          defaultValue={s.radar[k]}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v !== s.radar[k]) save.saveNow({ radar: { [k]: v } });
          }}
        />
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{suffix}</span>
      </div>
    </label>
  );
  return (
    <Section title="Etsy and Trend Radar" right={<Status ok={!!etsyKey}>{etsyKey ? "Key saved" : "No key yet"}</Status>}>
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-300">
        Your Etsy app's <b>keystring</b> and <b>shared secret</b> (Etsy → Your account → Developers → Your apps) let BinkSuite read live listings: trends, competitor
        prices and your own shop. Read-only; it can't change anything on Etsy. Stored encrypted.
      </p>
      {etsyKey && <p className="mb-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">••••{etsyKey.last4} · saved {timeAgo(etsyKey.updatedAt)}</p>}
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          saveKey.mutate();
        }}
      >
        <input className="input font-mono" autoComplete="off" placeholder="Keystring" value={keystring} onChange={(e) => setKeystring(e.target.value)} aria-label="Etsy keystring" />
        <input className="input font-mono" type="password" autoComplete="off" placeholder="Shared secret" value={secret} onChange={(e) => setSecret(e.target.value)} aria-label="Etsy shared secret" />
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn-primary" disabled={keystring.trim().length < 8 || secret.trim().length < 4 || saveKey.isPending}>
            {etsyKey ? "Replace key" : "Save key"}
          </button>
          <button type="button" className="btn-soft" onClick={() => test.mutate()} disabled={test.isPending}>
            {test.isPending ? "Testing…" : "Test connection"}
          </button>
        </div>
      </form>
      <ErrorNote error={saveKey.error} />
      <label className="mt-3 block">
        <span className="label">Your Etsy shop name (for Price Watch)</span>
        <input className="input" defaultValue={s.radar.etsyShopName} placeholder="e.g. CosyPrintsShop" onBlur={(e) => e.target.value.trim() !== s.radar.etsyShopName && save.saveNow({ radar: { etsyShopName: e.target.value.trim() } })} />
      </label>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {num("dailyIdeas", "Ideas each morning", "")}
        {num("undercutPercent", "Undercut market by", "%")}
        {num("priceTolerancePercent", "Alert when above market by", "%")}
      </div>
      <label className="mt-3 flex items-center justify-between gap-2 text-sm font-medium">
        Line up today's best ideas automatically each morning
        <Toggle checked={s.radar.autoDaily} onChange={(v) => save.saveNow({ radar: { autoDaily: v } })} label="Automatic daily ideas" />
      </label>
      <button className="btn-soft mt-3" onClick={() => watchNow.mutate()} disabled={watchNow.isPending}>
        Run Price Watch now
      </button>
    </Section>
  );
}
