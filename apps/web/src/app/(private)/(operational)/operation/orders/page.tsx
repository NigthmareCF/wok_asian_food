import Link from "next/link";
import { OperationalOrderListView } from "@/modules/orders";

export default function OrdersPage() {
  return <><Link href="/operation/core">Logística, overrides, preórdenes, sustituciones y documentos</Link><OperationalOrderListView /></>;
}
