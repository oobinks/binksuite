// Bundle builder: pick finished products (or tap an idea), name it, choose the saving.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatGBP } from "../../lib/format";
import { FormatBadge } from "../../components/FormatBadge";
import { ArtImage } from "../../components/ArtImage";
import { ErrorNote, Section } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { BUNDLE_MAX, BUNDLE_MIN, BUNDLE_SAVE_DEFAULT, separatePrice, type BundleCandidate, type BundleIdea } from "../../../shared/bundle";

export function BundleBuilder() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["bundles"], queryFn: () => api.get<{ candidates: BundleCandidate[]; ideas: BundleIdea[] }>("/bundles") });
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [theme, setTheme] = useState<string | undefined>();
  const [save, setSave] = useState(BUNDLE_SAVE_DEFAULT);
  const [done, setDone] = useState<string | null>(null);
  const make = useMutation({
    mutationFn: () => api.post<{ productId: string }>("/bundles", { name: name.trim(), ids: picked, savePercent: save, theme }),
    onSuccess: () => {
      setDone(name.trim());
      setPicked([]);
      setName("");
      setTheme(undefined);
      qc.invalidateQueries();
    },
  });

  const list = data?.candidates ?? [];
  const chosen = list.filter((c) => picked.includes(c.id));
  const separate = separatePrice(chosen);
  const about = Math.round(separate * (1 - save / 100));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < BUNDLE_MAX ? [...p, id] : p));
  const useIdea = (i: BundleIdea) => {
    setPicked(i.ids);
    setName(i.name);
    setTheme(i.theme);
    setDone(null);
  };

  return (
    <Section title="Bundle builder">
      {list.length < BUNDLE_MIN ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Bundles sell your finished products together for less than buying them one by one. Once {BUNDLE_MIN} or more products have their files, listing and price done, they'll show up here.
        </p>
      ) : (
        <div className="space-y-3">
          {data!.ideas.length > 0 && (
            <div>
              <div className="label">Bundle ideas</div>
              <div className="flex flex-wrap gap-2">
                {data!.ideas.map((i) => (
                  <button key={i.name} className="btn-soft text-left text-xs" onClick={() => useIdea(i)} title={i.why}>
                    {i.name} <span className="text-zinc-400 tabular-nums">({i.ids.length})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="label">
              Pick {BUNDLE_MIN}–{BUNDLE_MAX} products ({picked.length} picked)
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {list.map((c) => {
                const on = picked.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    aria-pressed={on}
                    className={`flex items-center gap-3 rounded-lg border p-2 text-left text-sm transition ${on ? "border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/40 dark:bg-indigo-500/10" : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-white/10 dark:bg-night-3 dark:hover:border-white/20"}`}
                  >
                    {c.cover ? <ArtImage imageKey={c.cover} className="h-12 w-16 shrink-0 rounded-md" /> : <span className="grid h-12 w-16 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-400 dark:bg-white/[0.06]"><Icon name="orders" size={18} /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.title}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                        <FormatBadge format={c.format} /> <span className="tabular-nums">{formatGBP(c.pricePence)}</span> {!c.live && <span className="text-zinc-400">· not launched yet</span>}
                      </span>
                    </span>
                    <span
                      className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded border ${on ? "border-accent bg-accent text-white dark:border-indigo-500 dark:bg-indigo-500" : "border-zinc-300 bg-white dark:border-white/20 dark:bg-transparent"}`}
                      aria-hidden
                    >
                      {on && <Icon name="check" size={12} strokeWidth={2.5} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {chosen.length >= BUNDLE_MIN && (
            <form
              className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.03]"
              onSubmit={(e) => {
                e.preventDefault();
                make.mutate();
              }}
            >
              <label className="block">
                <span className="label">Bundle name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Budget Bundle" maxLength={80} />
              </label>
              <label className="block">
                <span className="label">
                  Saving vs buying separately: <span className="text-zinc-900 tabular-nums dark:text-zinc-100">{save}%</span>
                </span>
                <input type="range" className="w-full accent-indigo-600" min={10} max={50} step={5} value={save} onChange={(e) => setSave(Number(e.target.value))} />
              </label>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Separately: <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-100">{formatGBP(separate)}</span> · Bundle: about <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-100">{formatGBP(about)}</span>. Pricer rounds it and keeps it above your minimum profit. Keep the separate listings live so the saving stays true.
              </p>
              <button className="btn-primary w-full" disabled={name.trim().length < 3 || make.isPending}>
                {make.isPending ? "Making…" : `Make this bundle (${chosen.length} products)`}
              </button>
              <ErrorNote error={make.error} />
            </form>
          )}
          {done && (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              <Icon name="check" size={15} className="shrink-0" />
              “{done}” is in the Print Studio. Open it there to build the bundle.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
