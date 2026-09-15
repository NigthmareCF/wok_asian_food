import { PaymentsListView } from "@/modules/payments";
import { PaymentsSessionProvider } from "@/modules/payments";

export default function PaymentsPage() {
  return (
    <PaymentsSessionProvider>
      <PaymentsListView />
    </PaymentsSessionProvider>
  );
}