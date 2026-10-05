export function isValidNewPassword(value: string): boolean {
  return value.length >= 12 && value.length <= 128;
}
