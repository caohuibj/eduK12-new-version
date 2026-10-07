-- Explicit operator step, never called automatically by migration or the API.
-- Supply reviewed psql variables: target_database, migration_owner, runtime_role,
-- table_policy (the exact release's runtime-table-policy.json, not a wildcard).
-- Explicit ACL reconciliation after migration/restore; no role/ownership changes.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '10s';
SELECT set_config('eduk12.target_database', :'target_database', true);
SELECT set_config('eduk12.migration_owner', :'migration_owner', true);
SELECT set_config('eduk12.runtime_role', :'runtime_role', true);
SELECT set_config('eduk12.table_policy', :'table_policy', true);
DO $$
DECLARE
  owner_name text := current_setting('eduk12.migration_owner');
  runtime_name text := current_setting('eduk12.runtime_role');
  policy jsonb := current_setting('eduk12.table_policy')::jsonb;
  object_row record;
  category text;
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

  IF policy->>'schemaVersion' IS DISTINCT FROM '1' OR jsonb_typeof(policy->'tables') IS DISTINCT FROM 'object'
    OR policy->'tables'->>'_prisma_migrations' IS DISTINCT FROM 'MIGRATION_LEDGER'
    OR policy->'tables'->>'_legacy_import_batches' IS DISTINCT FROM 'OPERATOR_ONLY'
    OR policy->'tables'->>'_legacy_import_id_map' IS DISTINCT FROM 'OPERATOR_ONLY'
    OR EXISTS (SELECT 1 FROM jsonb_each_text(policy->'tables') item WHERE item.value NOT IN ('RUNTIME_RW','RUNTIME_READ','OPERATOR_ONLY','MIGRATION_LEDGER'))
  THEN RAISE EXCEPTION 'RUNTIME_TABLE_POLICY_INVALID'; END IF;

  -- Future tables receive no runtime authority by default. A new migration must
  -- classify each table and this explicit operator step must reconcile its ACL.
  -- PostgreSQL global defaults cannot be undone by a schema-local revoke alone.
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON TABLES FROM %I', owner_name, runtime_name);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I', owner_name, runtime_name);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON SEQUENCES FROM %I', owner_name, runtime_name);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', owner_name, runtime_name);
  FOR object_row IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') LOOP
    category := policy->'tables'->>object_row.relname;
    IF category IS NULL THEN RAISE EXCEPTION 'UNCLASSIFIED_RUNTIME_TABLE'; END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', object_row.relname, runtime_name);
    IF category='RUNTIME_RW' THEN
      EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO %I', object_row.relname, runtime_name);
    ELSIF category IN ('RUNTIME_READ','MIGRATION_LEDGER') THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO %I', object_row.relname, runtime_name);
    END IF;
    IF category <> 'RUNTIME_RW' AND (
      has_table_privilege(runtime_name,object_row.oid,'INSERT') OR has_table_privilege(runtime_name,object_row.oid,'UPDATE')
      OR has_table_privilege(runtime_name,object_row.oid,'DELETE') OR has_table_privilege(runtime_name,object_row.oid,'TRUNCATE')
      OR has_table_privilege(runtime_name,object_row.oid,'REFERENCES') OR has_table_privilege(runtime_name,object_row.oid,'TRIGGER')
      OR (category='OPERATOR_ONLY' AND has_table_privilege(runtime_name,object_row.oid,'SELECT')))
    THEN RAISE EXCEPTION 'INHERITED_RUNTIME_PRIVILEGE_FORBIDDEN'; END IF;
  END LOOP;
  FOR object_row IN SELECT c.oid,c.relname,owning.relname AS owner_table
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass AND d.objid=c.oid AND d.deptype IN ('a','i')
    LEFT JOIN pg_class owning ON owning.oid=d.refobjid
    WHERE n.nspname='public' AND c.relkind='S' LOOP
    category := policy->'tables'->>object_row.owner_table;
    IF category IS NULL THEN RAISE EXCEPTION 'UNCLASSIFIED_RUNTIME_SEQUENCE'; END IF;
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM %I', object_row.relname, runtime_name);
    IF category='RUNTIME_RW' THEN
      EXECUTE format('GRANT USAGE,SELECT ON SEQUENCE public.%I TO %I', object_row.relname, runtime_name);
    ELSIF has_sequence_privilege(runtime_name,object_row.oid,'USAGE') OR has_sequence_privilege(runtime_name,object_row.oid,'SELECT') OR has_sequence_privilege(runtime_name,object_row.oid,'UPDATE')
    THEN RAISE EXCEPTION 'INHERITED_RUNTIME_PRIVILEGE_FORBIDDEN'; END IF;
  END LOOP;
END $$;
COMMIT;
