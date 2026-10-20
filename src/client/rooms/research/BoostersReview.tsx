// Analyst's brief, plus "boosters": ideas the agent came up with to make the product stronger.
import { useEffect, useState } from "react";
import type { ReviewDef } from "../shared/types";
import { FormatBadge } from "../../components/FormatBadge";
import { Icon } from "../../components/Icon";
import { plain } from "../../lib/format";
import { SheetPreview } from "../shared/SheetPreview";
import type { SheetSpec } from "../../../shared/sheetSpec";
import type { ProductFormat } from "../../../shared/format";

interface Booster {
  id: string;
  kind: "slogan" | "art" | "bundle" | "listing" | "feature";
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
  format?: ProductFormat;
  sheet?: SheetSpec;
  included?: string;
}

const KIND = {
  slogan: { label: "Slogan" },
  art: { label: "Art twist" },
  bundle: { label: "Bundle" },
  listing: { label: "Listing" },
  feature: { label: "Extra feature" },
};

export const boostersReview: ReviewDef = {
  approveLabel: "Use these → Studio",
  rejectLabel: "Rethink the brief",
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
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{o.productTitle}</span>
            <FormatBadge format={o.format ?? task.productFormat} />
          </div>
          <div className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            For {o.audience} · {o.style}
          </div>
          {o.palette.length > 0 && (
            <div className="mt-2 flex gap-1" aria-label="Colour palette">
              {o.palette.map((c) => (
                <span key={c} className="h-5 w-5 rounded-md ring-1 ring-black/10 dark:ring-white/15" style={{ background: c }} title={c} />
              ))}
            </div>
          )}
          {o.included && <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300"><span className="font-medium">Included:</span> {plain(o.included)}</div>}
        </div>
        {o.sheet && <SheetPreview spec={o.sheet} />}

        {boosters.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">The Analyst didn't pitch any boosters this time. Add your own idea below if you like.</p>
        ) : (
          <div>
            <h4 className="text-sm font-semibold">The Analyst has ideas to make this stronger</h4>
            <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
              Switch on the ones you like. {o.sheet ? "Extra features are added to the design before the Printer builds it." : "The Designer and Copywriter will use them."}
            </p>
            <ul className="space-y-2">
              {boosters.map((b) => {
                const active = !!on[b.id];
                return (
                  <li key={b.id} className={`rounded-lg border p-3 transition ${active ? "border-indigo-300 bg-indigo-50/50 dark:border-indigo-500/40 dark:bg-indigo-500/[0.06]" : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20"}`}>
                    <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setOn((s) => ({ ...s, [b.id]: !s[b.id] }))} aria-pressed={active}>
                      <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition ${active ? "border-accent bg-accent text-white dark:border-indigo-500 dark:bg-indigo-500" : "border-zinc-300 bg-white dark:border-white/20 dark:bg-transparent"}`} aria-hidden>
                        {active && <Icon name="check" size={12} strokeWidth={2.5} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{plain(b.title)}</span>
                          <span className="chip">
                            {KIND[b.kind].label}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-sm text-zinc-500 dark:text-zinc-400">{plain(b.why)}</span>
                        {b.artHint && <span className="mt-1 block text-xs text-zinc-600 dark:text-zinc-300"><span className="font-medium">{b.kind === "feature" ? "Feature:" : "Art:"}</span> {plain(b.artHint)}</span>}
                        {b.listingHint && <span className="mt-1 block text-xs text-zinc-600 dark:text-zinc-300"><span className="font-medium">Listing:</span> {plain(b.listingHint)}</span>}
                      </span>
                    </button>
                    {b.kind === "slogan" && active && (
                      <div className="mt-3 space-y-2 pl-7">
                        <div className="flex flex-wrap gap-1.5">
                          {b.slogans?.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setSlogan((x) => ({ ...x, [b.id]: s }))}
                              className={`chip py-1 ${slogan[b.id] === s ? "!border-indigo-300 !bg-indigo-50 !text-indigo-700 dark:!border-indigo-500/40 dark:!bg-indigo-500/10 dark:!text-indigo-300" : ""}`}
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
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">The Printer adds this as real text on your print files, so it's always spelled right.</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <label className="block">
          <span className="label">Your own idea (optional)</span>
          <input
            className="input"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            maxLength={300}
            placeholder={o.sheet ? "e.g. add a tab for Christmas cards with a Sent? tick box" : "e.g. add a tiny snail hiding in each print"}
          />
        </label>
      </div>
    );
  },
};
