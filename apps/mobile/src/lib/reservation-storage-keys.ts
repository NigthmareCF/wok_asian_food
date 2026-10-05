export const legacyReservationDraftKey = "wok.client.reservation-draft.v1";

export function reservationStorageKeys(draftOwnerHash: string, attemptOwnerHash: string) {
  return {
    draft: `wok.client.reservation-draft.v2.${draftOwnerHash}`,
    attempt: `wok.client.reservation-attempt.v1.${attemptOwnerHash}`,
  };
}
