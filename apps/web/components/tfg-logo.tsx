type TfgLogoProps = {
  compact?: boolean;
};

export function TfgLogo({ compact = false }: TfgLogoProps) {
  return (
    <span className={compact ? "tfg-logo tfg-logo--compact" : "tfg-logo"}>
      <svg
        aria-label="TFG"
        className="tfg-logo__mark"
        role="img"
        viewBox="0 0 48 48"
      >
        <path d="M7 9h34v8H28v22h-8V17H7V9Z" fill="currentColor" />
        <path d="M29 22h12v17H29v-7h5v-3h-5v-7Z" fill="currentColor" opacity=".72" />
      </svg>
      {!compact && <span className="tfg-logo__wordmark">TFG</span>}
    </span>
  );
}
