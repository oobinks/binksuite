// The BinkSuite "B coin" logo. Same drawing as public/logo.svg (favicon / home-screen icon).
export function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 128 128" width={size} height={size} className={className} role="img" aria-label="BinkSuite">
      <defs>
        <linearGradient id="bs-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe066" />
          <stop offset=".55" stopColor="#f5bd1f" />
          <stop offset="1" stopColor="#d9930f" />
        </linearGradient>
      </defs>
      <circle cx="64" cy="68" r="54" fill="#b8790c" />
      <circle cx="64" cy="64" r="54" fill="url(#bs-gold)" />
      <circle cx="64" cy="64" r="45" fill="none" stroke="#fff2a8" strokeWidth="3" />
      <circle cx="64" cy="64" r="39" fill="#f0b21a" />
      <path transform="translate(2 3)" fill="#7a4b12" fillRule="evenodd" d={B} />
      <path fill="#fff6cc" fillRule="evenodd" d={B} />
      <path d="M30 34 Q40 22 56 18" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".7" />
      <path d="M104 96 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#fff" />
    </svg>
  );
}

const B = "M43 38H65Q81 38 81 51.5Q81 60 74 63Q85 66 85 76.5Q85 90 67 90H43ZM54 48V58H64Q70 58 70 53Q70 48 64 48ZM54 67V80H66Q73 80 73 73.5Q73 67 66 67Z";
