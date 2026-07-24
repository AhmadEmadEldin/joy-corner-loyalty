export const CAIRO_TIME_ZONE = "Africa/Cairo";

export function getCairoBusinessDate(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: CAIRO_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatCairoDateTime(date: Date | string | number) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: CAIRO_TIME_ZONE,
  }).format(new Date(date));
}

export function getPreviousCairoBusinessDate(date: Date = new Date()) {
  const current = getCairoBusinessDate(date);
  const previous = new Date(`${current}T12:00:00.000Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}
