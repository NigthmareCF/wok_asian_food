/** A definite client rejection is safe to discard; transient responses keep the idempotent attempt. */
export function isDefinitiveOrderAttemptRejection(status: number | undefined): boolean {
  return status !== undefined && status >= 400 && status < 500 &&
    status !== 408 && status !== 425 && status !== 429;
}
