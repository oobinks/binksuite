// The demo image provider's "art": a deterministic, cosy SVG drawn from a seed.
// Real images (Phase 2) come from R2 instead.
import { mulberry32, pick } from "../../shared/rng";
import { ArtImage } from "./ArtImage";

const PALETTES = [
  ["#c8643b", "#e9a96b", "#7a5c3e", "#f3dcc0", "#5b6b3a"],
  ["#9cb59a", "#e8e1d0", "#6d8b74", "#f6efe4", "#c7a27c"],
  ["#e4572e", "#f3a712", "#29335c", "#f0e6d2", "#669bbc"],
  ["#f4acb7", "#ffcad4", "#9d8189", "#d8e2dc", "#ffe5d9"],
  ["#3d4a3d", "#7d8b6a", "#c2b280", "#2b2d42", "#a3a380"],
  ["#c44536", "#7ca5b8", "#e6d5b8", "#4f6d7a", "#dd9c4f"],
];

export function DemoArt({ seed, palette, className = "", label }: { seed: number; palette?: string[]; className?: string; label?: string }) {
  const rng = mulberry32(seed);
  const p = palette && palette.length >= 4 ? palette : pick(rng, PALETTES);
  const kind = Math.floor(rng() * 3);
  const bg = p[3];
  return (
    <svg viewBox="0 0 120 150" className={className} role="img" aria-label={label ?? "Demo artwork"}>
      <rect width="120" height="150" fill={bg} />
      {kind === 0 && (
        <>
          {/* rolling hills + sun */}
          <circle cx={30 + rng() * 60} cy={40 + rng() * 15} r={14 + rng() * 8} fill={p[1]} />
          <path d={`M0 ${95 + rng() * 10} Q30 ${70 + rng() * 15} 60 ${92} T120 ${85 + rng() * 10} V150 H0 Z`} fill={p[4] ?? p[2]} />
          <path d={`M0 ${115} Q40 ${95 + rng() * 10} 80 ${112} T120 ${108} V150 H0 Z`} fill={p[0]} />
          <path d={`M0 132 Q60 118 120 130 V150 H0 Z`} fill={p[2]} />
        </>
      )}
      {kind === 1 && (
        <>
          {/* botanical stems */}
          {Array.from({ length: 3 }, (_, i) => {
            const x = 30 + i * 30;
            const c = p[i % 3 === 1 ? 4 : 0] ?? p[0];
            return (
              <g key={i}>
                <path d={`M${x} 140 Q${x + (rng() - 0.5) * 20} 90 ${x} ${40 + rng() * 20}`} stroke={p[2]} strokeWidth="2" fill="none" />
                {Array.from({ length: 4 }, (_, j) => (
                  <ellipse key={j} cx={x + (j % 2 ? 7 : -7)} cy={60 + j * 18} rx="8" ry="4" fill={c} transform={`rotate(${j % 2 ? -30 : 30} ${x + (j % 2 ? 7 : -7)} ${60 + j * 18})`} />
                ))}
              </g>
            );
          })}
        </>
      )}
      {kind === 2 && (
        <>
          {/* mid-century shapes */}
          <rect x="18" y="22" width="84" height="106" rx="42" fill={p[1]} />
          <circle cx={45 + rng() * 30} cy={60 + rng() * 30} r="22" fill={p[0]} />
          <rect x="30" y="100" width="60" height="10" rx="5" fill={p[2]} />
          <path d="M20 30 L50 30 L20 60 Z" fill={p[4] ?? p[2]} opacity="0.8" />
        </>
      )}
      <rect x="4" y="4" width="112" height="142" fill="none" stroke="white" strokeOpacity="0.5" strokeWidth="2" />
    </svg>
  );
}

export function Mockup({ scene, seed, palette, imageKey, slogan }: { scene: string; seed: number; palette?: string[]; imageKey?: string | null; slogan?: string | null }) {
  const Art = ({ s, className }: { s: number; className: string }) =>
    imageKey ? <ArtImage imageKey={imageKey} className={className} /> : <DemoArt seed={s} palette={palette} className={className} />;
  const wall = scene === "desk" ? "#efe6da" : scene === "tablet" ? "#d9e2ec" : scene === "gallery" ? "#f4efe9" : "#e9e1d6";
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl" style={{ background: wall }}>
      {scene === "tablet" ? (
        <div className="absolute inset-[14%_22%] rounded-[10px] bg-stone-800 p-1.5 shadow-lg">
          <Art s={seed} className="h-full w-full rounded-md object-cover" />
        </div>
      ) : scene === "gallery" ? (
        <div className="absolute inset-[12%_10%] flex items-center justify-center gap-[5%]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[80%] w-[28%] border-4 border-stone-700 bg-white p-[3%] shadow-md">
              <Art s={seed + i} className="h-full w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className={`absolute ${scene === "desk" ? "inset-[8%_32%_30%]" : "inset-[10%_30%_18%]"} border-[6px] border-amber-900/80 bg-white p-[4%] shadow-xl`}>
          <Art s={seed} className={slogan ? "h-[82%] w-full" : "h-full w-full"} />
          {slogan && <div className="truncate pt-[2%] text-center text-[clamp(6px,1.4vw,11px)] font-black text-ink">{slogan}</div>}
        </div>
      )}
      {scene === "desk" && <div className="absolute inset-x-0 bottom-0 h-[24%] bg-amber-800/70" />}
      {scene === "desk" && <span className="absolute bottom-[18%] right-[10%] text-2xl">🌿</span>}
      {scene === "frame" && <span className="absolute bottom-[4%] left-[8%] text-2xl">🛋️</span>}
      <span className="chip absolute left-2 top-2 bg-white/80 capitalize text-ink">{scene}</span>
    </div>
  );
}
