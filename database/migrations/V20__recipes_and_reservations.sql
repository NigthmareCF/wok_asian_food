-- Recetas item -> item y reservas de inventario por pedido.
-- El pedido reserva al confirmarse y consume al servirse; la cancelacion libera.
SET search_path = wok, public;

CREATE TABLE item_recipe_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    component_item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    quantity NUMERIC(18,6) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_item_recipe_components_pair UNIQUE (parent_item_id, component_item_id),
    CONSTRAINT ck_item_recipe_components_self CHECK (parent_item_id <> component_item_id),
    CONSTRAINT ck_item_recipe_components_quantity
        CHECK (quantity > 0 AND quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);
CREATE INDEX ix_item_recipe_components_component ON item_recipe_components(component_item_id);

CREATE TABLE inventory_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    quantity NUMERIC(18,6) NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_inventory_reservations_quantity
        CHECK (quantity > 0 AND quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_inventory_reservations_status CHECK (status IN ('ACTIVE', 'RELEASED', 'CONSUMED'))
);
CREATE INDEX ix_inventory_reservations_order ON inventory_reservations(order_id);
CREATE INDEX ix_inventory_reservations_item ON inventory_reservations(item_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX ux_inventory_reservations_active
    ON inventory_reservations(order_id, item_id) WHERE status = 'ACTIVE';
