// The dashboard: this month's numbers, the product pipeline at a glance, and the team.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useSnapshot } from "../lib/hooks";
import { formatGBP, plain } from "../lib/format";
import { BUSINESS, GROW, PIPELINE, ROOM_ICON, ROOM_LABEL, ROOM_TONE } from "../lib/rooms";
import type { IconName } from "../components/Icon";
import { AGENTS, ROOM_BY_ID, type RoomId } from "../../shared/registry";
import type { RoomSnapshot } from "../../shared/api";
import { ProgressBar, StatusPill } from "../components/ui";
import { Icon } from "../components/Icon";
import { Avatar } from "../agents/Avatar";
import { PageHeader } from "../components/PageHeader";

export function HQPage() {
  const { data: snap, error } = useSnapshot();
  if (error) return <p className="card p-6 text-center text-sm">Couldn't reach BinkSuite. Check your connection and refresh.</p>;
  if (!snap) return <p className="py-20 text-center text-sm text-zinc-500">Loading…</p>;

  const goal = snap.settings.monthlyTargetPence;
  const room = (id: RoomId) => snap.rooms.find((r) => r.id === id);
  const inProgress = PIPELINE.reduce((n, id) => n + (room(id)?.working ?? 0) + (room(id)?.queued ?? 0), 0);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" subtitle={today} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi icon="trend" tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" label="Profit this month" value={formatGBP(snap.game.monthProfitPence)} foot={`of ${formatGBP(goal)} goal`}>
          <ProgressBar value={goal ? snap.game.monthProfitPence / goal : 0} color="#10b981" className="mt-3" label="Monthly profit goal" />
        </Kpi>
        <Kpi icon="inbox" tone="bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300" label="Waiting for you" value={String(snap.approvalsWaiting)} foot={snap.approvalsWaiting === 1 ? "approval to review" : "approvals to review"} highlight={snap.approvalsWaiting > 0} />
        <Kpi icon="activity" tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300" label="In the pipeline" value={String(inProgress)} foot="tasks queued or running" />
        <Kpi icon="finance" tone="bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300" label="Net profit to date" value={formatGBP(snap.game.coinsPence)} foot="after fees and costs" />
        <Kpi to="/shop" icon="store" tone="bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" label="Live products" value={String(snap.liveProducts)} foot="on Etsy now" />
      </div>

      <section>
        <SectionTitle title="Pipeline" hint="Each product moves left to right. Open a stage to review its work." />
        <ol className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {PIPELINE.map((id, i) => (
            <li key={id}>
              <StageCard id={id} step={i + 1} st={room(id)} />
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <SectionTitle title="Team" hint="What each agent is doing right now." />
          <div className="card divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {AGENTS.map((a) => {
              const st = snap.agents.find((s) => s.id === a.id);
              const status = st?.status ?? "idle";
              return (
                <Link key={a.id} to={`/agent/${a.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                  <Avatar agent={a} status={status} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{a.name}</span>
                      <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{a.role}</span>
                    </div>
                    <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{st?.taskTitle ? plain(st.taskTitle) : ROOM_LABEL[a.room]}</div>
                  </div>
                  <StatusPill status={status} />
                </Link>
              );
            })}
          </div>
        </section>

        <section className="lg:col-span-2">
          <SectionTitle title="Business" />
          <div className="card divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {BUSINESS.map((id) => (
              <RoomRow key={id} id={id} st={room(id)} />
            ))}
          </div>
          <h3 className="mt-6 mb-3 text-[15px] font-semibold">Grow</h3>
          <div className="card divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {GROW.map((id) => (
              <RoomRow key={id} id={id} st={room(id)} />
            ))}
          </div>
        </section>
      </div>

      <p className="text-xs text-zinc-400 dark:text-zinc-500">Agents work while the app is open. A background run every 5 minutes keeps queued work moving.</p>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {hint && <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
    </div>
  );
}

function Kpi({ icon, tone, label, value, foot, highlight = false, to, children }: { icon: IconName; tone: string; label: string; value: string; foot: string; highlight?: boolean; to?: string; children?: ReactNode }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${tone}`}>
          <Icon name={icon} size={15} />
        </span>
      </div>
      <div className={`mt-1 text-2xl leading-none font-semibold tracking-tight tabular-nums sm:text-[28px] ${highlight ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</div>
      <div className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{foot}</div>
      {children}
    </>
  );
  return to ? (
    <Link to={to} className="card block p-4 transition hover:border-zinc-300 sm:p-5 dark:hover:border-white/15">
      {body}
    </Link>
  ) : (
    <div className="card p-4 sm:p-5">{body}</div>
  );
}

function StageCard({ id, step, st }: { id: RoomId; step: number; st?: RoomSnapshot }) {
  const needs = st?.needsYou ?? 0;
  return (
    <Link
      to={`/room/${id}`}
      className={`card group relative flex h-full flex-col overflow-hidden p-4 transition hover:border-zinc-300 hover:shadow-sm dark:hover:border-white/15 ${needs ? "border-amber-300/80 dark:border-amber-500/40" : ""}`}
    >
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: ROOM_TONE[id].hex }} aria-hidden />
      <div className="flex items-center justify-between">
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${ROOM_TONE[id].tile}`}>
          <Icon name={ROOM_ICON[id]} size={16} />
        </span>
        <span className="text-[11px] font-medium text-zinc-400 tabular-nums">0{step}</span>
      </div>
      <div className="mt-3 text-sm font-semibold">{ROOM_LABEL[id]}</div>
      <dl className="mt-3 space-y-1 text-xs">
        <Stat label="Needs you" value={needs} tone={needs ? "text-amber-700 dark:text-amber-300 font-semibold" : ""} />
        <Stat label="Running" value={st?.working ?? 0} tone={st?.working ? "text-accent dark:text-indigo-300 font-semibold" : ""} />
        <Stat label="Queued" value={(st?.queued ?? 0) + (st?.blocked ?? 0)} />
      </dl>
    </Link>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
      <dt>{label}</dt>
      <dd className={`tabular-nums ${tone || "text-zinc-700 dark:text-zinc-300"}`}>{value}</dd>
    </div>
  );
}

function RoomRow({ id, st, muted = false }: { id: RoomId; st?: RoomSnapshot; muted?: boolean }) {
  const r = ROOM_BY_ID[id];
  return (
    <Link to={`/room/${id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
      <span className={`grid h-8 w-8 place-items-center rounded-lg ${ROOM_TONE[id].tile}`}>
        <Icon name={ROOM_ICON[id]} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold ${muted ? "text-zinc-500 dark:text-zinc-400" : ""}`}>{ROOM_LABEL[id]}</div>
        <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{plain(r.blurb)}</div>
      </div>
      {muted ? (
        <span className="chip">Phase {r.phase}</span>
      ) : st?.needsYou ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{st.needsYou}</span>
      ) : (
        <Icon name="chevronRight" size={16} className="text-zinc-400" />
      )}
    </Link>
  );
}
