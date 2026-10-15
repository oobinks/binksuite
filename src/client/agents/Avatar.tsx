// Hand-built SVG agents. Every character is drawn from its `look` in the registry.
import type { AgentDef } from "../../shared/registry";
import type { AgentStatus } from "../../shared/tasks";

interface Props {
  agent: AgentDef;
  status?: AgentStatus;
  size?: number;
  showProp?: boolean;
  className?: string;
}

export function Avatar({ agent, status = "idle", size = 56, showProp = true, className = "" }: Props) {
  const { look } = agent;
  const anim =
    status === "working" ? "anim-busy" : status === "needs_you" ? "anim-bob" : status === "off" || status === "blocked" ? "" : "anim-bob";
  const dim = status === "off" ? "opacity-50 grayscale" : "";
  const sleepy = status === "off" || status === "idle";
  return (
    <div className={`relative inline-block ${className}`} style={{ width: size, height: size * 1.12 }} aria-label={`${agent.name}, ${agent.role}`} role="img">
      <svg viewBox="0 0 64 72" width={size} height={size * 1.12} className={`${anim} ${dim} overflow-visible`}>
        {/* shadow */}
        <ellipse cx="32" cy="69" rx="17" ry="3" fill="black" opacity="0.12" />
        {/* body */}
        <path d="M14 70 Q14 46 32 46 Q50 46 50 70 Z" fill={look.shirt} />
        <path d="M26 47 L32 54 L38 47" fill="none" stroke="white" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
        {look.accessory === "bowtie" && <path d="M27 50 L32 53 L37 50 L37 56 L32 53 L27 56 Z" fill="#e0607e" />}
        {look.accessory === "scarf" && <path d="M20 47 Q32 54 44 47 L44 51 Q32 58 20 51 Z M38 51 L41 61 L36 60 Z" fill="#f2b35b" />}
        {look.accessory === "badge" && <circle cx="40" cy="57" r="3.2" fill="#ffd166" stroke="#c99a2e" strokeWidth="1" />}
        {/* neck + head */}
        <rect x="28" y="40" width="8" height="8" rx="3" fill={look.skin} />
        {look.hairStyle === "long" && <path d="M14 30 Q14 8 32 8 Q50 8 50 30 L50 46 Q44 42 44 34 L20 34 Q20 42 14 46 Z" fill={look.hair} />}
        <circle cx="32" cy="27" r="15" fill={look.skin} />
        {/* ears */}
        <circle cx="17.5" cy="28" r="3" fill={look.skin} />
        <circle cx="46.5" cy="28" r="3" fill={look.skin} />
        <Hair style={look.hairStyle} color={look.hair} />
        {/* face */}
        {sleepy && status === "off" ? (
          <>
            <path d="M24 29 q3 2 6 0" stroke="#3b2f2a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <path d="M34 29 q3 2 6 0" stroke="#3b2f2a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="26.5" cy="28" r="2.2" fill="#3b2f2a" />
            <circle cx="37.5" cy="28" r="2.2" fill="#3b2f2a" />
            <circle cx="27.2" cy="27.3" r="0.7" fill="white" />
            <circle cx="38.2" cy="27.3" r="0.7" fill="white" />
          </>
        )}
        <circle cx="23" cy="33" r="2.6" fill="#ff8fa3" opacity="0.45" />
        <circle cx="41" cy="33" r="2.6" fill="#ff8fa3" opacity="0.45" />
        {status === "blocked" ? (
          <path d="M28 36 q4 -3 8 0" stroke="#3b2f2a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        ) : status === "needs_you" || status === "done" ? (
          <path d="M27 34 q5 5 10 0 Z" fill="#3b2f2a" />
        ) : (
          <path d="M28 35 q4 3 8 0" stroke="#3b2f2a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        )}
        {look.accessory === "glasses" && (
          <g stroke="#3b2f2a" strokeWidth="1.4" fill="white" fillOpacity="0.2">
            <circle cx="26.5" cy="28" r="4.3" />
            <circle cx="37.5" cy="28" r="4.3" />
            <path d="M30.8 28 h2.4" />
          </g>
        )}
        {look.accessory === "monocle" && (
          <g stroke="#c99a2e" strokeWidth="1.4" fill="white" fillOpacity="0.25">
            <circle cx="37.5" cy="28" r="4.6" />
            <path d="M42 30 Q45 40 41 46" fill="none" />
          </g>
        )}
        {look.accessory === "headset" && (
          <g stroke="#3b2f2a" strokeWidth="2" fill="none">
            <path d="M16 28 Q16 10 32 10 Q48 10 48 28" />
            <rect x="13.5" y="25" width="5" height="8" rx="2" fill="#3b2f2a" />
            <path d="M16 33 Q18 38 25 37" />
          </g>
        )}
        {/* waving hand when it needs you */}
        {status === "needs_you" && (
          <g className="anim-wave" style={{ transformBox: "fill-box" }}>
            <path d="M48 58 L56 44" stroke={look.shirt} strokeWidth="6" strokeLinecap="round" />
            <circle cx="56.5" cy="42.5" r="3.6" fill={look.skin} />
          </g>
        )}
      </svg>
      {showProp && (
        <span className="pointer-events-none absolute -right-1 bottom-0 text-[0.42em] drop-shadow-sm" style={{ fontSize: size * 0.3 }}>
          {status === "working" ? <span className="anim-spin inline-block">⚙️</span> : agent.look.prop}
        </span>
      )}
      {status === "off" && (
        <span className="absolute -top-1 right-0 text-xs font-black text-cocoa/70" style={{ fontSize: size * 0.22 }}>
          z
        </span>
      )}
    </div>
  );
}

function Hair({ style, color }: { style: AgentDef["look"]["hairStyle"]; color: string }) {
  switch (style) {
    case "bob":
      return <path d="M16 30 Q15 11 32 11 Q49 11 48 30 Q46 22 40 19 Q32 24 22 20 Q17 24 16 30 Z" fill={color} />;
    case "spiky":
      return <path d="M17 24 L20 12 L25 18 L29 9 L33 17 L38 9 L40 18 L46 12 L47 25 Q40 18 32 19 Q24 18 17 24 Z" fill={color} />;
    case "bun":
      return (
        <g fill={color}>
          <circle cx="32" cy="9" r="6" />
          <path d="M17 26 Q16 12 32 12 Q48 12 47 26 Q42 18 32 18 Q22 18 17 26 Z" />
        </g>
      );
    case "curly":
      return (
        <g fill={color}>
          {[18, 23, 28, 33, 38, 43, 46].map((x, i) => (
            <circle key={x} cx={x} cy={i % 2 ? 14 : 17} r="5.5" />
          ))}
          <circle cx="17" cy="23" r="4" />
          <circle cx="47" cy="23" r="4" />
        </g>
      );
    case "long":
      return <path d="M17 25 Q16 11 32 11 Q48 11 47 25 Q40 17 32 17 Q24 17 17 25 Z" fill={color} />;
    case "cap":
      return (
        <g>
          <path d="M16 24 Q16 10 32 10 Q48 10 48 24 Z" fill={color} />
          <path d="M44 22 Q54 22 56 25 L44 25 Z" fill={color} />
          <circle cx="32" cy="10.5" r="1.8" fill="white" opacity="0.6" />
        </g>
      );
    case "beret":
      return (
        <g>
          <ellipse cx="31" cy="15" rx="17" ry="7" fill={color} transform="rotate(-8 31 15)" />
          <circle cx="30" cy="8" r="1.8" fill={color} />
        </g>
      );
    case "bald":
    default:
      return <path d="M19 20 Q32 12 45 20" stroke={color} strokeWidth="2" fill="none" opacity="0.5" />;
  }
}
