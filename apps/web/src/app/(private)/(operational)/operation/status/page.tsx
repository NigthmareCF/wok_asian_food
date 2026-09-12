import { ServiceStatusView } from "@/modules/service-status";
import { ServiceStatusProvider } from "@/modules/service-status";

export default function OperationStatusPage() {
  return (
    <ServiceStatusProvider>
      <ServiceStatusView />
    </ServiceStatusProvider>
  );
}