import { CashView } from "@/modules/cash";
import { CashSessionProvider } from "@/modules/cash";

export default function CashPage() {
  return (
    <CashSessionProvider>
      <CashView />
    </CashSessionProvider>
  );
}