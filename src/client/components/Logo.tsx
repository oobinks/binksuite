// The BinkSuite mark: a dark tile with a white B and an indigo dot. Same drawing as public/logo.svg.
export function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 128 128" width={size} height={size} className={className} role="img" aria-label="BinkSuite">
      <rect width="128" height="128" rx="30" className="fill-ink dark:fill-white" />
      <path className="fill-white dark:fill-ink" fillRule="evenodd" d={B} />
      <circle cx="96" cy="87" r="7" fill="#6366f1" />
    </svg>
  );
}

const B = "M43 38H65Q81 38 81 51.5Q81 60 74 63Q85 66 85 76.5Q85 90 67 90H43ZM54 48V58H64Q70 58 70 53Q70 48 64 48ZM54 67V80H66Q73 80 73 73.5Q73 67 66 67Z";
