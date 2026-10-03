-- Propina separada de la venta en los cobros por cuenta.
-- La propina no reduce el saldo de la cuenta; en efectivo entra a caja como INCOME.
SET search_path = wok, public;

ALTER TABLE payments
    ADD COLUMN tip_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_payments_tip
        CHECK (tip_amount >= 0 AND tip_amount::text NOT IN ('NaN', 'Infinity', '-Infinity'));
