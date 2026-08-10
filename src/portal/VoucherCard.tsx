import { BrandLogo } from "./BrandLogo";

export type VoucherCardData = {
  code: string;
  customerName?: string;
  expiresAt?: string | null;
  reward: string;
  status?: string;
};

export function VoucherCard({
  data,
  variant = "standard",
}: {
  data: VoucherCardData;
  variant?: "compact" | "share" | "standard";
}) {
  return (
    <article className={`joy-voucher joy-voucher--${variant}`}>
      <header>
        <BrandLogo compact />
        {data.status ? <span>{data.status}</span> : null}
      </header>
      <div className="joy-voucher__reward">
        {data.customerName ? <p>For {data.customerName}</p> : null}
        <strong>{data.reward}</strong>
        <small>Serving Coffee Lovers</small>
      </div>
      <footer>
        <code>{data.code}</code>
        <span>
          {data.expiresAt
            ? `Expires ${new Date(data.expiresAt).toLocaleDateString("en-EG")}`
            : "No expiry"}
        </span>
      </footer>
    </article>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The Joy Corner logo could not be loaded."));
    image.src = src;
  });
}

export async function createVoucherShareFile(
  data: VoucherCardData,
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Voucher artwork is not supported in this browser.");

  const farm = await loadImage("/assets/brand/joy-corner-coffee-farm-v2.jpg");
  const scale = Math.max(canvas.width / farm.width, canvas.height / farm.height);
  const farmWidth = farm.width * scale;
  const farmHeight = farm.height * scale;
  context.drawImage(farm, (canvas.width - farmWidth) / 2, (canvas.height - farmHeight) / 2, farmWidth, farmHeight);
  const wash = context.createLinearGradient(0, 0, 1080, 1350);
  wash.addColorStop(0, "rgba(7, 4, 2, .94)");
  wash.addColorStop(0.55, "rgba(20, 11, 5, .75)");
  wash.addColorStop(1, "rgba(34, 19, 10, .48)");
  context.fillStyle = wash;
  context.fillRect(0, 0, 1080, 1350);
  context.strokeStyle = "#c99245";
  context.lineWidth = 4;
  context.strokeRect(44, 44, 992, 1262);

  const logo = await loadImage("/assets/joy-corner-logo-white-wordmark.png");
  context.drawImage(logo, 330, 90, 420, 310);
  context.textAlign = "center";
  if (data.customerName) {
    context.fillStyle = "#d8cec2";
    context.font = "400 36px Arial, sans-serif";
    context.fillText(`For ${data.customerName.split(/\s+/)[0]}`, 540, 565);
  }
  context.fillStyle = "#f3eee5";
  context.font = "700 92px Georgia, serif";
  context.fillText(data.reward, 540, 735);
  context.fillStyle = "#c99245";
  context.font = "600 34px Arial, sans-serif";
  context.fillText("VOUCHER CODE", 540, 875);
  context.fillStyle = "#ffffff";
  context.font = "600 56px ui-monospace, monospace";
  context.fillText(data.code, 540, 955);
  context.fillStyle = "#d8cec2";
  context.font = "400 30px Arial, sans-serif";
  context.fillText(
    data.expiresAt
      ? `Expires ${new Date(data.expiresAt).toLocaleDateString("en-EG")}`
      : "No expiry",
    540,
    1060,
  );
  context.fillStyle = "#ffffff";
  context.font = "500 34px Arial, sans-serif";
  context.fillText("Serving Coffee Lovers", 540, 1190);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Voucher image creation failed."))),
      "image/png",
    ),
  );
  return new File([blob], `${data.code}.png`, { type: "image/png" });
}

export async function shareVoucherArtwork(data: VoucherCardData): Promise<"downloaded" | "shared"> {
  const file = await createVoucherShareFile(data);
  const shareData: ShareData = {
    files: [file],
    title: "Joy Corner voucher",
  };
  if (navigator.share && navigator.canShare?.(shareData)) {
    await navigator.share(shareData);
    return "shared";
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.download = file.name;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
