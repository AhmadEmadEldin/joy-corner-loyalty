import { useCallback, useRef, useState } from "react";

type ProductImageEditorProps = {
  alt: string;
  busy?: boolean;
  onPositionChange: (x: number, y: number) => void;
  onRemove: () => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  onZoomChange: (zoom: number) => void;
  positionX: number;
  positionY: number;
  src?: string | null;
  zoom: number;
};

export function ProductImageEditor({
  alt,
  busy = false,
  onPositionChange,
  onRemove,
  onUpload,
  onZoomChange,
  positionX,
  positionY,
  src,
  zoom,
}: ProductImageEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  const resolvePosition = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
      const y = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);
      onPositionChange(Math.round(x), Math.round(y));
    },
    [onPositionChange],
  );

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (busy) return;
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setDragging(true);
    resolvePosition(event.clientX, event.clientY);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || busy) return;
    resolvePosition(event.clientX, event.clientY);
  }

  function handlePointerUp() {
    setDragging(false);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void onUpload(file);
    event.target.value = "";
  }

  function handleReset() {
    onPositionChange(50, 50);
    onZoomChange(1);
  }

  return (
    <div className="product-image-editor">
      <div
        aria-label="Drag to set focal point"
        className="editor-preview"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={containerRef}
        role="application"
        style={{
          "--img-x": `${positionX}%`,
          "--img-y": `${positionY}%`,
          "--img-zoom": zoom,
          cursor: busy ? "not-allowed" : "crosshair",
          overflow: "hidden",
          position: "relative",
        } as React.CSSProperties}
      >
        {src ? (
          <img
            alt={alt}
            draggable={false}
            src={src}
            style={{
              height: "100%",
              objectFit: "cover",
              objectPosition: "var(--img-x) var(--img-y)",
              pointerEvents: "none",
              transform: `scale(var(--img-zoom, 1))`,
              userSelect: "none",
              width: "100%",
            }}
          />
        ) : (
          <div
            style={{
              alignItems: "center",
              background:
                "radial-gradient(circle at 50% 40%, #fff9ee, #eadbc6)",
              display: "flex",
              height: "100%",
              justifyContent: "center",
              width: "100%",
            }}
          >
            <span style={{ color: "#766650", fontSize: 14 }}>
              No image uploaded
            </span>
          </div>
        )}
        <div
          aria-hidden="true"
          style={{
            border: "2px solid rgba(255,255,255,0.9)",
            borderRadius: "50%",
            height: 28,
            left: `calc(${positionX}% - 14px)`,
            pointerEvents: "none",
            position: "absolute",
            top: `calc(${positionY}% - 14px)`,
            transition: dragging ? "none" : "left 80ms, top 80ms",
            width: 28,
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.9)",
              height: 2,
              left: -6,
              position: "absolute",
              top: 12,
              width: 28,
            }}
          />
          <div
            style={{
              background: "rgba(255,255,255,0.9)",
              height: 28,
              left: 12,
              position: "absolute",
              top: -6,
              width: 2,
            }}
          />
        </div>
      </div>

      <div className="editor-controls">
        <label className="editor-zoom-label">
          <span>Zoom</span>
          <input
            disabled={busy}
            max={2.5}
            min={1}
            onChange={(event) => onZoomChange(Number(event.target.value))}
            step={0.1}
            type="range"
            value={zoom}
          />
          <output>{zoom.toFixed(1)}×</output>
        </label>

        <div className="editor-position-display">
          <span>
            X: {positionX}% · Y: {positionY}%
          </span>
        </div>

        <div className="editor-actions">
          <button disabled={busy} onClick={handleReset} type="button">
            Reset
          </button>
          <label className="button-like" style={{ cursor: busy ? "not-allowed" : "pointer" }}>
            {src ? "Replace" : "Upload"}
            <input
              ref={fileRef}
              accept="image/avif,image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={handleFileChange}
              style={{ display: "none" }}
              type="file"
            />
          </label>
          {src ? (
            <button
              className="button-danger"
              disabled={busy}
              onClick={() => void onRemove()}
              type="button"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
