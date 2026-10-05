import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

const maxChunkBytes = 1800;
const maxChunkCount = 70;

type ChunkManifest = { format: "wok-reservation-attempt-chunks-v1"; id: string; count: number };

export async function readSecurePayload(key: string): Promise<string | null> {
  const stored = await SecureStore.getItemAsync(key);
  if (!stored) return null;
  const manifest = parseManifest(stored);
  if (!manifest) return stored;
  const chunks = await Promise.all(Array.from({ length: manifest.count }, (_, index) =>
    SecureStore.getItemAsync(chunkKey(key, manifest.id, index))));
  return chunks.every((chunk): chunk is string => chunk !== null) ? chunks.join("") : null;
}

export async function saveSecurePayload(key: string, serialized: string): Promise<void> {
  if (serialized.length > 30000) throw new Error("La solicitud guardada supera el límite seguro del dispositivo.");
  const previous = parseManifest(await SecureStore.getItemAsync(key));
  if (utf8ByteLength(serialized) <= maxChunkBytes) {
    await SecureStore.setItemAsync(key, serialized);
    if (previous) await deleteChunks(key, previous);
    return;
  }

  const id = Crypto.randomUUID();
  const chunks = splitUtf8(serialized, maxChunkBytes);
  if (chunks.length > maxChunkCount) throw new Error("La solicitud guardada supera el límite seguro del dispositivo.");
  try {
    for (let offset = 0; offset < chunks.length; offset += 6) {
      await Promise.all(chunks.slice(offset, offset + 6).map((chunk, index) =>
        SecureStore.setItemAsync(chunkKey(key, id, offset + index), chunk)));
    }
    const manifest: ChunkManifest = { format: "wok-reservation-attempt-chunks-v1", id, count: chunks.length };
    await SecureStore.setItemAsync(key, JSON.stringify(manifest));
  } catch (error) {
    await deleteChunks(key, { format: "wok-reservation-attempt-chunks-v1", id, count: chunks.length }).catch(() => undefined);
    throw error;
  }
  if (previous && previous.id !== id) await deleteChunks(key, previous);
}

export async function deleteSecurePayload(key: string): Promise<void> {
  const manifest = parseManifest(await SecureStore.getItemAsync(key));
  await SecureStore.deleteItemAsync(key);
  if (manifest) await deleteChunks(key, manifest);
}

function parseManifest(value: string | null): ChunkManifest | null {
  if (!value || value.length > 200) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ChunkManifest>;
    if (parsed.format !== "wok-reservation-attempt-chunks-v1" || typeof parsed.id !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(parsed.id) || !Number.isInteger(parsed.count) ||
        Number(parsed.count) < 1 || Number(parsed.count) > maxChunkCount) return null;
    return parsed as ChunkManifest;
  } catch { return null; }
}

async function deleteChunks(key: string, manifest: ChunkManifest): Promise<void> {
  await Promise.all(Array.from({ length: manifest.count }, (_, index) =>
    SecureStore.deleteItemAsync(chunkKey(key, manifest.id, index))));
}

function chunkKey(key: string, id: string, index: number) { return `${key}.c.${id.replaceAll("-", "").slice(0, 12)}.${index}`; }

function splitUtf8(value: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let chunk = "";
  let chunkBytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const bytes = codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    if (chunkBytes + bytes > maxBytes) {
      chunks.push(chunk); chunk = ""; chunkBytes = 0;
    }
    chunk += character; chunkBytes += bytes;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function utf8ByteLength(value: string): number {
  let total = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    total += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return total;
}
