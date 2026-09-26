-- Run after V1 -> V2 -> V3 -> V4 on a disposable PostgreSQL database.
SET search_path = wok, public;

DO $test$
BEGIN
  IF (SELECT count(*) FROM business_hours
      WHERE service_type = 'RESTAURANT' AND active
        AND weekday BETWEEN 2 AND 7
        AND opens_at = time '14:00' AND closes_at = time '22:00'
        AND timezone_name = 'America/Guatemala') <> 6 THEN
    RAISE EXCEPTION 'Tuesday-Sunday opening reference is incomplete';
  END IF;
  IF EXISTS (SELECT 1 FROM business_hours
             WHERE service_type = 'RESTAURANT' AND weekday = 1 AND active) THEN
    RAISE EXCEPTION 'Monday should have no active opening window';
  END IF;
END
$test$;
