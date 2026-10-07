-- Pickup follows the kitchen cutoff; external delivery closes earlier.
SET search_path = wok, public;

INSERT INTO business_hours (service_type, weekday, opens_at, closes_at, timezone_name)
SELECT 'PICKUP', day_number, time '14:00', time '21:30', 'America/Guatemala'
FROM generate_series(2, 7) AS day_number
WHERE NOT EXISTS (
  SELECT 1 FROM business_hours existing
  WHERE existing.service_type = 'PICKUP' AND existing.weekday = day_number
);

INSERT INTO business_hours (service_type, weekday, opens_at, closes_at, timezone_name)
SELECT 'DELIVERY', day_number, time '14:00', time '21:00', 'America/Guatemala'
FROM generate_series(2, 7) AS day_number
WHERE NOT EXISTS (
  SELECT 1 FROM business_hours existing
  WHERE existing.service_type = 'DELIVERY' AND existing.weekday = day_number
);
