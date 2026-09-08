import { useId } from "react";

type TfgLogoProps = {
  compact?: boolean;
};

export function TfgLogo({ compact = false }: TfgLogoProps) {
  const gradientId = useId();
  return (
    <span className={compact ? "tfg-logo tfg-logo--compact" : "tfg-logo"}>
      <svg
        aria-label="TFG"
        className="tfg-logo__mark"
        role="img"
        viewBox="0 0 48 48"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--secondary)" />
          </linearGradient>
        </defs>
        <path d="M7 9h34v8H28v22h-8V17H7V9Z" fill="currentColor" />
        <path d="M29 22h12v17H29v-7h5v-3h-5v-7Z" fill="currentColor" opacity=".72" />
        <path d="M8 43h32" stroke={`url(#${gradientId})`} strokeWidth="3" strokeLinecap="round" />
      </svg>
      {!compact && <span className="tfg-logo__wordmark">TFG</span>}
    </span>
  );
}
