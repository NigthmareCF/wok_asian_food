-- Fixture: refleja PickupSchedulePolicy; no modifica reglas ni datos.
-- Cantidad/preparación se obtiene del mismo producto enviado por el smoke.
-- Margen de transporte de 120s y de máximo de 60s, sin ampliar las 3h del API.
WITH bounds AS (
    SELECT :'now_utc'::timestamptz AS now_utc,
           :'preparation_seconds'::bigint AS preparation_seconds
), candidates AS (
    SELECT candidate
    FROM bounds
    CROSS JOIN LATERAL generate_series(
        now_utc + (preparation_seconds + 120) * interval '1 second',
        now_utc + interval '3 hours' - interval '60 seconds',
        interval '1 second'
    ) AS candidate
    WHERE preparation_seconds >= 0 AND preparation_seconds <= 86400
)
SELECT coalesce(to_char(min(candidate) AT TIME ZONE 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '') AS requested_for
FROM candidates
WHERE EXISTS (
    SELECT 1 FROM wok.business_hours AS hours
    WHERE hours.service_type = 'RESTAURANT' AND hours.active
      AND hours.weekday = extract(isodow FROM candidate AT TIME ZONE 'America/Guatemala')
      AND (candidate AT TIME ZONE hours.timezone_name)::time >= hours.opens_at
      AND (candidate AT TIME ZONE hours.timezone_name)::time < hours.closes_at
)
\gset
\echo :requested_for
