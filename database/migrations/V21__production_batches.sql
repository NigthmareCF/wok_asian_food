-- Produccion por lotes: consume insumos segun receta y da de alta el item producido.
SET search_path = wok, public;

INSERT INTO permissions (code, description)
VALUES ('production:manage', 'Registrar lotes de producción interna')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('OPERATIONAL', 'ADMIN')
  AND p.code = 'production:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

CREATE TABLE production_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produced_item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    area_id UUID REFERENCES preparation_areas(id) ON DELETE RESTRICT,
    quantity NUMERIC(18,6) NOT NULL,
    yield_quantity NUMERIC(18,6) NOT NULL,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    notes TEXT,
    responsible_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    request_id UUID,
    produced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_production_batches_quantity
        CHECK (quantity > 0 AND quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_production_batches_yield
        CHECK (yield_quantity >= 0 AND yield_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_production_batches_status CHECK (status IN ('COMPLETED', 'CANCELLED')),
    CONSTRAINT ck_production_batches_notes CHECK (notes IS NULL OR length(btrim(notes)) BETWEEN 1 AND 500)
);
CREATE INDEX ix_production_batches_produced ON production_batches(produced_item_id, produced_at DESC);

CREATE TABLE production_batch_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES production_batches(id) ON DELETE RESTRICT,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    quantity NUMERIC(18,6) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_production_batch_items_pair UNIQUE (batch_id, item_id),
    CONSTRAINT ck_production_batch_items_quantity
        CHECK (quantity > 0 AND quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);
CREATE INDEX ix_production_batch_items_item ON production_batch_items(item_id);

ALTER TABLE inventory_movements
    ADD COLUMN production_batch_id UUID REFERENCES production_batches(id) ON DELETE RESTRICT;
ALTER TABLE inventory_movements DROP CONSTRAINT ck_inventory_movements_consumption_order;
ALTER TABLE inventory_movements
    ADD CONSTRAINT ck_inventory_movements_scope CHECK (order_id IS NULL OR production_batch_id IS NULL);
CREATE UNIQUE INDEX ux_inventory_movements_production
    ON inventory_movements(production_batch_id, item_id)
    WHERE movement_type = 'CONSUMPTION' AND production_batch_id IS NOT NULL;
