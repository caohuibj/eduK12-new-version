-- Explicit operator step, never called automatically by migration or the API.
-- Supply reviewed psql variables: target_database, migration_owner, runtime_role.
-- No role creation, existing business-table grants or ownership changes.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '10s';
SELECT set_config('eduk12.target_database', :'target_database', true);
SELECT set_config('eduk12.migration_owner', :'migration_owner', true);
SELECT set_config('eduk12.runtime_role', :'runtime_role', true);
DO $$
DECLARE
  owner_name text := current_setting('eduk12.migration_owner');
  runtime_name text := current_setting('eduk12.runtime_role');
BEGIN
  IF current_database() <> current_setting('eduk12.target_database')
    OR current_user <> owner_name OR session_user <> owner_name
    OR runtime_name = owner_name
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_name AND rolcanlogin)
    OR EXISTS (SELECT 1 FROM pg_roles r WHERE pg_has_role(runtime_name, r.oid, 'MEMBER')
      AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR r.rolreplication))
    OR has_database_privilege(runtime_name, current_database(), 'CREATE')
    OR has_schema_privilege(runtime_name, 'public', 'CREATE')
    OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname='public' AND pg_has_role(runtime_name,n.nspowner,'MEMBER'))
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m')
        AND (pg_get_userbyid(c.relowner) <> owner_name OR pg_has_role(runtime_name,c.relowner,'MEMBER')))
    OR to_regclass('public._prisma_migrations') IS NULL
  THEN RAISE EXCEPTION 'EXACT_RUNTIME_PROVISION_SCOPE_MISMATCH'; END IF;

  -- Only future objects created by this exact migration owner in public.
  -- The public schema must be the reviewed, dedicated application schema.
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO %I', owner_name, runtime_name);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO %I', owner_name, runtime_name);
  -- Defaults have no per-table exclusion. Protect the existing migration
  -- ledger explicitly; re-run this operator step if that ledger is recreated.
  EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public._prisma_migrations FROM %I', runtime_name);
  EXECUTE format('GRANT SELECT ON TABLE public._prisma_migrations TO %I', runtime_name);
  IF has_table_privilege(runtime_name,'public._prisma_migrations','INSERT')
    OR has_table_privilege(runtime_name,'public._prisma_migrations','UPDATE')
    OR has_table_privilege(runtime_name,'public._prisma_migrations','DELETE')
    OR has_table_privilege(runtime_name,'public._prisma_migrations','TRUNCATE')
    OR has_table_privilege(runtime_name,'public._prisma_migrations','REFERENCES')
    OR has_table_privilege(runtime_name,'public._prisma_migrations','TRIGGER')
  THEN RAISE EXCEPTION 'MIGRATION_LEDGER_NOT_READ_ONLY'; END IF;
END $$;
COMMIT;
