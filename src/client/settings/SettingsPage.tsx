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
import { BUILD_INFO } from "../lib/buildInfo";
import type { AiStatus } from "../../shared/api";
import { useClaude } from "../components/ClaudeBar";
import { CopyButton } from "../rooms/shared/CopyButton";
import { FORMAT_INFO, FORMATS } from "../../shared/format";

export function SettingsPage() {
  const { data: snap } = useSnapshot();
  if (!snap) return <p>Loading…</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">⚙️ Settings</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <General s={snap.settings} />
        <ProductKinds s={snap.settings} />
        <ClaudeCode s={snap.settings} />
        <EtsyRadar s={snap.settings} />
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
    saveNow: (patch: Record<string, unknown>) => save.mutate(patch, { onSuccess: () => toast({ icon: "💾", title: "Saved" }) }),
  };
}

/** 🎨 / 📊 / 📄: which kinds of product the agents research, suggest and make. */
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
    <Section title="Products we make" icon="🧺">
      <p className="text-sm">Switch off a kind of product and Trend Radar, today's ideas and the Suggestion box stop offering it. Products already being made carry on.</p>
      <ul className="mt-3 space-y-2">
        {FORMATS.map((f) => (
          <li key={f} className={`flex items-center justify-between gap-3 rounded-xl p-2 ring-1 ring-black/5 dark:ring-white/10 ${on[f] ? "" : "opacity-60"}`}>
            <span className="min-w-0">
              <span className={`chip !px-1.5 !py-0 text-[10px] font-black ${FORMAT_INFO[f].chip}`}>
                {FORMAT_INFO[f].icon} {FORMAT_INFO[f].label}
              </span>{" "}
              <span className="text-sm">{blurb[f]}</span>
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
      {count === 1 && <p className="mt-2 text-xs text-cocoa dark:text-stone-400">At least one kind stays on.</p>}
      <ErrorNote error={save.error} />
    </Section>
  );
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
    <Section title="Demo mode" icon="🎮">
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
          🗑️ Clear demo data
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

function About() {
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <Section title="About this app" icon="ℹ️">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="font-bold">Version</dt>
        <dd>
          <span className="chip bg-honey/25 font-mono">v{BUILD_INFO.version}</span>
        </dd>
        <dt className="font-bold">Last updated</dt>
        <dd>
          {when(BUILD_INFO.updatedAt)} <span className="text-cocoa dark:text-stone-400">({timeAgo(BUILD_INFO.updatedAt)})</span>
        </dd>
        {BUILD_INFO.change && (
          <>
            <dt className="font-bold">Latest change</dt>
            <dd>{BUILD_INFO.change}</dd>
          </>
        )}
        <dt className="font-bold">Update code</dt>
        <dd className="font-mono">{BUILD_INFO.commit ?? "—"}</dd>
        <dt className="font-bold">Deployed</dt>
        <dd>{when(BUILD_INFO.builtAt)}</dd>
      </dl>
      <p className="mt-3 text-xs text-cocoa dark:text-stone-400">“Last updated” is when Claude last changed the code. “Deployed” is when Cloudflare built this copy. Quote the update code if you ever need to report a problem.</p>
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
      icon="✨"
      right={<span className={`chip ${data?.connected ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-honey/25"}`}>{data?.connected ? "🟢 connected" : "🟡 not connected"}</span>}
    >
      <p className="text-sm">
        Let <b>Claude</b> do the thinking on <b>your Claude plan</b>: research, spreadsheet designs, vector artwork and listings. While you're on the site, BinkSuite starts a
        Claude Code session that works through the jobs and sends the results back here for you to approve.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="AI engine">
        {(
          [
            ["claude-code", "✨ Claude Code", "Your Claude plan"],
            ["workers", "☁️ Free Cloudflare AI", "Free, lower quality"],
          ] as const
        ).map(([id, label, sub]) => (
          <button
            key={id}
            role="radio"
            aria-checked={s.ai.provider === id}
            onClick={() => save.saveNow({ ai: { provider: id } })}
            className={`rounded-xl p-2 text-left ring-2 ${s.ai.provider === id ? "bg-violet-100 ring-violet-500 dark:bg-violet-900/40" : "ring-black/10 dark:ring-white/10"}`}
          >
            <b className="block">{label}</b>
            <span className="text-xs text-cocoa dark:text-stone-400">{sub}</span>
          </button>
        ))}
      </div>
      {claude && (
        <label className="mt-3 flex items-center justify-between gap-2 text-sm font-semibold">
          Start Claude automatically while I'm on the site
          <Toggle checked={s.ai.claudeAutoStart} onChange={(v) => save.saveNow({ ai: { claudeAutoStart: v } })} label="Start Claude automatically" />
        </label>
      )}

      <ol className="mt-4 space-y-3 text-sm">
        <li>
          <b>1. Connection key</b> {data?.keySet && <span className="chip">key made</span>}
          <p className="text-xs text-cocoa dark:text-stone-400">Claude's sessions use this to fetch jobs and send results. Shown once.</p>
          {key ? (
            <div className="mt-1 space-y-1 rounded-xl bg-black/5 p-2 text-xs dark:bg-white/5">
              <div>
                Add these two <b>environment variables</b> to your Claude Code environment:
              </div>
              <code className="block break-all">BINKSUITE_URL={window.location.origin}</code>
              <code className="block break-all">BINKSUITE_AGENT_KEY={key}</code>
              <CopyButton text={`BINKSUITE_URL=${window.location.origin}\nBINKSUITE_AGENT_KEY=${key}`} label="Copy both" />
            </div>
          ) : (
            <button className="btn-soft mt-1 !py-1 text-xs" onClick={() => makeKey.mutate()} disabled={makeKey.isPending}>
              {data?.keySet ? "Make a new key (the old one stops working)" : "Make a connection key"}
            </button>
          )}
        </li>
        <li>
          <b>2. Routine link</b> {data?.routine && <span className="chip">token ••••{data.routine.last4}</span>}
          <p className="text-xs text-cocoa dark:text-stone-400">From your routine's page on claude.ai/code/routines → API trigger.</p>
          <form
            className="mt-1 space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              saveRoutine.mutate();
            }}
          >
            <input className="input font-mono text-xs" placeholder="https://api.anthropic.com/v1/claude_code/routines/…/fire" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Routine API link" />
            <input className="input font-mono text-xs" type="password" autoComplete="off" placeholder="Routine token (sk-ant-…)" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Routine token" />
            <button className="btn-primary !py-1 text-xs" disabled={!url || token.length < 20 || saveRoutine.isPending}>
              Save and switch to Claude
            </button>
          </form>
          <ErrorNote error={saveRoutine.error ?? makeKey.error} />
        </li>
      </ol>

      {data && data.jobs.length > 0 && (
        <div className="mt-4">
          <div className="label">Claude's to-do list</div>
          <ul className="space-y-1 text-xs">
            {data.jobs.map((j) => (
              <li key={j.id} className="flex items-start gap-2 rounded-lg bg-black/5 p-1.5 dark:bg-white/5">
                <span>{j.kind === "svg" ? "🖋️" : "🧠"}</span>
                <span className="min-w-0 flex-1">
                  <b>{j.title}</b> <span className="opacity-60">· {j.status === "working" ? "Claude's on it" : "waiting"}</span>
                  {j.error && <span className="block text-amber-700 dark:text-amber-300">↩ sent back: {j.error}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data?.run && (
        <p className="mt-2 text-xs text-cocoa dark:text-stone-400">
          Last session: {timeAgo(data.run.at)}
          {data.run.finishedAt ? ` · finished, made ${data.run.answered ?? 0}` : data.running ? " · working" : ""}
          {data.run.error ? ` · ⚠️ ${data.run.error}` : ""}
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
    <Section title="AI engine" icon="🤖" right={<span className="chip bg-mint/25">Free</span>}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm">
          {s.ai.provider === "claude-code" ? (
            <>
              Claude does the thinking now. <b>Cloudflare Workers AI</b> (free) only paints the empty rooms and desks behind your mockups.
            </>
          ) : (
            <>
              Your agents use <b>Cloudflare Workers AI</b>, which comes free with your Cloudflare account. No keys and no card. Real work happens for ideas you suggest; demo
              products stay pretend.
            </>
          )}
        </p>
        <Toggle checked={s.ai.enabled} onChange={(v) => save.saveNow({ ai: { enabled: v } })} label="Real AI on" />
      </div>
      {data && !data.available && <p className="mt-2 rounded-xl bg-berry/10 p-2 text-sm font-bold text-berry">AI isn't connected on this server yet. It will be after the next deploy.</p>}
      {data && (
        <div className="mt-3">
          <div className="flex justify-between text-sm font-bold">
            <span>Free allowance used today</span>
            <span className="tabular-nums">
              {Math.round(data.usedToday).toLocaleString()} / {data.cap.toLocaleString()}
            </span>
          </div>
          <ProgressBar value={data.cap ? data.usedToday / data.cap : 0} color={data.usedToday / data.cap > 0.85 ? "#e0607e" : "#7c9cf5"} label="Free AI used today" />
          <p className="mt-1 text-xs text-cocoa dark:text-stone-400">
            Enough for about <b>{data.productsLeftToday}</b> more product{data.productsLeftToday === 1 ? "" : "s"} today. Resets at 1am UK time (midnight UTC). Stopping
            just under Cloudflare's 10,000 daily limit means you're never charged.
          </p>
        </div>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-bold">Advanced</summary>
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
    onSuccess: (r) => toast({ icon: r.ok ? "🟢" : "⚠️", title: r.ok ? "Etsy connected" : "Etsy problem", body: r.message }),
  });
  const watchNow = useMutation({
    mutationFn: () => api.post<{ raised: number }>("/radar/price-watch"),
    onSuccess: (r) => (toast({ icon: "👀", title: r.raised ? `${r.raised} price alert${r.raised === 1 ? "" : "s"}` : "Prices look fine" }), qc.invalidateQueries()),
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
        <span className="text-sm">{suffix}</span>
      </div>
    </label>
  );
  return (
    <Section title="Etsy & Trend Radar" icon="📡" right={<span className="chip">{etsyKey ? "🟢 key saved" : "🟡 no key yet"}</span>}>
      <p className="mb-3 text-sm">
        Your Etsy app's <b>keystring</b> and <b>shared secret</b> (Etsy → Your account → Developers → Your apps) let BinkSuite read live listings: trends, competitor
        prices and your own shop. Read-only; it can't change anything on Etsy. Stored encrypted.
      </p>
      {etsyKey && <p className="mb-2 font-mono text-xs">••••{etsyKey.last4} · saved {timeAgo(etsyKey.updatedAt)}</p>}
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
      <label className="mt-3 flex items-center justify-between gap-2 text-sm font-semibold">
        Send today's ideas to Scout automatically each morning
        <Toggle checked={s.radar.autoDaily} onChange={(v) => save.saveNow({ radar: { autoDaily: v } })} label="Automatic daily ideas" />
      </label>
      <button className="btn-soft mt-3" onClick={() => watchNow.mutate()} disabled={watchNow.isPending}>
        👀 Run Price Watch now
      </button>
    </Section>
  );
}
