type DeliveryRequestForPayment = {
  requestId: string;
  status: string;
  paymentPreference: string | null;
};

export async function recoverCurrentPaymentIntents<T>(
  requests: DeliveryRequestForPayment[],
  readCurrent: (requestId: string) => Promise<T | null | undefined>,
): Promise<Record<string, Awaited<T>>> {
  const eligible = requests.filter((request) =>
    request.status === "ACCEPTED" && request.paymentPreference === "ONLINE_PAYMENT_REQUESTED",
  );
  const results = await Promise.all(eligible.map(async ({ requestId }) => [requestId, await readCurrent(requestId)] as const));
  const current: Record<string, Awaited<T>> = {};
  for (const [requestId, intent] of results) {
    if (intent != null) current[requestId] = intent;
  }
  return current;
}
