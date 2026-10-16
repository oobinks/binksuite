import { DemoArt } from "./DemoArt";
import { useImageSrc } from "../lib/files";

/** Shows real generated art (from R2) or, for demo products, the seeded demo art. */
export function ArtImage({ imageKey, seed, className = "", label }: { imageKey?: string | null; seed?: number; className?: string; label?: string }) {
  const { data: src, isError } = useImageSrc(imageKey);
  if (!imageKey) return <DemoArt seed={seed ?? 1} className={className} label={label} />;
  if (isError) return <div className={`grid place-items-center bg-black/5 text-xs ${className}`}>Couldn't load</div>;
  if (!src) return <div className={`animate-pulse bg-black/10 dark:bg-white/10 ${className}`} aria-label="Loading image" />;
  return <img src={src} alt={label ?? "Generated artwork"} className={`object-cover ${className}`} draggable={false} />;
}
