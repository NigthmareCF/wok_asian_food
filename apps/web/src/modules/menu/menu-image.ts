export function safeMenuImage(value?: string | null): string | null {
  if (!value || /[\s\\]/.test(value) || value.startsWith("//")) return null;
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
