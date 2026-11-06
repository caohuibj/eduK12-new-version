#!/usr/bin/env node

/**
 * Read-only deployment contract check for the assessment-run respondent index.
 *
 * Index under contract (PR #646):
 *   CREATE INDEX assessment_run_executions_respondent_created_idx
 *   ON assessment_run_executions (respondent_actor_snapshot_id, created_at DESC)
 *   migration: 20261106090000_assessment_run_executions_respondent_created_idx
 *
 * Why this check exists (see review findings C-01 / C-04):
 * - A cancelled `CREATE INDEX CONCURRENTLY` build leaves an INVALID index
 *   (`indisvalid=false`); a later `prisma migrate deploy` with
 *   `CREATE INDEX IF NOT EXISTS` silently skips it and records success, so
 *   production can run without the index and no error is ever raised.
 * - A same-name index with the wrong definition (e.g. reversed column order)
 *   is likewise kept by `IF NOT EXISTS` with only a NOTICE.
 * This checker is the only place that refuses to deploy in those states.
 *
 * Usage:
 *   node scripts/assessment-run-index-contract.mjs pre|post [--schema <name>]
 *
 * - `pre`  runs before `prisma migrate deploy`: an index that does not exist
 *   yet is allowed (the migration has not run); an index that exists but is
 *   INVALID / not-ready / wrongly defined / on the wrong table refuses; a
 *   migration recorded as applied while the index is missing refuses.
 * - `post` runs after `prisma migrate deploy`: the migration must be recorded
 *   as applied and the index must exist, valid, ready and exactly defined.
 *
 * The check is read-only (SELECT only) and never modifies the database. It
 * prints exactly one JSON object to stdout and exits 0 when the contract
 * holds, 1 when it does not, 2 on usage/configuration errors. The database
 * password is never printed.
 *
 * Definition matching uses structured PostgreSQL catalog metadata
 * (`pg_index` / `pg_attribute` / `pg_am`), not a `pg_get_indexdef()` string
 * comparison, so formatting differences between PostgreSQL versions cannot
 * cause a false verdict.
 */

import { pathToFileURL } from 'node:url'

export const MIGRATION_NAME = '20261106090000_assessment_run_executions_respondent_created_idx'
export const INDEX_NAME = 'assessment_run_executions_respondent_created_idx'
export const TABLE_NAME = 'assessment_run_executions'
export const EXPECTED_KEY_COLUMNS = ['respondent_actor_snapshot_id', 'created_at']
export const DEFAULT_SCHEMA = 'public'

// pg_index.indoption bit 0 (0x0001) = column is DESC. The NULLS FIRST/LAST
// bit is intentionally not checked: respondent_actor_snapshot_id is NOT NULL
// and created_at DESC is defined by the DESC bit alone.
const INDOPTION_DESC = 1

/**
 * Pure decision function: given the observed states, decide whether the
 * contract holds for the requested phase. No I/O, fully unit-testable.
 *
 * @param {object} input
 * @param {'pre'|'post'} input.phase
 * @param {'pending'|'applied'|'failed'} input.migrationState
 * @param {'absent'|'valid'|'invalid'|'not_ready'|'definition_mismatch'|'wrong_table'} input.indexState
 * @param {boolean} input.nameCollision - a same-name index exists in another schema
 * @returns {{ ok: boolean, errorCode: string|null }}
 */
export function decideIndexContract({ phase, migrationState, indexState, nameCollision }) {
  if (phase !== 'pre' && phase !== 'post') {
    return { ok: false, errorCode: 'INVALID_PHASE' }
  }
  if (migrationState === 'failed') {
    return { ok: false, errorCode: 'MIGRATION_UNRESOLVED' }
  }
  if (indexState === 'invalid') {
    return { ok: false, errorCode: 'INDEX_INVALID' }
  }
  if (indexState === 'not_ready') {
    return { ok: false, errorCode: 'INDEX_NOT_READY' }
  }
  if (indexState === 'wrong_table') {
    return { ok: false, errorCode: 'INDEX_WRONG_TABLE' }
  }
  if (indexState === 'definition_mismatch') {
    return { ok: false, errorCode: 'INDEX_DEFINITION_MISMATCH' }
  }
  if (phase === 'post') {
    if (migrationState !== 'applied') {
      return { ok: false, errorCode: 'MIGRATION_NOT_APPLIED' }
    }
    if (indexState !== 'valid') {
      // indexState === 'absent' here; every other state was handled above.
      return { ok: false, errorCode: 'INDEX_MISSING_AFTER_MIGRATION' }
    }
    return { ok: true, errorCode: null }
  }
  // phase === 'pre'
  if (migrationState === 'applied' && indexState === 'absent') {
    return { ok: false, errorCode: 'INDEX_MISSING_AFTER_MIGRATION' }
  }
  if (indexState === 'absent' && nameCollision) {
    // A same-name index in another schema can shadow creation through
    // `CREATE INDEX IF NOT EXISTS` (search_path resolution). Refuse rather
    // than risk a silent skip.
    return { ok: false, errorCode: 'INDEX_NAME_COLLISION' }
  }
  return { ok: true, errorCode: null }
}

