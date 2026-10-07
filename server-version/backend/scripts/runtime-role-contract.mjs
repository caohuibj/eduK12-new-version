import { PrismaClient } from '@prisma/client'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { verifyReleaseSchema } from './release-schema-contract.mjs'

export const runtimeTablePolicy = JSON.parse(readFileSync(new URL('./runtime-table-policy.json', import.meta.url), 'utf8'))
const classes = ['RUNTIME_RW', 'RUNTIME_READ', 'OPERATOR_ONLY', 'MIGRATION_LEDGER']
if (runtimeTablePolicy.schemaVersion !== 1 || !runtimeTablePolicy.tables
  || Object.values(runtimeTablePolicy.tables).some(value => !classes.includes(value))
  || runtimeTablePolicy.tables._prisma_migrations !== 'MIGRATION_LEDGER'
  || ['_legacy_import_batches', '_legacy_import_id_map'].some(name => runtimeTablePolicy.tables[name] !== 'OPERATOR_ONLY')) {
  throw new Error('RUNTIME_TABLE_POLICY_INVALID')
}

/** Read-only verification using the actual connected runtime principal. This
 * script never grants privileges, changes roles, or stands in with owner credentials. */
export async function verifyRuntimePrivileges(db) {
  const [identity] = await db.$queryRawUnsafe(`SELECT current_user=session_user AND NOT EXISTS (
    SELECT 1 FROM pg_roles r WHERE pg_has_role(current_user,r.oid,'MEMBER')
      AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR r.rolreplication)
    ) AND NOT has_database_privilege(current_user,current_database(),'CREATE')
      AND NOT has_schema_privilege(current_user,'public','CREATE')
      AND NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname='public' AND pg_has_role(current_user,n.nspowner,'MEMBER'))
      AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m') AND pg_has_role(current_user,c.relowner,'MEMBER')) AS restricted`)
  if (!identity?.restricted) throw new Error('RUNTIME_ROLE_NOT_RESTRICTED')
  const [schema] = await db.$queryRawUnsafe("SELECT has_schema_privilege(current_user,'public','USAGE') AS usable")
  const tables = await db.$queryRawUnsafe(`SELECT c.relname AS name,
    has_table_privilege(current_user,c.oid,'SELECT') AS readable,
    (has_table_privilege(current_user,c.oid,'INSERT')
      AND has_table_privilege(current_user,c.oid,'UPDATE') AND has_table_privilege(current_user,c.oid,'DELETE')) AS writable,
    NOT (has_table_privilege(current_user,c.oid,'INSERT')
      OR has_table_privilege(current_user,c.oid,'UPDATE') OR has_table_privilege(current_user,c.oid,'DELETE')
      OR has_table_privilege(current_user,c.oid,'TRUNCATE') OR has_table_privilege(current_user,c.oid,'REFERENCES')
      OR has_table_privilege(current_user,c.oid,'TRIGGER')) AS read_only
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')`)
  const sequences = await db.$queryRawUnsafe(`SELECT c.relname AS name,owning.relname AS owner_table,
    has_sequence_privilege(current_user,c.oid,'USAGE') AND has_sequence_privilege(current_user,c.oid,'SELECT') AS usable,
    NOT (has_sequence_privilege(current_user,c.oid,'USAGE') OR has_sequence_privilege(current_user,c.oid,'SELECT')
      OR has_sequence_privilege(current_user,c.oid,'UPDATE')) AS inaccessible
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass AND d.objid=c.oid AND d.deptype IN ('a','i')
    LEFT JOIN pg_class owning ON owning.oid=d.refobjid
    WHERE n.nspname='public' AND c.relkind='S'`)
  const validTable = row => {
    const category = runtimeTablePolicy.tables[row.name]
    if (category === 'OPERATOR_ONLY') return !row.readable && row.read_only
    if (category === 'MIGRATION_LEDGER' || category === 'RUNTIME_READ') return row.readable && row.read_only
    return category === 'RUNTIME_RW' && row.readable && row.writable
  }
  const validSequence = row => {
    const category = runtimeTablePolicy.tables[row.owner_table]
    return category === 'RUNTIME_RW' ? row.usable : ['OPERATOR_ONLY','RUNTIME_READ','MIGRATION_LEDGER'].includes(category) && row.inaccessible
  }
  if (!schema.usable || !tables.length || tables.some(row => !validTable(row)) || sequences.some(row => !validSequence(row))) {
    throw new Error('RUNTIME_PRIVILEGES_INCOMPLETE')
  }
  return { runtimeTables: tables.length, runtimeSequences: sequences.length, restrictedRuntimeRole: true }
}

export async function verifyConfiguredRuntime({ current = false, allowIsolatedTestAbsence = false } = {}) {
  const runtimeUrl = current ? process.env.DATABASE_URL : process.env.DATABASE_URL_RUNTIME
  if (!runtimeUrl) {
    if (current || !allowIsolatedTestAbsence) throw new Error('DATABASE_URL_RUNTIME_REQUIRED')
    // The existing owner-only disposable code gates are not production runtime
    // proofs. Preserve their data checks while explicitly recording this gap.
    // Production, deployment and verify-current can never use this exception.
    const source = new URL(process.env.DATABASE_URL || '')
    const isolated = process.env.NODE_ENV === 'test' && ['localhost', '127.0.0.1'].includes(source.hostname)
      && ((process.env.CI === 'true' && source.pathname === '/ptool')
        || (process.env.RELEASE_VERIFY_LOCAL === 'true' && source.pathname === '/eduk12_release'))
    if (isolated) return { runtimeRoleVerified: false, reason: 'owner_only_disposable_code_gate' }
    throw new Error('DATABASE_URL_RUNTIME_REQUIRED')
  }
  if (!current && process.env.DATABASE_URL) {
    const source = new URL(process.env.DATABASE_URL), target = new URL(runtimeUrl)
    if (source.hostname !== target.hostname || source.port !== target.port || source.pathname !== target.pathname) throw new Error('RUNTIME_DATABASE_MISMATCH')
  }
  const runtime = new PrismaClient({ datasources: { db: { url: runtimeUrl } } })
  try {
    return { ...await verifyRuntimePrivileges(runtime), ...await verifyReleaseSchema(runtime) }
  } finally { await runtime.$disconnect() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const mode = process.argv[2]
    if (mode === 'post-migrate' && !process.env.DATABASE_URL_RUNTIME && process.env.NODE_ENV !== 'production' && process.env.RUNTIME_ROLE_REQUIRED !== 'true') {
      console.log(JSON.stringify({ skipped: true, reason: 'local_runtime_role_not_configured' }))
    } else {
      if (!['post-migrate', 'verify', 'verify-current'].includes(mode)) throw new Error('RUNTIME_ROLE_MODE_REQUIRED')
      console.log(JSON.stringify({ ok: true, ...await verifyConfiguredRuntime({ current: mode === 'verify-current' }) }))
    }
  } catch { process.stderr.write('runtime role/schema preflight failed\n'); process.exitCode = 1 }
}
