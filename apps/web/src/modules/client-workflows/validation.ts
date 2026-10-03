export const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export const instant = (v: unknown): v is string =>
  typeof v === "string" && /Z$/.test(v) && Number.isFinite(Date.parse(v));
