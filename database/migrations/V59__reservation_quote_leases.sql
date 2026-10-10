-- LOCAL CANDIDATE ONLY. Depends on V58 and preserved reservation V3/V5/V7.
SET search_path=wok,public;
CREATE TABLE reservation_quotes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),customer_user_id UUID NOT NULL REFERENCES users(id),
 idempotency_key UUID NOT NULL,request_fingerprint TEXT NOT NULL,
 party_size INTEGER NOT NULL CHECK(party_size BETWEEN 1 AND 50),requested_at TIMESTAMPTZ NOT NULL,
 preorder_complete BOOLEAN NOT NULL,expires_at TIMESTAMPTZ NOT NULL,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','CONSUMED','EXPIRED')),
 reservation_id UUID REFERENCES reservations(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(customer_user_id,idempotency_key)
);
CREATE TABLE reservation_quote_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),quote_id UUID NOT NULL REFERENCES reservation_quotes(id),
 menu_item_id UUID NOT NULL REFERENCES menu_items(id),name_snapshot TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 50),unit_price NUMERIC(14,2) NOT NULL CHECK(unit_price>=0),
 currency_id UUID NOT NULL REFERENCES currencies(id),modifier_ids UUID[] NOT NULL DEFAULT '{}',
 UNIQUE(quote_id,menu_item_id)
);
CREATE TABLE reservation_capacity_holds (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),quote_id UUID NOT NULL UNIQUE REFERENCES reservation_quotes(id),
 reservation_id UUID NOT NULL UNIQUE REFERENCES reservations(id),expires_at TIMESTAMPTZ NOT NULL,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','CONVERTED','EXPIRED','RELEASED')),
 ended_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK((status='ACTIVE' AND ended_at IS NULL) OR (status<>'ACTIVE' AND ended_at IS NOT NULL))
);
CREATE TABLE reservation_capacity_hold_tables (
 hold_id UUID NOT NULL REFERENCES reservation_capacity_holds(id),table_id UUID NOT NULL REFERENCES dining_tables(id),
 occupied_period TSTZRANGE NOT NULL,PRIMARY KEY(hold_id,table_id)
);
CREATE INDEX ix_reservation_hold_table ON reservation_capacity_hold_tables(table_id);
CREATE TABLE reservation_capacity_hold_inventory (
 hold_id UUID NOT NULL REFERENCES reservation_capacity_holds(id),item_id UUID NOT NULL REFERENCES items(id),
 quantity NUMERIC(18,6) NOT NULL CHECK(quantity>0),PRIMARY KEY(hold_id,item_id)
);
CREATE INDEX ix_reservation_hold_inventory_item ON reservation_capacity_hold_inventory(item_id);
CREATE INDEX ix_reservation_hold_expiry ON reservation_capacity_holds(expires_at) WHERE status='ACTIVE';
ALTER TABLE reservations ADD COLUMN preorder_order_id UUID REFERENCES orders(id);
