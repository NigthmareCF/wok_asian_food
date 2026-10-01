-- Orders confirmadas, cuentas, items, comandas de cocina e historiales.
-- El calculo de totales vive en SQL (line_total generado y recalculo por agregacion).
-- La transicion de estados y la ETA por carga pertenecen al servicio: dependen del tiempo y de la carga actual.
SET search_path = wok, public;

CREATE SEQUENCE order_code_seq;

CREATE TABLE order_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dining_table_id UUID REFERENCES dining_tables(id),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    opened_by UUID NOT NULL REFERENCES users(id),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_order_accounts_1 UNIQUE (dining_table_id, name),
    CONSTRAINT ck_order_accounts_1 CHECK (status IN ('OPEN', 'IN_COBRO', 'PAID', 'CLOSED')),
    CONSTRAINT ck_order_accounts_2 CHECK (row_version > 0),
    CONSTRAINT ck_order_accounts_3 CHECK (length(btrim(name)) > 0),
    CONSTRAINT ck_order_accounts_4 CHECK (status <> 'CLOSED' OR closed_at IS NOT NULL)
);
CREATE INDEX ix_order_accounts_dining_table_id ON order_accounts(dining_table_id);
CREATE INDEX ix_order_accounts_status ON order_accounts(status, opened_at);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    account_id UUID NOT NULL REFERENCES order_accounts(id),
    dining_table_id UUID REFERENCES dining_tables(id),
    channel TEXT NOT NULL DEFAULT 'DINE_IN',
    status TEXT NOT NULL DEFAULT 'SENT',
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency_id UUID NOT NULL REFERENCES currencies(id),
    guest_count INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    idempotency_key UUID,
    request_fingerprint TEXT,
    opened_by UUID NOT NULL REFERENCES users(id),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID,
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_orders_1 UNIQUE (code),
    CONSTRAINT uq_orders_2 UNIQUE (opened_by, idempotency_key),
    CONSTRAINT ck_orders_1 CHECK (channel IN ('DINE_IN', 'PICKUP', 'DELIVERY')),
    CONSTRAINT ck_orders_2 CHECK (status IN ('SENT', 'PREPARING', 'READY', 'SERVED', 'CLOSED', 'CANCELLED')),
    CONSTRAINT ck_orders_3 CHECK (guest_count > 0),
    CONSTRAINT ck_orders_4 CHECK (subtotal >= 0 AND total >= 0 AND discount >= 0),
    CONSTRAINT ck_orders_5 CHECK (discount <= subtotal),
    CONSTRAINT ck_orders_6 CHECK (row_version > 0),
    CONSTRAINT ck_orders_7 CHECK (status <> 'CLOSED' OR closed_at IS NOT NULL),
    CONSTRAINT ck_orders_8 CHECK (channel = 'DINE_IN' OR dining_table_id IS NULL)
);
CREATE INDEX ix_orders_account_id ON orders(account_id);
CREATE INDEX ix_orders_dining_table_id ON orders(dining_table_id);
CREATE INDEX ix_orders_status ON orders(status, opened_at);
CREATE INDEX ix_orders_currency_id ON orders(currency_id);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    menu_item_id UUID NOT NULL REFERENCES menu_items(id),
    name_snapshot TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(14,2) NOT NULL,
    line_total NUMERIC(14,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
    preparation_area_id UUID NOT NULL REFERENCES preparation_areas(id),
    fulfillment TEXT NOT NULL DEFAULT 'DINE_IN',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT ck_order_items_1 CHECK (quantity > 0),
    CONSTRAINT ck_order_items_2 CHECK (unit_price >= 0),
    CONSTRAINT ck_order_items_3 CHECK (fulfillment IN ('DINE_IN', 'TAKEAWAY')),
    CONSTRAINT ck_order_items_4 CHECK (row_version > 0),
    CONSTRAINT ck_order_items_5 CHECK (length(btrim(name_snapshot)) > 0)
);
CREATE INDEX ix_order_items_order_id ON order_items(order_id);
CREATE INDEX ix_order_items_menu_item_id ON order_items(menu_item_id);
CREATE INDEX ix_order_items_preparation_area_id ON order_items(preparation_area_id);

CREATE TABLE kitchen_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    sequence_no INTEGER NOT NULL,
    station_id UUID NOT NULL REFERENCES preparation_areas(id),
    status TEXT NOT NULL DEFAULT 'QUEUED',
    claimed_by UUID REFERENCES users(id),
    claimed_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    estimated_ready_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_kitchen_tickets_1 UNIQUE (order_id, sequence_no),
    CONSTRAINT ck_kitchen_tickets_1 CHECK (sequence_no > 0),
    CONSTRAINT ck_kitchen_tickets_2 CHECK (status IN ('QUEUED', 'PREPARING', 'READY', 'RECALLED', 'CANCELLED')),
    CONSTRAINT ck_kitchen_tickets_3 CHECK (row_version > 0),
    CONSTRAINT ck_kitchen_tickets_4 CHECK (status <> 'READY' OR ready_at IS NOT NULL),
    CONSTRAINT ck_kitchen_tickets_5 CHECK ((claimed_by IS NULL) = (claimed_at IS NULL))
);
CREATE INDEX ix_kitchen_tickets_status ON kitchen_tickets(status, station_id, created_at);
CREATE INDEX ix_kitchen_tickets_order_id ON kitchen_tickets(order_id);
CREATE INDEX ix_kitchen_tickets_station_id ON kitchen_tickets(station_id);

CREATE TABLE kitchen_ticket_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES kitchen_tickets(id),
    order_item_id UUID NOT NULL REFERENCES order_items(id),
    quantity INTEGER NOT NULL,
    action TEXT NOT NULL DEFAULT 'NEW',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_kitchen_ticket_items_1 UNIQUE (ticket_id, order_item_id),
    CONSTRAINT ck_kitchen_ticket_items_1 CHECK (quantity > 0),
    CONSTRAINT ck_kitchen_ticket_items_2 CHECK (action IN ('NEW', 'INCREASED', 'CANCELLED'))
);
CREATE INDEX ix_kitchen_ticket_items_ticket_id ON kitchen_ticket_items(ticket_id);
CREATE INDEX ix_kitchen_ticket_items_order_item_id ON kitchen_ticket_items(order_item_id);

CREATE TABLE order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    from_status TEXT,
    to_status TEXT NOT NULL,
    reason TEXT,
    actor_user_id UUID REFERENCES users(id),
    request_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_order_status_history_1 CHECK (to_status IN ('SENT', 'PREPARING', 'READY', 'SERVED', 'CLOSED', 'CANCELLED'))
);
CREATE INDEX ix_order_status_history_order_id ON order_status_history(order_id, occurred_at);

CREATE TABLE kitchen_ticket_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES kitchen_tickets(id),
    from_status TEXT,
    to_status TEXT NOT NULL,
    reason TEXT,
    actor_user_id UUID REFERENCES users(id),
    request_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_kitchen_ticket_status_history_1 CHECK (to_status IN ('QUEUED', 'PREPARING', 'READY', 'RECALLED', 'CANCELLED'))
);
CREATE INDEX ix_kitchen_ticket_status_history_ticket_id ON kitchen_ticket_status_history(ticket_id, occurred_at);
