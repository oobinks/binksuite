// Marketing: Promoter makes Pinterest pins and plans posts. Drafts only; you post them yourself.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { ErrorNote, Section } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { PinCard } from "./PinCard";
import { ContentCalendar } from "./ContentCalendar";
import type { MarketingResp } from "./types";

export function MarketingRoom() {
  const { data, error } = useQuery({
    queryKey: ["marketing"],
    queryFn: () => api.get<MarketingResp>("/marketing"),
    // Check more often while something waits on Claude's session.
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && (d.calendar?.pendingRev != null || d.products.some((p) => p.pins.pendingRev != null)) ? 15_000 : 120_000;
    },
  });
  const [openId, setOpenId] = useState<string | null>(null);

  if (error) return <ErrorNote error={error} />;
  if (!data) return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>;

  if (!data.products.length)
    return (
      <Section title="Pinterest pins" collapsible={false}>
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
            <Icon name="marketing" size={20} />
          </span>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Nothing to promote yet</p>
          <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
            Your products appear here once they have a listing and listing photos. Then Promoter can make Pinterest pins and plan a week of posts.
          </p>
        </div>
      </Section>
    );

  const open = openId ?? data.products[0].id;
  const pinned = data.products.filter((p) => p.pins.pinnedAt).length;
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">
        <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
        <span>BinkSuite doesn't post to Pinterest. Download the pin and add it on Pinterest. The calendar captions are drafts too: you post them yourself.</span>
      </p>

      <Section title="Pinterest pins" right={<span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{pinned}/{data.products.length} pinned</span>}>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">Pick a product. Each pin is 1000 × 1500 px, the shape Pinterest likes best.</p>
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
          {data.products.map((p) => (
            <PinCard key={p.id} product={p} open={open === p.id} onToggle={() => setOpenId(open === p.id ? "" : p.id)} />
          ))}
        </ul>
      </Section>

      <ContentCalendar calendar={data.calendar} />
    </div>
  );
}
