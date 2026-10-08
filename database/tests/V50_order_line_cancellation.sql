BEGIN;
SET search_path = wok, public;

DO $$ BEGIN
  IF to_regclass('wok.order_item_resource_reservations') IS NULL THEN
    RAISE EXCEPTION 'per-line resource snapshots table is missing';
  END IF;
  IF to_regclass('wok.order_item_change_events') IS NULL THEN
    RAISE EXCEPTION 'order line audit table is missing';
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'wok' AND table_name = 'order_items' AND column_name = 'resource_snapshot_complete'
  ) THEN
    RAISE EXCEPTION 'resource snapshot completion marker is missing';
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'wok.inventory_movements'::regclass AND conname = 'ck_inventory_movements_order_reference'
  ) THEN
    RAISE EXCEPTION 'inventory waste order reference constraint is missing';
  END IF;
END $$;

ROLLBACK;
