-- Run after V1 -> V2 -> V3 on a disposable PostgreSQL database.
BEGIN;
SET search_path = wok, public;

DO $test$
DECLARE
  review_user UUID;
  review_customer UUID;
  review_table UUID;
  review_reservation UUID;
  first_assignment UUID;
BEGIN
  INSERT INTO users (email, display_name, status)
  VALUES ('reservation-review@example.invalid', 'Reservation Review', 'ACTIVE')
  RETURNING id INTO review_user;
  INSERT INTO customer_profiles (user_id, full_name)
  VALUES (review_user, 'Reservation Review') RETURNING id INTO review_customer;
  INSERT INTO dining_tables (name, capacity, zone)
  VALUES ('temporary-review-table', 4, 'test') RETURNING id INTO review_table;
  INSERT INTO reservations (customer_id, party_size, reservation_at, ends_at)
  VALUES (review_customer, 2, now() + interval '1 day', now() + interval '1 day 2 hours')
  RETURNING id INTO review_reservation;

  INSERT INTO reservation_table_assignments
    (reservation_id, table_id, occupied_period, assigned_by)
  VALUES (review_reservation, review_table,
          tstzrange(now() + interval '1 day', now() + interval '1 day 2 hours', '[)'), review_user)
  RETURNING id INTO first_assignment;

  BEGIN
    INSERT INTO reservation_table_assignments
      (reservation_id, table_id, occupied_period, assigned_by)
    VALUES (review_reservation, review_table,
            tstzrange(now() + interval '1 day 1 hour', now() + interval '1 day 3 hours', '[)'), review_user);
    RAISE EXCEPTION 'overlapping assignment was accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;

  INSERT INTO reservation_table_assignments
    (reservation_id, table_id, occupied_period, assigned_by)
  VALUES (review_reservation, review_table,
          tstzrange(now() + interval '1 day 2 hours', now() + interval '1 day 3 hours', '[)'), review_user);

  BEGIN
    INSERT INTO reservation_table_assignments
      (reservation_id, table_id, occupied_period, assigned_by)
    VALUES (review_reservation, review_table, 'empty'::tstzrange, review_user);
    RAISE EXCEPTION 'empty assignment was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE reservation_table_assignments SET released_at = now() WHERE id = first_assignment;
  INSERT INTO reservation_table_assignments
    (reservation_id, table_id, occupied_period, assigned_by)
  VALUES (review_reservation, review_table,
          tstzrange(now() + interval '1 day', now() + interval '1 day 2 hours', '[)'), review_user);
END
$test$;
ROLLBACK;
