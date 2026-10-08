type DeliveryRequestForPayment = {
  requestId: string;
  status: string;
  paymentPreference: string | null;
};

export async function recoverCurrentPaymentIntents<T>(
  requests: DeliveryRequestForPayment[],
  readCurrent: (requestId: string) => Promise<T | null | undefined>,
): Promise<{ current: Record<string, Awaited<T>>; unavailableRequestIds: string[] }> {
  const eligible = requests.filter((request) =>
    request.status === "ACCEPTED" && request.paymentPreference === "ONLINE_PAYMENT_REQUESTED",
  );
  const results = await Promise.allSettled(eligible.map(async ({ requestId }) => [requestId, await readCurrent(requestId)] as const));
  const current: Record<string, Awaited<T>> = {};
  const unavailableRequestIds: string[] = [];
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      unavailableRequestIds.push(eligible[index].requestId);
      continue;
    }
    const [requestId, intent] = result.value;
    if (intent != null) current[requestId] = intent;
  }
  return { current, unavailableRequestIds };
}
