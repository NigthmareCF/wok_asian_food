-- Run with an authorized read-only connection on each persistent deployment.
-- This inventory does not assign migration versions or change deployment data.
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_pretty(jsonb_build_object(
    'database', current_database(),
    'capturedAt', current_timestamp,
    'history', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'installedRank', installed_rank,
            'version', version,
            'description', description,
            'type', type,
            'script', script,
            'checksum', checksum,
            'installedOn', installed_on,
            'success', success
        ) ORDER BY installed_rank)
        FROM public.flyway_schema_history
    ), '[]'::jsonb),
    'cashMovementIndexes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('name', indexname, 'definition', indexdef) ORDER BY indexname)
        FROM pg_indexes
        WHERE schemaname = 'wok' AND tablename = 'cash_movements'
    ), '[]'::jsonb)
));
ROLLBACK;
