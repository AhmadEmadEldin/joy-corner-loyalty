export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^01[0125]\d{8}$/.test(digits)) digits = `20${digits.slice(1)}`;
  return `+${digits}`;
}

export function isValidEmail(email: string): boolean {
  return /^\S+@\S+\.\S+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  return /^\+?[0-9]{8,15}$/.test(phone);
}
