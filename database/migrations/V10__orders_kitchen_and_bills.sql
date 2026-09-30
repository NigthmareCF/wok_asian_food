-- Orders are commercial records. They are deliberately separate from client order_requests:
-- a request must be reviewed before staff creates a real order.
SET search_path = wok, public;

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dining_session_id UUID REFERENCES dining_sessions(id),
    customer_id UUID REFERENCES customer_profiles(id),
    table_id UUID REFERENCES dining_tables(id),
    reservation_id UUID REFERENCES reservations(id),
    request_id UUID REFERENCES order_requests(id),
    channel TEXT NOT NULL,
    order_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    currency_id UUID NOT NULL REFERENCES currencies(id),
    comments TEXT,
    ordered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    estimated_ready_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT ck_orders_channel CHECK (channel IN ('WEB', 'MOBILE', 'DESKTOP', 'STAFF', 'WHATSAPP', 'INSTAGRAM', 'OTHER')),
    CONSTRAINT ck_orders_type CHECK (order_type IN ('DINE_IN', 'PICKUP', 'DELIVERY')),
    CONSTRAINT ck_orders_status CHECK (status IN ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'IN_PREPARATION', 'READY', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT ck_orders_dine_in_context CHECK (order_type <> 'DINE_IN' OR dining_session_id IS NOT NULL),
    CONSTRAINT ck_orders_row_version CHECK (row_version > 0)
);
COMMENT ON TABLE orders IS 'Pedido comercial; una solicitud cliente solo puede convertirse en pedido después de revisión operativa.';

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    menu_item_id UUID NOT NULL REFERENCES menu_items(id),
    item_name_snapshot TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(14,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    notes TEXT,
    sent_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    replaces_order_item_id UUID REFERENCES order_items(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_order_items_context UNIQUE (id, order_id),
    CONSTRAINT ck_order_items_quantity CHECK (quantity BETWEEN 1 AND 50),
    CONSTRAINT ck_order_items_price CHECK (unit_price >= 0 AND unit_price::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_order_items_status CHECK (status IN ('DRAFT', 'SENT', 'IN_PREPARATION', 'READY', 'SERVED', 'CANCELLED')),
    CONSTRAINT ck_order_items_cancelled CHECK (status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)),
    CONSTRAINT ck_order_items_row_version CHECK (row_version > 0)
);
COMMENT ON TABLE order_items IS 'Línea histórica: nombre y precio se congelan en el momento en que personal crea el pedido.';

CREATE TABLE order_item_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID NOT NULL REFERENCES order_items(id),
    modifier_id UUID NOT NULL REFERENCES modifiers(id),
    name_snapshot TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_delta NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_item_modifiers UNIQUE (order_item_id, modifier_id),
    CONSTRAINT ck_order_item_modifiers_quantity CHECK (quantity > 0),
    CONSTRAINT ck_order_item_modifiers_price CHECK (price_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);

CREATE TABLE order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    from_status TEXT,
    to_status TEXT NOT NULL,
    reason TEXT,
    actor_user_id UUID REFERENCES users(id),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_order_status_history CHECK (to_status IN ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'IN_PREPARATION', 'READY', 'COMPLETED', 'CANCELLED'))
);

CREATE TABLE order_item_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID NOT NULL REFERENCES order_items(id),
    from_status TEXT,
    to_status TEXT NOT NULL,
    reason TEXT,
    actor_user_id UUID REFERENCES users(id),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_order_item_status_history CHECK (to_status IN ('DRAFT', 'SENT', 'IN_PREPARATION', 'READY', 'SERVED', 'CANCELLED'))
);

