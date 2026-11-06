import test from 'node:test'
import assert from 'node:assert/strict'
import { decideIndexContract, inspectIndexContract, MIGRATION_NAME } from './assessment-run-index-contract.mjs'

// ---------------------------------------------------------------------------
// decideIndexContract: the full pre/post state matrix
// ---------------------------------------------------------------------------

const allIndexStates = ['absent', 'valid', 'invalid', 'not_ready', 'definition_mismatch', 'wrong_table']

test('preflight allows a pending migration with no index yet', () => {
  assert.deepEqual(
    decideIndexContract({ phase: 'pre', migrationState: 'pending', indexState: 'absent', nameCollision: false }),
    { ok: true, errorCode: null },
  )
})

test('preflight allows a prebuilt valid index and an idempotent re-deploy', () => {
  for (const migrationState of ['pending', 'applied']) {
    assert.deepEqual(
      decideIndexContract({ phase: 'pre', migrationState, indexState: 'valid', nameCollision: false }),
      { ok: true, errorCode: null },
    )
  }
})

test('preflight refuses every broken index state, applied or not', () => {
  const expected = {
    invalid: 'INDEX_INVALID',
    not_ready: 'INDEX_NOT_READY',
    definition_mismatch: 'INDEX_DEFINITION_MISMATCH',
    wrong_table: 'INDEX_WRONG_TABLE',
  }
  for (const migrationState of ['pending', 'applied']) {
    for (const [indexState, errorCode] of Object.entries(expected)) {
      assert.deepEqual(
        decideIndexContract({ phase: 'pre', migrationState, indexState, nameCollision: false }),
        { ok: false, errorCode },
      )
    }
  }
})

test('preflight refuses an applied migration whose index is missing', () => {
  assert.deepEqual(
    decideIndexContract({ phase: 'pre', migrationState: 'applied', indexState: 'absent', nameCollision: false }),
    { ok: false, errorCode: 'INDEX_MISSING_AFTER_MIGRATION' },
  )
})

test('preflight refuses an unresolved failed migration in every index state', () => {
  for (const indexState of allIndexStates) {
    assert.deepEqual(
      decideIndexContract({ phase: 'pre', migrationState: 'failed', indexState, nameCollision: false }),
      { ok: false, errorCode: 'MIGRATION_UNRESOLVED' },
    )
  }
})

test('preflight refuses a same-name index in another schema when the target index is absent', () => {
  assert.deepEqual(
    decideIndexContract({ phase: 'pre', migrationState: 'pending', indexState: 'absent', nameCollision: true }),
    { ok: false, errorCode: 'INDEX_NAME_COLLISION' },
  )
})

test('postflight only passes when the migration is applied and the index is valid', () => {
  assert.deepEqual(
    decideIndexContract({ phase: 'post', migrationState: 'applied', indexState: 'valid', nameCollision: false }),
    { ok: true, errorCode: null },
  )
  const cases = [
    [{ migrationState: 'pending', indexState: 'valid' }, 'MIGRATION_NOT_APPLIED'],
    [{ migrationState: 'pending', indexState: 'absent' }, 'MIGRATION_NOT_APPLIED'],
    [{ migrationState: 'applied', indexState: 'absent' }, 'INDEX_MISSING_AFTER_MIGRATION'],
    [{ migrationState: 'applied', indexState: 'invalid' }, 'INDEX_INVALID'],
    [{ migrationState: 'applied', indexState: 'not_ready' }, 'INDEX_NOT_READY'],
    [{ migrationState: 'applied', indexState: 'definition_mismatch' }, 'INDEX_DEFINITION_MISMATCH'],
    [{ migrationState: 'applied', indexState: 'wrong_table' }, 'INDEX_WRONG_TABLE'],
    [{ migrationState: 'failed', indexState: 'valid' }, 'MIGRATION_UNRESOLVED'],
  ]
  for (const [input, errorCode] of cases) {
    assert.deepEqual(
      decideIndexContract({ phase: 'post', ...input, nameCollision: false }),
      { ok: false, errorCode },
    )
  }
})

test('decideIndexContract rejects an unknown phase', () => {
  assert.deepEqual(
    decideIndexContract({ phase: 'during', migrationState: 'pending', indexState: 'absent', nameCollision: false }),
    { ok: false, errorCode: 'INVALID_PHASE' },
  )
})

// ---------------------------------------------------------------------------
// inspectIndexContract: catalog rows -> states (no database needed)
// ---------------------------------------------------------------------------

function fakeQuery({ migrationTableExists = true, migrationRow = null, indexRows = [] } = {}) {
  return async (sql, ...params) => {
    if (sql.includes('information_schema.tables')) return [{ exists: migrationTableExists }]
    if (sql.includes('FROM "_prisma_migrations"')) {
      assert.equal(params[0], MIGRATION_NAME)
      return migrationRow ? [migrationRow] : []
    }
    if (sql.includes('FROM pg_class c')) return indexRows
    throw new Error(`unexpected query: ${sql.slice(0, 60)}`)
  }
}

