type BrandLogoProps = {
  compact?: boolean;
  light?: boolean;
  stacked?: boolean;
};

export function BrandLogo({
  compact = false,
  light = true,
  stacked = false,
}: BrandLogoProps) {
  return (
    <span
      aria-label="Joy Corner Coffee and Story"
      className={`joy-brand-lockup${compact ? " joy-brand-lockup--compact" : ""}${stacked ? " joy-brand-lockup--stacked" : ""}${light ? " joy-brand-lockup--light" : ""}`}
      role="img"
    >
      <img alt="" src="/assets/joy-corner-emblem-v2.png" />
      <span>
        <strong>JOY CORNER</strong>
        <small>COFFEE &amp; STORY</small>
        {!compact ? <em>EST. 2016</em> : null}
      </span>
    </span>
  );
}
