# Progreso API de Reservas

## 2026-10-09 — Replay idempotente de decisiones Operativas

- `PUT /api/v1/operational/reservations/{reservationId}/decision` acepta `Idempotency-Key` opcional para clientes Operativos existentes y nuevos. Cuando se envía, el fingerprint cubre reserva, decisión, motivo, versión y mesas normalizadas, pero excluye `X-Request-Id`.
- La clave, la asignación de mesas, transición de estado, historial, auditoría y snapshot HTTP se confirman dentro de la transacción PostgreSQL. Si el primer response se pierde, repetir la misma clave/payload devuelve el resultado original aunque la reserva ya no esté `REQUESTED`; una clave reutilizada con otro payload responde 409.
- No se requiere migración: V1 ya define `response_code` y `response_snapshot` en `wok.idempotency_keys`. Sin la cabecera, se conserva el comportamiento previo.
- Validación: integración PostgreSQL demuestra replay después de confirmar, una sola asignación/auditoría, rechazo de payload divergente y dos reintentos HTTP simultáneos con la misma clave (sólo un efecto, ambos reciben recibo). Pruebas focales: 16/16; suite Maven completa: 352 pruebas, 0 fallos/errores/omitidas; Flyway aplicó V1–V55 sobre PostgreSQL 18.

## 2026-10-05 — Solicitud de preorden desde Cliente y revisión Operativa

- `POST /api/v1/client/reservations` admite hasta 20 productos con hasta 50 unidades por producto y los modificadores seleccionados. El backend valida que sigan activos/públicos, comprueba límites requeridos y calcula los precios desde catálogo; la clave idempotente incluye líneas y modificadores.
- V38 guarda snapshots asociados a la evaluación y la agenda Operativa devuelve productos, cantidades, precios y opciones en `preorderItems` para las solicitudes que crearon una reserva pendiente.
- Sigue siendo sólo intención de preorden: no crea orden, no cobra y no reserva stock. Al cambiar el catálogo, un reintento con la misma clave devuelve su resultado persistido; payload distinto produce 409.
- PostgreSQL 18/Testcontainers: prueba HTTP comprueba snapshots y agenda operativa. Suite completa del backend: 225/225, sin fallos, errores ni omitidas.

## 2026-09-30 — Cancelación de solicitud pendiente

- `DELETE /api/v1/client/reservations/{reservationId}` permite que el CLIENT propietario cancele únicamente reservas `REQUESTED`; bloquea la fila, actualiza la reserva e inserta el evento histórico en la misma transacción.
- Si ya está `CANCELLED`, devuelve el estado sin crear otro evento. Reserva ajena/inexistente responde 404 y estado confirmado o avanzado responde 409.
- La cancelación de reservas confirmadas queda pendiente de política operativa/penalizaciones; no se implementa bypass. El cambio sólo toca `REQUESTED`, que todavía no tiene asignación de mesa.
- Suite Maven en composición temporal foundation + auth + reservations + availability + API: 37 pruebas, 0 fallos/errores; incluye propiedad, cancelación idempotente, 404 y rechazo de reserva confirmada.
- La app Expo pasó lint, typecheck y export estático Android/web después de agregar la acción. No se hizo smoke HTTP/PostgreSQL de esta ruta nueva ni prueba física del teléfono.
