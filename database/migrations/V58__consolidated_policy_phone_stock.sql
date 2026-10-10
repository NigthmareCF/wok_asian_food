-- LOCAL CANDIDATE CHAIN: depends on V57; no financial backfill or migration repair.
SET search_path = wok, public;
CREATE TABLE service_policy (
 id INTEGER PRIMARY KEY CHECK(id=1), version BIGINT NOT NULL DEFAULT 1,
 hold_minutes INTEGER NOT NULL DEFAULT 12 CHECK(hold_minutes BETWEEN 1 AND 60),
 table_last_arrival TIME NOT NULL DEFAULT '21:15',
 delivery_review_from TIME NOT NULL DEFAULT '20:00',
 pickup_last_arrival TIME NOT NULL DEFAULT '21:30',
 pickup_new_preparation_until TIME NOT NULL DEFAULT '21:20',
 updated_by UUID REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO service_policy(id) VALUES(1);
CREATE TABLE order_capacity_hold_inventory (
 hold_id UUID REFERENCES order_capacity_holds(id) ON DELETE CASCADE,
 item_id UUID REFERENCES items(id), quantity NUMERIC(18,6) NOT NULL CHECK(quantity>0),
 PRIMARY KEY(hold_id,item_id)
);
CREATE INDEX ix_hold_inventory_item ON order_capacity_hold_inventory(item_id,hold_id);
ALTER TABLE order_requests ADD COLUMN policy_review_required BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN logistics_confirmed_by UUID REFERENCES users(id),
 ADD COLUMN logistics_confirmed_at TIMESTAMPTZ,
 ADD COLUMN logistics_reason TEXT,
 ADD COLUMN override_by UUID REFERENCES users(id), ADD COLUMN override_reason TEXT;
CREATE TABLE phone_verifications (
 user_id UUID PRIMARY KEY REFERENCES users(id), phone TEXT NOT NULL,
 verified_at TIMESTAMPTZ, real_possession BOOLEAN NOT NULL DEFAULT false,
 CHECK(verified_at IS NOT NULL OR NOT real_possession)
);
CREATE TABLE phone_verification_challenges (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id),
 phone TEXT NOT NULL, code_digest TEXT NOT NULL, provider_real BOOLEAN NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','VERIFIED','EXPIRED','FAILED','SUPERSEDED'))
);
CREATE INDEX ix_phone_challenge_user_time ON phone_verification_challenges(user_id,created_at);
CREATE FUNCTION invalidate_phone_verification() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.phone IS DISTINCT FROM OLD.phone THEN
  DELETE FROM phone_verifications WHERE user_id=NEW.id;
  UPDATE phone_verification_challenges SET status='SUPERSEDED' WHERE user_id=NEW.id AND status='PENDING';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER users_phone_verification_change AFTER UPDATE OF phone ON users
 FOR EACH ROW EXECUTE FUNCTION invalidate_phone_verification();
