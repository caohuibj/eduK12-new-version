-- Prepared only; NOT executed against production. Use an already-authorized
-- read-only connection. No answer data, SQL text, credentials or new grants.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SELECT current_timestamp AS observed_at,current_database() AS database,
       version() AS postgres,pg_database_size(current_database()) AS database_bytes,
       pg_postmaster_start_time() AS started_at;
SELECT c.relname AS relation,pg_relation_size(c.oid) AS heap_main_bytes,
       pg_table_size(c.oid) AS table_with_aux_bytes,
       pg_indexes_size(c.oid) AS index_bytes,
       pg_total_relation_size(c.oid) AS total_relation_bytes,
       s.n_live_tup AS estimated_live_tuples,s.n_dead_tup AS estimated_dead_tuples,
       s.last_analyze,s.last_autoanalyze
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid
WHERE n.nspname='public' AND c.relkind IN ('r','p')
ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 50;
SELECT state,wait_event_type,count(*) AS connections
FROM pg_stat_activity WHERE datname=current_database() GROUP BY state,wait_event_type;
SELECT name,setting,unit FROM pg_settings
WHERE name IN ('max_connections','shared_buffers','work_mem','maintenance_work_mem',
               'max_wal_size','min_wal_size','wal_keep_size','max_slot_wal_keep_size');
-- Cumulative writes since reset, NOT retained WAL files or backup bytes.
SELECT wal_records,wal_fpi,wal_bytes,stats_reset FROM pg_stat_wal;
COMMIT;
