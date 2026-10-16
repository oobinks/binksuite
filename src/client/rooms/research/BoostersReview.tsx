// Analyst's brief, plus "boosters": ideas the agent came up with to make the product stronger.
import { useEffect, useState } from "react";
import type { ReviewDef } from "../shared/types";

interface Booster {
  id: string;
  kind: "slogan" | "art" | "bundle" | "listing";
  title: string;
  why: string;
  artHint?: string;
  listingHint?: string;
  slogans?: string[];
}

interface Out {
  productTitle: string;
  audience: string;
  style: string;
  palette: string[];
  boosters?: Booster[];
}

const KIND = {
  slogan: { icon: "💬", label: "Slogan" },
  art: { icon: "🎨", label: "Art twist" },
  bundle: { icon: "🎁", label: "Bundle" },
  listing: { icon: "🏷️", label: "Listing" },
};

export const boostersReview: ReviewDef = {
  approveLabel: "✨ Use these → Studio",
  rejectLabel: "🔁 Rethink the brief",
  startsReady: true,
  Body: ({ task, setData }) => {
    const o = task.output as unknown as Out;
    const boosters = o.boosters ?? [];
    const [on, setOn] = useState<Record<string, boolean>>({});
    const [slogan, setSlogan] = useState<Record<string, string>>(() =>
      Object.fromEntries(boosters.filter((b) => b.slogans?.length).map((b) => [b.id, b.slogans![0]])),
    );
    const [custom, setCustom] = useState("");

    useEffect(() => {
      setData({
        chosen: boosters.filter((b) => on[b.id]).map((b) => ({ id: b.id, slogan: b.kind === "slogan" ? slogan[b.id] : undefined })),
        custom: custom.trim() || undefined,
      });
    }, [on, slogan, custom, boosters, setData]);

    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
          <div className="text-lg font-black">{o.productTitle}</div>
          <div className="text-sm text-cocoa dark:text-stone-400">
            For {o.audience} · {o.style}
          </div>
          {o.palette.length > 0 && (
            <div className="mt-2 flex gap-1" aria-label="Colour palette">
              {o.palette.map((c) => (
                <span key={c} className="h-6 w-6 rounded-full ring-1 ring-black/10" style={{ background: c }} title={c} />
              ))}
            </div>
          )}
        </div>

        {boosters.length === 0 ? (
          <p className="text-sm">The Analyst didn't pitch any boosters this time. Add your own idea below if you like.</p>
        ) : (
          <div>
            <h4 className="font-black">✨ The Analyst has ideas to make this stronger</h4>
            <p className="mb-2 text-sm text-cocoa dark:text-stone-400">Switch on the ones you like. The Designer and Copywriter will use them.</p>
            <ul className="space-y-2">
              {boosters.map((b) => {
                const active = !!on[b.id];
                return (
                  <li key={b.id} className={`rounded-xl p-3 ring-2 transition ${active ? "bg-honey/15 ring-honey" : "ring-black/5 dark:ring-white/10"}`}>
                    <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setOn((s) => ({ ...s, [b.id]: !s[b.id] }))} aria-pressed={active}>
                      <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-sm font-black ${active ? "bg-honey text-ink" : "bg-black/10 dark:bg-white/10"}`}>
                        {active ? "✓" : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <b>{b.title}</b>
                          <span className="chip">
                            {KIND[b.kind].icon} {KIND[b.kind].label}
                          </span>
                        </span>
                        <span className="block text-sm text-cocoa dark:text-stone-400">{b.why}</span>
                        {b.artHint && <span className="block text-xs italic">🎨 {b.artHint}</span>}
                        {b.listingHint && <span className="block text-xs italic">🏷️ {b.listingHint}</span>}
                      </span>
                    </button>
                    {b.kind === "slogan" && active && (
                      <div className="mt-2 space-y-1.5 pl-9">
                        <div className="flex flex-wrap gap-1.5">
                          {b.slogans?.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setSlogan((x) => ({ ...x, [b.id]: s }))}
                              className={`chip py-1 ${slogan[b.id] === s ? "bg-ink text-cream dark:bg-honey dark:text-night" : ""}`}
                            >
                              “{s}”
                            </button>
                          ))}
                        </div>
                        <input
                          className="input"
                          value={slogan[b.id] ?? ""}
                          maxLength={60}
                          onChange={(e) => setSlogan((x) => ({ ...x, [b.id]: e.target.value }))}
                          aria-label="Slogan wording"
                        />
                        <p className="text-xs text-cocoa dark:text-stone-400">The Printer adds this as real text on your print files, so it's always spelled right.</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <label className="block">
          <span className="label">💡 Your own idea (optional)</span>
          <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={300} placeholder="e.g. add a tiny snail hiding in each print" />
        </label>
      </div>
    );
  },
};
