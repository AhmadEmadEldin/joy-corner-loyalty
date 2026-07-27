export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith("0") && digits.length === 11) {
    return `+20${digits.slice(1)}`;
  }
  if (digits.startsWith("20") && digits.length >= 11) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

export function isValidEmail(email: string): boolean {
  return /^\S+@\S+\.\S+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  return /^\+?[0-9]{8,15}$/.test(phone);
}
