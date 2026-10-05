export function formatGuatemalaPhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("502") && digits.length === 11) digits = digits.slice(3);
  if (digits.length > 8) return value.trim();
  return digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits;
}

export function isValidGuatemalaPhone(value: string): boolean {
  return /^\d{4} \d{4}$/.test(formatGuatemalaPhone(value));
}
