import { describe, expect, it, vi } from "vitest";
import { completeGoogleSignIn } from "./google-auth";

const tokens = { accessToken: "wok-access", refreshToken: "wok-refresh", expiresInSeconds: 600 };

describe("Google sign-in exchange", () => {
  it("sends the same one-time server nonce with the verified Google token", async () => {
    const issueNonce = vi.fn(async () => ({ nonce: "a".repeat(64), expiresInSeconds: 300 }));
    const getIdentity = vi.fn(async () => ({ idToken: "google-id-token", email: "Customer@Example.com" }));
    const exchange = vi.fn(async () => tokens);

    const result = await completeGoogleSignIn({ issueNonce, getIdentity, exchange });

    expect(getIdentity).toHaveBeenCalledWith("a".repeat(64));
    expect(exchange).toHaveBeenCalledWith({ idToken: "google-id-token", email: "Customer@Example.com" }, "a".repeat(64));
    expect(result).toEqual({ email: "customer@example.com", value: tokens });
  });

  it("does not exchange a cancelled sign-in", async () => {
    const exchange = vi.fn(async () => tokens);
    const result = await completeGoogleSignIn({
      issueNonce: async () => ({ nonce: "nonce", expiresInSeconds: 300 }),
      getIdentity: async () => null,
      exchange,
    });

    expect(result).toBeNull();
    expect(exchange).not.toHaveBeenCalled();
  });

  it("rejects empty or expired server challenges before calling Google", async () => {
    const getIdentity = vi.fn();
    await expect(completeGoogleSignIn({
      issueNonce: async () => ({ nonce: "", expiresInSeconds: 300 }),
      getIdentity,
      exchange: vi.fn(),
    })).rejects.toThrow("acceso seguro");
    expect(getIdentity).not.toHaveBeenCalled();
  });
});