-- A submission creates one ticket per preparation area. New additions can be sent later
-- as a new sequence without duplicating the original kitchen command.
CREATE TABLE kitchen_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    preparation_area_id UUID NOT NULL REFERENCES preparation_areas(id),
    status TEXT NOT NULL DEFAULT 'QUEUED',
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    sequence_number INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_kitchen_tickets_sequence UNIQUE (order_id, preparation_area_id, sequence_number),
    CONSTRAINT ck_kitchen_tickets_status CHECK (status IN ('QUEUED', 'IN_PROGRESS', 'READY', 'CANCELLED')),
    CONSTRAINT ck_kitchen_tickets_sequence CHECK (sequence_number > 0),
    CONSTRAINT ck_kitchen_tickets_row_version CHECK (row_version > 0)
);

CREATE TABLE kitchen_ticket_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kitchen_ticket_id UUID NOT NULL REFERENCES kitchen_tickets(id),
    order_item_id UUID NOT NULL REFERENCES order_items(id),
    quantity INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    cancelled_at TIMESTAMPTZ,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_kitchen_ticket_items UNIQUE (kitchen_ticket_id, order_item_id),
    CONSTRAINT ck_kitchen_ticket_items_quantity CHECK (quantity > 0),
    CONSTRAINT ck_kitchen_ticket_items_status CHECK (status IN ('QUEUED', 'IN_PROGRESS', 'READY', 'CANCELLED')),
    CONSTRAINT ck_kitchen_ticket_items_row_version CHECK (row_version > 0)
);

-- A bill is the account opened at a table. It may collect several orders and can
-- later be split by assigning individual order lines to different bills.
CREATE TABLE bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dining_session_id UUID REFERENCES dining_sessions(id),
    customer_id UUID REFERENCES customer_profiles(id),
    currency_id UUID NOT NULL REFERENCES currencies(id),
    name TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    issued_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    void_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT ck_bills_status CHECK (status IN ('OPEN', 'ISSUED', 'PAID', 'VOID')),
    CONSTRAINT ck_bills_row_version CHECK (row_version > 0)
);
COMMENT ON TABLE bills IS 'Cuenta independiente de mesa; el total se calcula a partir de sus líneas.';

CREATE TABLE bill_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES bills(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_bill_orders UNIQUE (bill_id, order_id)
);

CREATE TABLE bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES bills(id),
    order_item_id UUID REFERENCES order_items(id),
    line_type TEXT NOT NULL DEFAULT 'SALE',
    description_snapshot TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(14,2) NOT NULL,
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_rate_snapshot NUMERIC(9,6) NOT NULL DEFAULT 0,
    voided_at TIMESTAMPTZ,
    voided_by UUID REFERENCES users(id),
    void_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_bill_items_quantity CHECK (quantity > 0),
    CONSTRAINT ck_bill_items_amounts CHECK (unit_price >= 0 AND discount_amount >= 0 AND tax_amount >= 0),
    CONSTRAINT ck_bill_items_discount CHECK (discount_amount <= round(quantity * unit_price, 2)),
    CONSTRAINT ck_bill_items_tax_rate CHECK (tax_rate_snapshot >= 0),
    CONSTRAINT ck_bill_items_type CHECK (line_type IN ('SALE', 'DELIVERY_FEE', 'SERVICE_FEE')),
    CONSTRAINT ck_bill_items_sale_source CHECK (line_type <> 'SALE' OR order_item_id IS NOT NULL)
);

CREATE INDEX ix_orders_status ON orders (status, ordered_at, id);
CREATE INDEX ix_orders_session ON orders (dining_session_id, ordered_at, id);
CREATE INDEX ix_orders_table ON orders (table_id);
CREATE INDEX ix_order_items_order_status ON order_items (order_id, status);
CREATE INDEX ix_kitchen_tickets_queue ON kitchen_tickets (preparation_area_id, sent_at, id)
    WHERE status IN ('QUEUED', 'IN_PROGRESS');
CREATE INDEX ix_kitchen_ticket_items_order_item ON kitchen_ticket_items (order_item_id);
CREATE INDEX ix_bills_session ON bills (dining_session_id) WHERE status IN ('OPEN', 'ISSUED');
CREATE INDEX ix_bill_orders_order ON bill_orders (order_id);
CREATE INDEX ix_bill_items_bill ON bill_items (bill_id);
