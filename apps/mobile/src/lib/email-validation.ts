export function normalizeEmail(value: string): string {
  return value.trim();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || email.includes("..")) return false;

  const [localPart, domain, ...extra] = email.split("@");
  if (extra.length > 0 || !localPart || !domain || localPart.length > 64) return false;
  if (localPart.startsWith(".") || localPart.endsWith(".")) return false;
  if (!/^[^\s@]+$/.test(localPart)) return false;

  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) =>
    !label || label.length > 63 || label.startsWith("-") || label.endsWith("-") || !/^[a-z\d-]+$/i.test(label),
  )) return false;

  return labels.at(-1)!.length >= 2;
}
