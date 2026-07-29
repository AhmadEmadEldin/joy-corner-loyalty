import crypto from "node:crypto";

type StoredImage = {
  provider: "cloudinary";
  publicId: string;
  url: string;
};

function configuration() {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || "").trim();
  const folder = String(process.env.CLOUDINARY_FOLDER || "").trim();
  if (!cloudName || !apiKey || !apiSecret || !folder) {
    throw new Error(
      "Product image storage is not configured. Add the Cloudinary server credentials and folder.",
    );
  }
  return { apiKey, apiSecret, cloudName, folder };
}

export function cloudinaryPublicId(
  itemId: string,
  folder: string,
  timestamp?: number,
): string {
  const normalizedFolder = folder.replace(/^\/+|\/+$/g, "");
  if (
    !normalizedFolder ||
    normalizedFolder.includes("..") ||
    !/^[a-z0-9/_-]+$/i.test(normalizedFolder)
  ) {
    throw new Error("The Cloudinary folder is invalid.");
  }
  if (!/^[a-z0-9-]+$/i.test(itemId)) {
    throw new Error("The menu item identifier is invalid.");
  }
  return `${normalizedFolder}/${itemId}/main${
    timestamp ? `-${timestamp}` : ""
  }`;
}

function hasExpectedSignature(contentType: string, bytes: Buffer): boolean {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    );
  }
  if (contentType === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  if (contentType === "image/avif") {
    const brand = bytes.subarray(4, 32).toString("ascii");
    return bytes.length >= 12 && brand.includes("ftyp") && /avi[fs]/.test(brand);
  }
  return false;
}

function signature(
  parameters: Record<string, string | number>,
  apiSecret: string,
) {
  const payload = Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return crypto.createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
}

export async function storeMenuImage(
  itemId: string,
  dataUrl: string,
): Promise<StoredImage> {
  const match = /^data:(image\/(?:avif|jpeg|png|webp));base64,([a-z0-9+/=]+)$/i.exec(
    dataUrl,
  );
  if (!match?.[1] || !match[2]) throw new Error("The image payload is invalid.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
    throw new Error("Menu images must be between 1 byte and 5 MB.");
  }
  if (!hasExpectedSignature(match[1].toLowerCase(), bytes)) {
    throw new Error("The image content does not match its declared file type.");
  }
  const { apiKey, apiSecret, cloudName, folder } = configuration();
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = cloudinaryPublicId(itemId, folder, timestamp);
  const parameters = {
    public_id: publicId,
    timestamp,
  };
  const body = new FormData();
  body.set("api_key", apiKey);
  body.set("file", dataUrl);
  body.set("public_id", publicId);
  body.set("signature", signature(parameters, apiSecret));
  body.set("timestamp", String(timestamp));
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
    { body, method: "POST" },
  );
  const result = (await response.json()) as {
    error?: { message?: string };
    public_id?: string;
    secure_url?: string;
  };
  if (!response.ok || !result.secure_url || !result.public_id) {
    throw new Error(result.error?.message || "The image upload failed.");
  }
  return {
    provider: "cloudinary",
    publicId: result.public_id,
    url: result.secure_url,
  };
}

export async function removeMenuImage(publicId: string): Promise<void> {
  if (!publicId) return;
  const { apiKey, apiSecret, cloudName } = configuration();
  const timestamp = Math.floor(Date.now() / 1000);
  const parameters = { invalidate: "true", public_id: publicId, timestamp };
  const body = new URLSearchParams({
    api_key: apiKey,
    invalidate: parameters.invalidate,
    public_id: publicId,
    signature: signature(parameters, apiSecret),
    timestamp: String(timestamp),
  });
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`,
    { body, method: "POST" },
  );
  if (!response.ok) throw new Error("The stored image could not be removed.");
}
