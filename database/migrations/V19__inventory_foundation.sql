-- Base de inventario: saldo fisico por item y libro de movimientos.
-- El pedido reserva/consume en la fase de recetas (V20); aqui solo se controla el stock fisico.
SET search_path = wok, public;

INSERT INTO permissions (code, description)
VALUES ('inventory:manage', 'Consultar y ajustar inventario')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('OPERATIONAL', 'ADMIN')
  AND p.code = 'inventory:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

ALTER TABLE items
    ADD COLUMN minimum_stock NUMERIC(18,6) NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_items_minimum_stock
        CHECK (minimum_stock >= 0 AND minimum_stock::text NOT IN ('NaN', 'Infinity', '-Infinity'));

CREATE TABLE inventory_balances (
    item_id UUID PRIMARY KEY REFERENCES items(id) ON DELETE RESTRICT,
    quantity_on_hand NUMERIC(18,6) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT ck_inventory_balances_on_hand
        CHECK (quantity_on_hand >= 0 AND quantity_on_hand::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_inventory_balances_row_version CHECK (row_version > 0)
);

CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL,
    quantity_delta NUMERIC(18,6) NOT NULL,
    reason TEXT,
    order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
    responsible_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    request_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_inventory_movements_type
        CHECK (movement_type IN ('ENTRY', 'ADJUSTMENT', 'WASTE', 'CONSUMPTION')),
    CONSTRAINT ck_inventory_movements_delta
        CHECK (quantity_delta <> 0 AND quantity_delta::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_inventory_movements_consumption_order
        CHECK (movement_type = 'CONSUMPTION' OR order_id IS NULL)
);
CREATE INDEX ix_inventory_movements_item ON inventory_movements(item_id, occurred_at DESC);
CREATE INDEX ix_inventory_movements_order ON inventory_movements(order_id);
CREATE UNIQUE INDEX ux_inventory_movements_consumption
    ON inventory_movements(order_id, item_id)
    WHERE movement_type = 'CONSUMPTION';
