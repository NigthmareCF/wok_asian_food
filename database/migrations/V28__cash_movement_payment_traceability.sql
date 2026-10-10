-- Permite que la venta y la propina de un mismo pago compartan trazabilidad.
SET search_path = wok, public;

DROP INDEX ux_cash_movements_request;
DROP INDEX ux_cash_movements_payment;

CREATE UNIQUE INDEX ux_cash_movements_payment_type ON cash_movements (payment_id, movement_type)
    WHERE payment_id IS NOT NULL;
CREATE UNIQUE INDEX ux_cash_movements_request_trace ON cash_movements (
    request_id,
    (CASE WHEN payment_id IS NULL THEN 'MANUAL' ELSE movement_type END)
)
    WHERE request_id IS NOT NULL;
