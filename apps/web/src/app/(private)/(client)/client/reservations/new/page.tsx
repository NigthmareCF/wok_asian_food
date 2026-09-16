import { ReservationFormView } from "@/modules/reservations";

export default async function NewReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  return <ReservationFormView initialTime={demo === "late" ? "22:00" : undefined} />;
}
