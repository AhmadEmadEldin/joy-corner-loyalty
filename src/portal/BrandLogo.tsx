type BrandLogoProps = {
  compact?: boolean;
  light?: boolean;
  markOnly?: boolean;
  showName?: boolean;
  stacked?: boolean;
};

export function BrandLogo({
  compact = false,
  light = true,
  markOnly = false,
  showName = false,
  stacked = false,
}: BrandLogoProps) {
  return (
    <span
      aria-label="Joy Corner Coffee"
      className={`joy-brand-lockup${compact ? " joy-brand-lockup--compact" : ""}${markOnly ? " joy-brand-lockup--mark-only" : ""}${stacked ? " joy-brand-lockup--stacked" : ""}${light ? " joy-brand-lockup--light" : ""}`}
      role="img"
    >
      <img
        alt=""
        decoding="async"
        fetchPriority={markOnly ? "high" : "auto"}
        height={markOnly ? 192 : undefined}
        src={markOnly
          ? "/assets/joy-corner-logo-mark-small.png"
          : "/assets/joy-corner-logo-white-wordmark.png"}
        width={markOnly ? 192 : undefined}
      />
      {showName ? <strong className="joy-brand-lockup__auth-name">Joy Corner Coffee</strong> : null}
    </span>
  );
}
