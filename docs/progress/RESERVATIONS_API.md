# Progreso API de Reservas

## 2026-09-30 — Cancelación de solicitud pendiente

- `DELETE /api/v1/client/reservations/{reservationId}` permite que el CLIENT propietario cancele únicamente reservas `REQUESTED`; bloquea la fila, actualiza la reserva e inserta el evento histórico en la misma transacción.
- Si ya está `CANCELLED`, devuelve el estado sin crear otro evento. Reserva ajena/inexistente responde 404 y estado confirmado o avanzado responde 409.
- La cancelación de reservas confirmadas queda pendiente de política operativa/penalizaciones; no se implementa bypass. El cambio sólo toca `REQUESTED`, que todavía no tiene asignación de mesa.
- Suite Maven en composición temporal foundation + auth + reservations + availability + API: 37 pruebas, 0 fallos/errores; incluye propiedad, cancelación idempotente, 404 y rechazo de reserva confirmada.
- La app Expo pasó lint, typecheck y export estático Android/web después de agregar la acción. No se hizo smoke HTTP/PostgreSQL de esta ruta nueva ni prueba física del teléfono.
