\set ON_ERROR_STOP on
BEGIN;
DELETE FROM wok.business_hours WHERE service_type = 'RESTAURANT';
INSERT INTO wok.business_hours(service_type, weekday, opens_at, closes_at, timezone_name)
SELECT 'RESTAURANT', day, '14:00', '22:00', 'America/Guatemala'
FROM generate_series(2,7) AS day;
\set preparation_seconds 300
\set now_utc '2026-10-07T20:00:00Z'
\ir ../../.github/scripts/pickup-smoke-window.sql
SELECT :'requested_for' = '2026-10-07T20:07:00Z' AS matched \gset
\if :matched
\else
  \quit 1
\endif
-- Apertura inclusiva; la zona local no se interpreta como UTC.
\set now_utc '2026-10-07T18:00:00Z'
\ir ../../.github/scripts/pickup-smoke-window.sql
SELECT :'requested_for' = '2026-10-07T20:00:00Z' AS matched \gset
\if :matched
\else
  \quit 1
\endif
-- Lunes cerrado; no se inventa una ventana.
\set now_utc '2026-10-05T20:00:00Z'
\ir ../../.github/scripts/pickup-smoke-window.sql
SELECT :'requested_for' = '' AS matched \gset
\if :matched
\else
  \quit 1
\endif
-- Cierre exclusivo, incluyendo el cambio de fecha UTC.
\set now_utc '2026-10-08T03:53:00Z'
\ir ../../.github/scripts/pickup-smoke-window.sql
SELECT :'requested_for' = '' AS matched \gset
\if :matched
\else
  \quit 1
\endif
\set now_utc '2026-10-08T03:52:59Z'
\ir ../../.github/scripts/pickup-smoke-window.sql
SELECT :'requested_for' = '2026-10-08T03:59:59Z' AS matched \gset
\if :matched
\else
  \quit 1
\endif
-- Preparación que no cabe en el máximo real: no ampliar las tres horas.
\set now_utc '2026-10-07T20:00:00Z'
\set preparation_seconds 10800
\ir ../../.github/scripts/pickup-smoke-window.sql
SELECT :'requested_for' = '' AS matched \gset
\if :matched
\else
  \quit 1
\endif
-- La zona de cada ventana se consulta, como en el API.
UPDATE wok.business_hours SET timezone_name = 'UTC';
\set preparation_seconds 300
\set now_utc '2026-10-07T13:00:00Z'
\ir ../../.github/scripts/pickup-smoke-window.sql
SELECT :'requested_for' = '2026-10-07T14:00:00Z' AS matched \gset
\if :matched
\else
  \quit 1
\endif
ROLLBACK;
\echo 'Pickup smoke window: seven boundary checks passed.'
