-- Restaurant opening reference confirmed by coordination. ISO weekdays 2–7 = Tuesday–Sunday.
-- Kitchen cutoff, last seating and delivery deadline remain distinct service rules.
-- No Monday row means no opening window; application policy must default closed.
SET search_path = wok, public;

INSERT INTO business_hours (service_type, weekday, opens_at, closes_at, timezone_name)
SELECT 'RESTAURANT', day_number, time '14:00', time '22:00', 'America/Guatemala'
FROM generate_series(2, 7) AS day_number
WHERE NOT EXISTS (
  SELECT 1 FROM business_hours existing
  WHERE existing.service_type = 'RESTAURANT'
    AND existing.weekday = day_number
);
