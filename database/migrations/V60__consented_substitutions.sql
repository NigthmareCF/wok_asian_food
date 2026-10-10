-- LOCAL CANDIDATE ONLY. Depends on V57-V59. Does not introduce payments or refunds.
SET search_path=wok,public;
CREATE TABLE order_substitution_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_request_id UUID NOT NULL REFERENCES order_requests(id),
 order_id UUID NOT NULL REFERENCES orders(id),order_item_id UUID NOT NULL REFERENCES order_items(id),
 customer_user_id UUID NOT NULL REFERENCES users(id),proposed_by UUID NOT NULL REFERENCES users(id),
 replacement_menu_item_id UUID NOT NULL REFERENCES menu_items(id),replacement_name TEXT NOT NULL,
 replacement_unit_price NUMERIC(14,2) NOT NULL CHECK(replacement_unit_price>=0),
 modifier_ids UUID[] NOT NULL DEFAULT '{}',quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 50),
 price_difference NUMERIC(14,2) NOT NULL,expected_order_version INTEGER NOT NULL CHECK(expected_order_version>0),
 status TEXT NOT NULL DEFAULT 'PENDING_CONSENT'
 CHECK(status IN('PENDING_CONSENT','CONSENTED','DECLINED','EXPIRED','APPLIED','REJECTED','FINANCIAL_REVIEW_REQUIRED')),
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 decision_reason TEXT,financial_resolution TEXT NOT NULL DEFAULT 'NOT_REQUIRED'
 CHECK(financial_resolution IN('NOT_REQUIRED','BLOCKED_NO_CONTRACT')),
 expires_at TIMESTAMPTZ NOT NULL,consented_at TIMESTAMPTZ,decided_by UUID REFERENCES users(id),
 decided_at TIMESTAMPTZ,row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_active_substitution_item ON order_substitution_requests(order_item_id)
 WHERE status IN('PENDING_CONSENT','CONSENTED','FINANCIAL_REVIEW_REQUIRED');
CREATE TABLE order_substitution_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),substitution_id UUID NOT NULL REFERENCES order_substitution_requests(id),
 actor_user_id UUID NOT NULL REFERENCES users(id),event_type TEXT NOT NULL,reason TEXT,
 request_id UUID NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wok.service_policy_change_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), snapshot jsonb NOT NULL);

ALTER TABLE wok.order_substitution_requests ADD COLUMN original_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE order_substitution_requests ALTER COLUMN order_request_id DROP NOT NULL;
ALTER TABLE order_substitution_requests ADD COLUMN reservation_id UUID REFERENCES reservations(id);
ALTER TABLE order_substitution_requests ADD CONSTRAINT ck_substitution_origin CHECK ((order_request_id IS NOT NULL) <> (reservation_id IS NOT NULL));
CREATE TABLE reservation_preorder_substitutions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),reservation_id UUID NOT NULL REFERENCES reservations(id),
 reservation_item_id UUID NOT NULL REFERENCES reservation_request_items(id),customer_user_id UUID NOT NULL REFERENCES users(id),
 replacement_menu_item_id UUID NOT NULL REFERENCES menu_items(id),replacement_name TEXT NOT NULL,
 replacement_unit_price NUMERIC(14,2) NOT NULL CHECK(replacement_unit_price>=0),currency_id UUID NOT NULL REFERENCES currencies(id),
 original_name TEXT NOT NULL,original_price NUMERIC(14,2) NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),
 modifier_ids UUID[] NOT NULL DEFAULT '{}',price_difference NUMERIC(14,2) NOT NULL,expected_reservation_version INTEGER NOT NULL,
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),status TEXT NOT NULL DEFAULT 'PENDING_CONSENT'
 CHECK(status IN('PENDING_CONSENT','CONSENTED','DECLINED','APPLIED','REJECTED','EXPIRED')),
 row_version INTEGER NOT NULL DEFAULT 1,expires_at TIMESTAMPTZ NOT NULL,consented_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_preorder_substitution_active ON reservation_preorder_substitutions(reservation_item_id) WHERE status IN('PENDING_CONSENT','CONSENTED');
