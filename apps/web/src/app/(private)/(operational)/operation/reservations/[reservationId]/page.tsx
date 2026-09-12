import { ReservationDetailView } from "@/modules/reservations";

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ reservationId: string }>;
}) {
  const { reservationId } = await params;
  return <ReservationDetailView reservationId={reservationId} />;
}
