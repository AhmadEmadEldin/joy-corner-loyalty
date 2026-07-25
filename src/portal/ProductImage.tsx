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

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" fill="none"><rect width="80" height="80" rx="12" fill="#f5ebe0"/><path d="M28 52c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="#a54728" stroke-width="2.5" stroke-linecap="round"/><circle cx="40" cy="32" r="6" fill="#a54728" opacity=".18"/><path d="M36 28c0-2.21 1.79-4 4-4s4 1.79 4 4" stroke="#a54728" stroke-width="1.5" stroke-linecap="round"/><path d="M52 44v4a8 8 0 01-8 8" stroke="#a54728" stroke-width="1.5" stroke-linecap="round"/></svg>`;

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
          background: "radial-gradient(circle at 50% 40%, #fff9ee, #eadbc6)",
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
            color: "#766650",
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
              "linear-gradient(110deg, #eadfce 20%, #fff7eb 40%, #eadfce 60%)",
            backgroundSize: "220% 100%",
            height: "100%",
            position: "absolute",
            width: "100%",
          }}
        />
      ) : null}
      <img
        alt={alt}
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
      {state === "error" ? (
        <div
          aria-label={alt}
          style={{
            alignItems: "center",
            background:
              "radial-gradient(circle at 50% 40%, #fff9ee, #eadbc6)",
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
              color: "#766650",
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
