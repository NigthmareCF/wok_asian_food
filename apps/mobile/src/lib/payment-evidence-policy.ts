export type PaymentEvidenceStatus = "NEEDS_REVIEW" | "VERIFIED" | "REJECTED";

/** The server list must be known before the client offers another evidence upload. */
export function canSubmitPaymentEvidence(loaded: boolean, currentStatus?: PaymentEvidenceStatus): boolean {
  return loaded && (!currentStatus || currentStatus === "REJECTED");
}
