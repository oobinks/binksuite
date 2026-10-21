import { DemoArt } from "./DemoArt";
import { useImageSrc } from "../lib/files";

/** Shows real generated art (from R2) or, for demo products, the seeded demo art. */
export function ArtImage({ imageKey, seed, className = "", label, zoom = true }: { imageKey?: string | null; seed?: number; className?: string; label?: string; zoom?: boolean }) {
  const { data: src, isError } = useImageSrc(imageKey);
  if (!imageKey) return <DemoArt seed={seed ?? 1} className={className} label={label} />;
  if (isError) return <div className={`grid place-items-center bg-black/5 text-xs ${className}`}>Couldn't load</div>;
  if (!src) return <div className={`animate-pulse bg-black/10 dark:bg-white/10 ${className}`} aria-label="Loading image" />;
  // data-zoom: click to see it large (components/Lightbox).
  return <img src={src} alt={label ?? "Generated artwork"} className={`object-cover ${className} ${zoom ? "cursor-zoom-in" : ""}`} draggable={false} data-zoom={zoom ? "" : undefined} />;
}
