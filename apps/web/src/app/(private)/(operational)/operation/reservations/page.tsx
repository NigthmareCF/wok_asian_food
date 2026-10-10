import Link from "next/link";
import { OperationalReservationQueue } from "@/modules/reservations";

export default function ReservationsPage() {
  return <><Link href="/operation/core">Logística, overrides, preórdenes, sustituciones y documentos</Link><OperationalReservationQueue /></>;
}
