// 🎁 Bundle builder: pick finished products (or tap an idea), name it, choose the saving.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatGBP } from "../../lib/format";
import { FormatBadge } from "../../components/FormatBadge";
import { ArtImage } from "../../components/ArtImage";
import { ErrorNote, Section } from "../../components/ui";
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
    <Section title="Bundle builder" icon="🎁">
      {list.length < BUNDLE_MIN ? (
        <p className="text-sm text-cocoa dark:text-stone-400">
          Bundles sell your finished products together for less than buying them one by one. Once {BUNDLE_MIN} or more products have their files, listing and price done, they'll show up here.
        </p>
      ) : (
        <div className="space-y-3">
          {data!.ideas.length > 0 && (
            <div>
              <div className="label">💡 Bundle ideas</div>
              <div className="flex flex-wrap gap-2">
                {data!.ideas.map((i) => (
                  <button key={i.name} className="btn-soft text-left text-xs" onClick={() => useIdea(i)} title={i.why}>
                    🎁 {i.name} <span className="opacity-60">({i.ids.length})</span>
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
                    className={`flex items-center gap-2 rounded-xl p-2 text-left text-sm ring-2 ${on ? "bg-honey/25 ring-honey" : "bg-white ring-black/5 dark:bg-night-3 dark:ring-white/10"}`}
                  >
                    {c.cover ? <ArtImage imageKey={c.cover} className="h-12 w-16 shrink-0 rounded-md" /> : <span className="grid h-12 w-16 shrink-0 place-items-center rounded-md bg-black/5 text-xl">📦</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{c.title}</span>
                      <span className="flex items-center gap-1.5 text-xs">
                        <FormatBadge format={c.format} /> {formatGBP(c.pricePence)} {!c.live && <span className="opacity-60">· not launched yet</span>}
                      </span>
                    </span>
                    <span className="text-lg">{on ? "✅" : "⬜"}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {chosen.length >= BUNDLE_MIN && (
            <form
              className="space-y-2 rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]"
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
                  Saving vs buying separately: <b>{save}%</b>
                </span>
                <input type="range" className="w-full" min={10} max={50} step={5} value={save} onChange={(e) => setSave(Number(e.target.value))} />
              </label>
              <p className="text-sm">
                Separately: <b>{formatGBP(separate)}</b> · Bundle: about <b>{formatGBP(about)}</b>. Pricer rounds it and keeps it above your minimum profit. Keep the separate listings live so the saving stays true.
              </p>
              <button className="btn-primary w-full" disabled={name.trim().length < 3 || make.isPending}>
                {make.isPending ? "Making…" : `🎁 Make this bundle (${chosen.length} products)`}
              </button>
              <ErrorNote error={make.error} />
            </form>
          )}
          {done && <p className="rounded-xl bg-emerald-50 p-2 text-sm font-semibold dark:bg-emerald-900/25">✅ “{done}” is in the Print Studio. Open it there to build the bundle.</p>}
        </div>
      )}
    </Section>
  );
}
