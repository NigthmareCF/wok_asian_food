export function isValidDisplayName(value: string): boolean {
  const name = value.trim();
  return name.length >= 2 && name.length <= 100;
}

export function isValidVerificationCode(value: string): boolean {
  return /^[0-9]{6}$/.test(value);
}
