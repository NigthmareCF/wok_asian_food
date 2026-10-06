import type { KitchenTicket } from "./live-contract";

// Las dos consultas pueden coincidir durante una transición; conserva la versión más reciente.
export function mergeKitchenTickets(
  open: KitchenTicket[],
  ready: KitchenTicket[],
) {
  const tickets = new Map<string, KitchenTicket>();
  for (const ticket of [...open, ...ready]) {
    const previous = tickets.get(ticket.id);
    if (!previous || ticket.rowVersion >= previous.rowVersion)
      tickets.set(ticket.id, ticket);
  }
  return [...tickets.values()];
}
