import { useEffect, useState } from "react";

type ProductImageProps = {
  alt: string;
  className?: string;
  positionX?: number;
  positionY?: number;
  size?: "sm" | "md" | "lg";
  src?: string | null;
  zoom?: number;
};

const SIZE_MAP = {
  lg: { height: 280, width: 380 },
  md: { height: 180, width: 240 },
  sm: { height: 100, width: 130 },
};

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" fill="none"><rect width="80" height="80" rx="12" fill="#1A120C"/><path d="M27 48h24a8 8 0 0 1-8 8h-8a8 8 0 0 1-8-8Z" stroke="#D6A756" stroke-width="2"/><path d="M51 49h3a5 5 0 0 0 0-10h-3" stroke="#D6A756" stroke-width="2"/><path d="M31 27c0 3 3 3 3 6s-3 3-3 6M40 24c0 3 3 3 3 6s-3 3-3 6M48 27c0 3 3 3 3 6" stroke="#B9783D" stroke-width="2" stroke-linecap="round"/></svg>`;

const PLACEHOLDER_BACKGROUND =
  "radial-gradient(circle at 50% 35%, #342219, #0f0a07)";

export function ProductImage({
  alt,
  className,
  positionX = 50,
  positionY = 50,
  size = "md",
  src,
  zoom = 1,
}: ProductImageProps) {
  const [state, setState] = useState<"error" | "idle" | "loaded" | "loading">(
    src ? "loading" : "idle",
  );

  useEffect(() => {
    setState(src ? "loading" : "idle");
  }, [src]);

  const dims = SIZE_MAP[size];
  const x = Math.max(0, Math.min(100, positionX));
  const y = Math.max(0, Math.min(100, positionY));
  const z = Math.max(1, Math.min(2.5, zoom));
  const isBrandedCup = Boolean(src?.includes("joy-cold-cup") || src?.includes("joy-hot-cup"));

  const wrapperStyle: React.CSSProperties = {
    "--img-x": `${x}%`,
    "--img-y": `${y}%`,
    "--img-zoom": z,
    height: dims.height,
    width: dims.width,
  } as React.CSSProperties;

  if (!src || state === "idle") {
    return (
      <div
        aria-label={alt}
        className={`product-image-placeholder ${className || ""}`}
        role="img"
        style={{
          ...wrapperStyle,
          alignItems: "center",
          aspectRatio: "4 / 3",
          background: PLACEHOLDER_BACKGROUND,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <img
          alt=""
          aria-hidden="true"
          src={`data:image/svg+xml,${encodeURIComponent(PLACEHOLDER_SVG)}`}
          style={{ height: 56, objectFit: "contain", width: 56 }}
        />
        <span
          style={{
            color: "#e9ddcc",
            fontSize: 12,
            fontWeight: 600,
            maxWidth: "80%",
            overflow: "hidden",
            textAlign: "center",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {alt}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`product-image-wrap ${className || ""}`}
      style={wrapperStyle}
    >
      {state === "loading" ? (
        <div
          aria-hidden="true"
          style={{
            animation: "kiosk-pulse 1.4s ease-in-out infinite",
            background:
              "linear-gradient(110deg, #1a100b 20%, #38251a 40%, #1a100b 60%)",
            backgroundSize: "220% 100%",
            height: "100%",
            position: "absolute",
            width: "100%",
          }}
        />
      ) : null}
      <img
        alt={alt}
        decoding="async"
        loading="lazy"
        onError={() => setState("error")}
        onLoad={() => setState("loaded")}
        src={state === "error" ? undefined : src}
        style={{
          height: "100%",
          objectFit: "cover",
          objectPosition: "var(--img-x) var(--img-y)",
          position: state === "loading" ? "absolute" : undefined,
          transform: `scale(var(--img-zoom, 1))`,
          transition: "transform 180ms ease",
          width: "100%",
        }}
      />
      {isBrandedCup && state !== "error" ? (
        <span className="cold-cup-brand" aria-hidden="true">
          <img alt="" src="/assets/brand/joy-corner-logo-black-transparent-v1.png" />
        </span>
      ) : null}
      {state === "error" ? (
        <div
          aria-label={alt}
          style={{
            alignItems: "center",
            background: PLACEHOLDER_BACKGROUND,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            height: "100%",
            justifyContent: "center",
            width: "100%",
          }}
        >
          <img
            alt=""
            aria-hidden="true"
            src={`data:image/svg+xml,${encodeURIComponent(PLACEHOLDER_SVG)}`}
            style={{ height: 48, objectFit: "contain", width: 48 }}
          />
          <span
            style={{
              color: "#e9ddcc",
              fontSize: 11,
              maxWidth: "80%",
              overflow: "hidden",
              textAlign: "center",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {alt}
          </span>
        </div>
      ) : null}
    </div>
  );
}
