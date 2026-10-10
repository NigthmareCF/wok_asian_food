export function formatServiceDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Horario no disponible";
  return new Intl.DateTimeFormat("es-GT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Guatemala",
  }).format(date);
}
