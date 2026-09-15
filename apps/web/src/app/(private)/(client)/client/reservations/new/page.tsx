import { ReservationFormView } from "@/modules/reservations";
import { ClientDemoNavigation } from "@/modules/client-demo-navigation";

export default async function NewReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  return (
    <>
      <ClientDemoNavigation />
      <ReservationFormView
        initialTime={demo === "late" ? "22:00" : undefined}
      />
    </>
  );
}
