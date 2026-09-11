"use client";

import { useMemo, useState } from "react";
import { checkoutPreviewSnapshot } from "@/data/fixtures/checkout-preview";
import type {
  PaymentMethod,
  PaymentTiming,
  TipOption,
} from "../checkout-snapshot";
import { CheckoutView } from "./checkout-view";

export function CheckoutPreview() {
  const [paymentTiming, setPaymentTiming] = useState<PaymentTiming>(
    checkoutPreviewSnapshot.paymentTiming,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    checkoutPreviewSnapshot.paymentMethod,
  );
  const [tipPercentage, setTipPercentage] = useState<TipOption>(
    checkoutPreviewSnapshot.tipPercentage,
  );
  const [revalidationMessage, setRevalidationMessage] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const snapshot = useMemo(
    () => ({
      ...checkoutPreviewSnapshot,
      paymentTiming,
      paymentMethod,
      tipPercentage,
    }),
    [paymentMethod, paymentTiming, tipPercentage],
  );

  return (
    <CheckoutView
      actions={{
        onPaymentTimingChange: setPaymentTiming,
        onPaymentMethodChange: setPaymentMethod,
        onTipChange: setTipPercentage,
        onRevalidate: () =>
          setRevalidationMessage(
            "Revalidación local simulada completada. No se reservaron existencias.",
          ),
        onConfirm: () => setIsPending(true),
      }}
      isPending={isPending}
      revalidationMessage={revalidationMessage}
      snapshot={snapshot}
    />
  );
}