function validIndexRow(overrides = {}) {
  return {
    index_name: 'assessment_run_executions_respondent_created_idx',
    schema_name: 'public',
    table_name: 'assessment_run_executions',
    table_schema: 'public',
    access_method: 'btree',
    indisvalid: true,
    indisready: true,
    indnkeyatts: 2,
    indnatts: 2,
    key1_name: 'respondent_actor_snapshot_id',
    key2_name: 'created_at',
    // key1 ASC (option 0), key2 DESC (option bit 0 set). The NULLS FIRST
    // bit is intentionally not asserted here; see the checker header.
    key1_option: 0,
    key2_option: 3,
    has_predicate: false,
    has_expressions: false,
    ...overrides,
  }
}

const appliedRow = { finished_at: new Date(), rolled_back_at: null, started_at: new Date() }
const failedRow = { finished_at: null, rolled_back_at: null, started_at: new Date() }

test('inspect classifies a fresh database (no migration table) as pending/absent', async () => {
  const result = await inspectIndexContract(fakeQuery({ migrationTableExists: false }), { schema: 'public' })
  assert.equal(result.migrationState, 'pending')
  assert.equal(result.migrationTableExists, false)
  assert.equal(result.indexState, 'absent')
  assert.equal(result.definitionMatches, false)
})

test('inspect classifies an applied migration with a valid index', async () => {
  const result = await inspectIndexContract(
    fakeQuery({ migrationRow: appliedRow, indexRows: [validIndexRow()] }),
    { schema: 'public' },
  )
  assert.equal(result.migrationState, 'applied')
  assert.equal(result.indexState, 'valid')
  assert.equal(result.definitionMatches, true)
  assert.deepEqual(result.nameCollision, [])
  assert.deepEqual(result.indexDetail.keyColumns, ['respondent_actor_snapshot_id', 'created_at'])
  assert.equal(result.indexDetail.key2Descending, true)
  assert.equal(result.indexDetail.key1Descending, false)
})

test('inspect detects an INVALID index (indisvalid=false)', async () => {
  const result = await inspectIndexContract(
    fakeQuery({ migrationRow: appliedRow, indexRows: [validIndexRow({ indisvalid: false, indisready: false })] }),
    { schema: 'public' },
  )
  assert.equal(result.indexState, 'invalid')
  assert.equal(result.definitionMatches, false)
})

test('inspect detects a not-ready index (indisready=false)', async () => {
  const result = await inspectIndexContract(
    fakeQuery({ indexRows: [validIndexRow({ indisready: false })] }),
    { schema: 'public' },
  )
  assert.equal(result.indexState, 'not_ready')
})

test('inspect detects a reversed column order as a definition mismatch', async () => {
  const result = await inspectIndexContract(
    fakeQuery({
      indexRows: [validIndexRow({
        key1_name: 'created_at',
        key2_name: 'respondent_actor_snapshot_id',
        key1_option: 3,
        key2_option: 0,
      })],
    }),
    { schema: 'public' },
  )
  assert.equal(result.indexState, 'definition_mismatch')
  assert.equal(result.definitionMatches, false)
})

test('inspect detects extra INCLUDE columns as a definition mismatch', async () => {
  const result = await inspectIndexContract(
    fakeQuery({ indexRows: [validIndexRow({ indnatts: 3 })] }),
    { schema: 'public' },
  )
  assert.equal(result.indexState, 'definition_mismatch')
})

test('inspect detects a partial predicate as a definition mismatch', async () => {
  const result = await inspectIndexContract(
    fakeQuery({ indexRows: [validIndexRow({ has_predicate: true })] }),
    { schema: 'public' },
  )
  assert.equal(result.indexState, 'definition_mismatch')
})

test('inspect detects a same-name index on the wrong table', async () => {
  const result = await inspectIndexContract(
    fakeQuery({ indexRows: [validIndexRow({ table_name: 'other_table' })] }),
    { schema: 'public' },
  )
  assert.equal(result.indexState, 'wrong_table')
})

test('inspect reports a same-name index in another schema as a collision', async () => {
  const result = await inspectIndexContract(
    fakeQuery({ indexRows: [validIndexRow({ schema_name: 'staging', table_name: 'assessment_run_executions' })] }),
    { schema: 'public' },
  )
  assert.equal(result.indexState, 'absent')
  assert.deepEqual(result.nameCollision, [{ schema: 'staging', table: 'assessment_run_executions' }])
})

test('inspect classifies an applied migration with a deleted index as missing', async () => {
  const result = await inspectIndexContract(
    fakeQuery({ migrationRow: appliedRow, indexRows: [] }),
    { schema: 'public' },
  )
  assert.equal(result.migrationState, 'applied')
  assert.equal(result.indexState, 'absent')
})

test('inspect classifies a started-but-unfinished migration as failed', async () => {
  const result = await inspectIndexContract(
    fakeQuery({ migrationRow: failedRow }),
    { schema: 'public' },
  )
  assert.equal(result.migrationState, 'failed')
})

test('inspect treats a rolled-back migration as pending', async () => {
  const result = await inspectIndexContract(
    fakeQuery({ migrationRow: { finished_at: new Date(), rolled_back_at: new Date(), started_at: new Date() } }),
    { schema: 'public' },
  )
  assert.equal(result.migrationState, 'pending')
})
