// A photo-style mockup (drawn on your device by lib/mockup), with an optional save button.
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { SCENES, type MockupView } from "../../shared/mockupScenes";

export function PhotoMockup({ view, save }: { view: MockupView; save?: string }) {
  const { data: url, isError } = useQuery({
    queryKey: ["mockup", view.scene, view.bgKey, view.imageKey, view.slogan],
    queryFn: async () => URL.createObjectURL(await (await import("../lib/mockup")).mockupBlob(view)),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });
  useEffect(() => () => void (url && setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000)), [url]);
  const label = SCENES[view.scene]?.label ?? view.scene;
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black/5 dark:bg-white/5">
      {url ? (
        <img src={url} alt={`${label} mockup`} className="h-full w-full cursor-zoom-in object-cover" draggable={false} data-zoom="" />
      ) : (
        <div className="grid h-full place-items-center text-xs text-cocoa">{isError ? "Couldn't draw this one" : <span className="animate-pulse">Staging the {label.toLowerCase()}…</span>}</div>
      )}
      <span className="chip absolute left-2 top-2 bg-white/85 text-ink">{label}</span>
      {!view.bgKey && <span className="chip absolute bottom-2 left-2 bg-white/85 text-[10px] text-ink" title="Free AI was busy, so a plain backdrop was used">plain backdrop</span>}
      {save && url && (
        <a href={url} download={save} className="chip absolute bottom-2 right-2 bg-white/90 font-bold text-ink">
          ⬇️ save
        </a>
      )}
    </div>
  );
}
