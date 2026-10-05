import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteSecurePayload, readSecurePayload, saveSecurePayload } from "./reservation-attempt-storage";

const storedValues = vi.hoisted(() => new Map<string, string>());
let chunkId = 0;
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => storedValues.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { storedValues.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { storedValues.delete(key); }),
}));
vi.mock("expo-crypto", () => ({ randomUUID: vi.fn(() => `00000000-0000-4000-8000-${String(++chunkId).padStart(12, "0")}`) }));

describe("secure reservation payload storage", () => {
  beforeEach(() => { storedValues.clear(); chunkId = 0; });

  it("stores small values inline and reads them unchanged", async () => {
    await saveSecurePayload("draft", "small reservation draft");
    expect(await readSecurePayload("draft")).toBe("small reservation draft");
  });

  it("chunks larger drafts and attempts while preserving exact content", async () => {
    const payload = JSON.stringify({ body: "餐😋áx".repeat(1500) });
    await saveSecurePayload("attempt", payload);
    expect(storedValues.size).toBeGreaterThan(1);
    expect(await readSecurePayload("attempt")).toBe(payload);
  });

  it("replaces old chunks and deletes the full encrypted payload", async () => {
    await saveSecurePayload("attempt", "x".repeat(4000));
    await saveSecurePayload("attempt", "replacement");
    expect(storedValues.size).toBe(1);
    expect(await readSecurePayload("attempt")).toBe("replacement");
    await deleteSecurePayload("attempt");
    expect(storedValues.size).toBe(0);
  });
});