/**
 * Inspect the database and classify the migration + index states.
 *
 * @param {(sql: string, ...params: unknown[]) => Promise<Record<string, unknown>[]>} query
 *   a function executing one SELECT and returning its rows (e.g. a thin
 *   wrapper over `prisma.$queryRawUnsafe`). Injected so unit tests can feed
 *   canned catalog rows without a database.
 * @param {{ schema: string }} options
 * @returns {Promise<{ migrationState, migrationTableExists, indexState,
 *   definitionMatches: boolean, nameCollision: Array<{schema: string, table: string}>,
 *   indexDetail: object|null }>}
 */
export async function inspectIndexContract(query, { schema }) {
  const migrationTableRows = await query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = '_prisma_migrations'
     ) AS exists`,
    schema,
  )
  const migrationTableExists = Boolean(migrationTableRows[0]?.exists)

  let migrationState = 'pending'
  if (migrationTableExists) {
    const migrationRows = await query(
      `SELECT finished_at, rolled_back_at, started_at
         FROM "_prisma_migrations"
        WHERE migration_name = $1
        ORDER BY started_at DESC
        LIMIT 1`,
      MIGRATION_NAME,
    )
    const row = migrationRows[0]
    if (row) {
      if (row.finished_at !== null && row.finished_at !== undefined && row.rolled_back_at === null) {
        migrationState = 'applied'
      } else if (row.finished_at === null || row.finished_at === undefined) {
        // A started-but-unfinished migration blocks every later deploy until
        // `prisma migrate resolve` runs; refuse with a distinct code.
        migrationState = 'failed'
      }
      // rolled_back_at set (and finished_at set) => treated as pending: the
      // migration is not applied, the index may legitimately be absent.
    }
  }

  // Every same-name index in every schema: the target row drives the
  // verdict, foreign rows are reported as a possible shadowing hazard.
  const indexRows = await query(
    `SELECT c.relname AS index_name,
            n.nspname AS schema_name,
            t.relname AS table_name,
            tn.nspname AS table_schema,
            a.amname AS access_method,
            i.indisvalid AS indisvalid,
            i.indisready AS indisready,
            i.indnkeyatts AS indnkeyatts,
            i.indnatts AS indnatts,
            (SELECT attname FROM pg_attribute
              WHERE attrelid = i.indrelid AND attnum = i.indkey[0]) AS key1_name,
            (SELECT attname FROM pg_attribute
              WHERE attrelid = i.indrelid AND attnum = i.indkey[1]) AS key2_name,
            i.indoption[0] AS key1_option,
            i.indoption[1] AS key2_option,
            i.indpred IS NOT NULL AS has_predicate,
            i.indexprs IS NOT NULL AS has_expressions
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_index i ON i.indexrelid = c.oid
       JOIN pg_class t ON t.oid = i.indrelid
       JOIN pg_namespace tn ON tn.oid = t.relnamespace
       JOIN pg_am a ON a.oid = c.relam
      WHERE c.relname = $1 AND c.relkind = 'i'`,
    INDEX_NAME,
  )

  const targetRows = indexRows.filter((row) => row.schema_name === schema)
  const foreignRows = indexRows.filter((row) => row.schema_name !== schema)
  const nameCollision = foreignRows.map((row) => ({ schema: row.schema_name, table: row.table_name }))

  let indexState = 'absent'
  let definitionMatches = false
  let indexDetail = null
  const target = targetRows[0]
  if (target) {
    indexDetail = {
      schema: target.schema_name,
      table: target.table_name,
      accessMethod: target.access_method,
      indisvalid: Boolean(target.indisvalid),
      indisready: Boolean(target.indisready),
      keyColumns: [target.key1_name, target.key2_name],
      key1Descending: (Number(target.key1_option) & INDOPTION_DESC) === INDOPTION_DESC,
      key2Descending: (Number(target.key2_option) & INDOPTION_DESC) === INDOPTION_DESC,
      hasPredicate: Boolean(target.has_predicate),
      hasExpressions: Boolean(target.has_expressions),
      keyColumnCount: Number(target.indnkeyatts),
      totalColumnCount: Number(target.indnatts),
    }
    if (target.table_name !== TABLE_NAME || target.table_schema !== schema) {
      indexState = 'wrong_table'
    } else if (!target.indisvalid) {
      indexState = 'invalid'
    } else if (!target.indisready) {
      indexState = 'not_ready'
    } else {
      definitionMatches =
        target.access_method === 'btree' &&
        Number(target.indnkeyatts) === EXPECTED_KEY_COLUMNS.length &&
        Number(target.indnatts) === EXPECTED_KEY_COLUMNS.length &&
        target.key1_name === EXPECTED_KEY_COLUMNS[0] &&
        target.key2_name === EXPECTED_KEY_COLUMNS[1] &&
        (Number(target.key1_option) & INDOPTION_DESC) === 0 &&
        (Number(target.key2_option) & INDOPTION_DESC) === INDOPTION_DESC &&
        !target.has_predicate &&
        !target.has_expressions
      indexState = definitionMatches ? 'valid' : 'definition_mismatch'
    }
  }

  return { migrationState, migrationTableExists, indexState, definitionMatches, nameCollision, indexDetail }
}

function parseSchemaFromDatabaseUrl(databaseUrl) {
  try {
    const url = new URL(databaseUrl)
    return url.searchParams.get('schema') || null
  } catch {
    return null
  }
}

function printUsage() {
  console.error('usage: assessment-run-index-contract.mjs pre|post [--schema <name>]')
}

async function main(argv) {
  const [phase, ...rest] = argv
  if (phase !== 'pre' && phase !== 'post') {
    printUsage()
    return 2
  }
  let schemaFlag = null
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--schema' && i + 1 < rest.length) {
      schemaFlag = rest[i + 1]
      i += 1
    } else {
      printUsage()
      return 2
    }
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.log(JSON.stringify({
      check: 'respondent_execution_index',
      phase,
      schema: schemaFlag || DEFAULT_SCHEMA,
      migrationState: 'unknown',
      indexState: 'unknown',
      definitionMatches: false,
      nameCollision: [],
      ok: false,
      errorCode: 'DATABASE_URL_MISSING',
      message: 'DATABASE_URL is not set',
    }))
    return 2
  }
  const urlSchema = parseSchemaFromDatabaseUrl(databaseUrl)
  if (schemaFlag && urlSchema && schemaFlag !== urlSchema) {
    console.log(JSON.stringify({
      check: 'respondent_execution_index',
      phase,
      schema: schemaFlag,
      migrationState: 'unknown',
      indexState: 'unknown',
      definitionMatches: false,
      nameCollision: [],
      ok: false,
      errorCode: 'SCHEMA_MISMATCH',
      message: `--schema (${schemaFlag}) does not match the schema in DATABASE_URL (${urlSchema})`,
    }))
    return 1
  }
  const schema = schemaFlag || urlSchema || DEFAULT_SCHEMA

  // Imported lazily so unit tests can import this module (decision function
  // and inspect with an injected query) without @prisma/client installed.
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()
  try {
    const query = (sql, ...params) => prisma.$queryRawUnsafe(sql, ...params)
    const inspected = await inspectIndexContract(query, { schema })
    const decision = decideIndexContract({
      phase,
      migrationState: inspected.migrationState,
      indexState: inspected.indexState,
      nameCollision: inspected.nameCollision.length > 0,
    })
    const result = {
      check: 'respondent_execution_index',
      phase,
      schema,
      migrationState: inspected.migrationState,
      migrationTableExists: inspected.migrationTableExists,
      indexState: inspected.indexState,
      definitionMatches: inspected.definitionMatches,
      nameCollision: inspected.nameCollision,
      indexDetail: inspected.indexDetail,
      ok: decision.ok,
      errorCode: decision.errorCode,
      message: decision.ok
        ? `index contract holds (${phase})`
        : `index contract refused (${phase}): ${decision.errorCode}`,
    }
    console.log(JSON.stringify(result))
    if (!decision.ok) {
      console.error(`[index-contract] ${result.message}`)
    }
    return decision.ok ? 0 : 1
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2))
}
