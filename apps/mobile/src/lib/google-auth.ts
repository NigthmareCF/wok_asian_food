import type { TokenPair } from "./api";

export type GoogleIdentity = { idToken: string; email: string };
export type GoogleNonceChallenge = { nonce: string; expiresInSeconds: number };

type GoogleAuthTransport<T> = {
  issueNonce: () => Promise<GoogleNonceChallenge>;
  getIdentity: (nonce: string) => Promise<GoogleIdentity | null>;
  exchange: (identity: GoogleIdentity, nonce: string) => Promise<T>;
};

/** Keeps the server-issued OIDC nonce attached to the identity token exchange. */
export async function completeGoogleSignIn<T = TokenPair>(transport: GoogleAuthTransport<T>) {
  const challenge = await transport.issueNonce();
  if (!challenge.nonce || challenge.expiresInSeconds <= 0) throw new Error("WOK no pudo iniciar el acceso seguro con Google.");

  const identity = await transport.getIdentity(challenge.nonce);
  if (!identity) return null;
  if (!identity.idToken || !identity.email) throw new Error("Google no devolvió una identidad verificable. Inténtalo de nuevo.");

  const value = await transport.exchange(identity, challenge.nonce);
  return { email: identity.email.trim().toLowerCase(), value };
}
