-- A physical table can belong to only one active dining session at a time.
SET search_path = wok, public;

CREATE UNIQUE INDEX ux_dining_session_tables_active_table
    ON dining_session_tables(table_id)
    WHERE released_at IS NULL;

CREATE INDEX ix_dining_session_tables_active_session
    ON dining_session_tables(dining_session_id, table_id)
    WHERE released_at IS NULL;
