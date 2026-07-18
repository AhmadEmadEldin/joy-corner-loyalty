import crypto from "crypto";

export function slugId(prefix: string, value: unknown) {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefix}-${slug || "unknown"}`.toUpperCase();
}

export function uuidId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`.toUpperCase();
}

export function datedSequenceId(prefix: string, date: Date, sequence: number) {
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  return `${prefix}-${day}-${String(sequence).padStart(6, "0")}`;
}

export function menuItemSequenceId(sequence: number) {
  return `ITEM-${String(sequence).padStart(6, "0")}`;
}
