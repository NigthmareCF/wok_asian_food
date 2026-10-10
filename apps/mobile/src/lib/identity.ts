import { z } from "zod";

export type IdentityMode = "login" | "register" | "verify" | "reset-request" | "reset-complete";
export type IdentityValues = { email: string; name: string; password: string; code: string };
const email = z.string().trim().toLowerCase().max(254, "El correo es demasiado largo.").email("Ingresa un correo válido.");
const name = z.string().trim().min(2, "Escribe al menos 2 caracteres.").max(100, "Usa hasta 100 caracteres.");
const password = z.string().regex(/^(?=\S{12,128}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).*$/,
  "Usa 12 a 128 caracteres, mayúscula, minúscula, número y símbolo, sin espacios.");
const code = z.string().trim().regex(/^\d{6}$/, "Ingresa los 6 dígitos del código.");
const base = z.object({ email, name: z.string(), password: z.string(), code: z.string() });

export const identitySchemas = {
  login: base.extend({ password: z.string().max(128, "Usa hasta 128 caracteres.").refine((value) => value.trim().length > 0, "Ingresa tu contraseña.") }),
  register: base.extend({ name, password }),
  verify: base.extend({ code }),
  "reset-request": base,
  "reset-complete": base.extend({ code, password }),
};
export const emailSchema = email;
const guatemalaPhone = /^(?:\+?502[ .-]?)?[0-9]{4}[ .-][0-9]{4}$/;
export function formatGuatemalaPhoneInput(value: string): string {
  if(value.trim().startsWith("+"))return value.trim().replace(/[^+0-9]/g,"").slice(0,16);
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("502")) digits = digits.slice(3);
  digits = digits.slice(0, 8);
  return digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits;
}
export function isGuatemalaPhone(value: string): boolean {
  return guatemalaPhone.test(value.trim());
}
export function isInternationalPhone(value: string): boolean {
  return /^\+[1-9][0-9]{6,14}$/.test(value.replace(/[() .-]/g,""));
}
export const profileSchema = z.object({
  displayName: name,
  phone: z.string().trim().regex(/^$|^\+[1-9][0-9]{6,14}$|^(?:\+?502[ .-]?)?[0-9]{4}[ .-][0-9]{4}$/, "Para verificar posesión usa + y el código internacional completo."),
});
export const tokenPairSchema = z.object({
  accessToken: z.string().min(1), refreshToken: z.string().min(1),
  expiresInSeconds: z.number().int().positive(), tokenType: z.literal("Bearer"),
});
export const clientProfileSchema = z.object({
  userId: z.uuid(), email: z.string().min(1), displayName: z.string().min(1),
  phone: z.string().nullable().optional(), version: z.number().int().positive(),
});
export const clientSessionsSchema = z.array(z.object({
  sessionId: z.uuid(), clientType: z.enum(["WEB", "MOBILE", "DESKTOP"]), deviceName: z.string().nullable().optional(),
  createdAt: z.iso.datetime({ offset: true }), lastActivityAt: z.iso.datetime({ offset: true }), current: z.boolean(),
}));
