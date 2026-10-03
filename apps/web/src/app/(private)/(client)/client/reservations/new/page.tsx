import { LiveReservations } from "@/modules/reservations/components/live-reservations";
import { requireContext } from "@/modules/auth/server/auth-session";

export default async function NewReservationPage() {
  const user = await requireContext("client");
  return <LiveReservations key={user.userId} userId={user.userId} />;
}
