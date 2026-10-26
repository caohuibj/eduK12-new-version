/**
 * Development-only explicit batch runner. Not imported by production runtime; never activates content.
 * Run from backend: tsx scripts/scale-content-batch.ts --manifest FILE --out DIR
 * Add --apply --actor-user-id ID only for a disposable non-owner PostgreSQL database.
 */
import { createHash } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import type { PrismaClient, Prisma } from '@prisma/client'
import { defineScaleInstrumentSource } from '../src/modules/scale/onboarding/define-instrument'
import { buildScaleResult, parseScaleResultV2 } from '../src/modules/scale/scale-result'
import { canonicalHash } from '../src/modules/assessment-runtime/canonical'
import { hashScaleDefinition } from '../src/modules/scale/scale-definition'

export const batchManifestSchema = z.object({
  schemaVersion: z.literal(1),
  batchId: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  sources: z.array(z.object({
    instrumentKey: z.string().regex(/^[a-z][a-z0-9_]*$/),
    instrumentVersion: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).min(1).max(100),
}).strict().superRefine((value, ctx) => {
  const keys = new Set<string>()
  const tools = new Set<string>()
  value.sources.forEach((source, index) => {
    const key = source.instrumentKey + '@' + source.instrumentVersion
    if (keys.has(key)) ctx.addIssue({ code: 'custom', path: ['sources', index], message: 'Duplicate batch identity' })
    // Existing materializer owns one current version per scale code: do not silently pick a winner.
    if (tools.has(source.instrumentKey)) ctx.addIssue({ code: 'custom', path: ['sources', index], message: 'Multiple versions of one tool require separate batches/databases' })
    keys.add(key); tools.add(source.instrumentKey)
  })
})
export type BatchManifest = z.infer<typeof batchManifestSchema>
export type BatchEntry = BatchManifest['sources'][number]
export const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')

export function loadPinnedSource(backendRoot: string, entry: BatchEntry) {
  const checked = batchManifestSchema.shape.sources.element.parse(entry)
  const path = resolve(backendRoot, 'src/modules/scale/instruments', checked.instrumentKey, checked.instrumentVersion, 'source.json')
  const raw = readFileSync(path)
  if (sha256(raw) !== checked.sourceSha256) throw new Error('SOURCE_HASH_MISMATCH')
  const source = defineScaleInstrumentSource(JSON.parse(raw.toString('utf8')))
  if (source.identity.instrumentKey !== checked.instrumentKey || source.identity.instrumentVersion !== checked.instrumentVersion) throw new Error('SOURCE_IDENTITY_MISMATCH')
  if (!source.executable) throw new Error('SOURCE_NOT_EXECUTABLE')
  return { path, source }
}

export function validateBatchEntry(backendRoot: string, entry: BatchEntry) {
  const { source } = loadPinnedSource(backendRoot, entry)
  const e = source.executable!, d = e.definition
  const samples = e.goldenCases.map(fixture => ({
    name: fixture.name,
    result: parseScaleResultV2(buildScaleResult({
      scaleId: 'synthetic-batch-' + entry.instrumentKey,
      instrumentKey: entry.instrumentKey, instrumentVersion: entry.instrumentVersion,
      name: source.catalog.identity.canonicalName, definition: d, answers: fixture.answers,
    })),
  }))
  return {
    identity: source.identity, sourceSha256: entry.sourceSha256,
    measurementHash: hashScaleDefinition(d), scoringVersion: d.scoring.scoringVersion,
    localizationVersion: source.localization?.localizationVersion ?? null,
    reportVersion: d.report.reportVersion,
    parameterPolicy: d.referencePolicy, parameterPolicyHash: canonicalHash(d.referencePolicy),
    // This is an observed gap, not an invented version or additional publication gate.
    independentParameterVersion: null,
    parameterVersionNote: 'No independent score_only parameter version in the current engine',
    releaseStatus: e.releaseStatus, itemCount: d.items.length, samples,
  }
}

export function requireDisposableBatchUrl(value: string | undefined): string {
  if (!value) throw new Error('SCALE_BATCH_DATABASE_URL_REQUIRED')
  const url = new URL(value)
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || !/^\/eduk12_scales_test(?:_[a-z0-9_]+)?$/.test(url.pathname)
    || !url.username || !url.password
    || [...url.searchParams.keys()].some(key => key !== 'schema')
    || (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) {
    throw new Error('DISPOSABLE_LOOPBACK_SCALE_DATABASE_REQUIRED')
  }
  return value
}

export async function assertNonOwner(db: PrismaClient | Prisma.TransactionClient) {
  const rows = await db.$queryRaw<Array<{ role: string; superuser: boolean; database_owner: boolean; table_owner: boolean; schema_owner: boolean; bypass_rls: boolean; create_db: boolean; create_role: boolean }>>`
    SELECT current_user AS role, r.rolsuper AS superuser, r.rolbypassrls AS bypass_rls,
      r.rolcreatedb AS create_db, r.rolcreaterole AS create_role,
      pg_has_role(current_user, d.datdba, 'MEMBER') AS database_owner,
      pg_has_role(current_user, n.nspowner, 'MEMBER') AS schema_owner,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
        WHERE ns.nspname='public' AND c.relkind IN ('r','p') AND pg_has_role(current_user,c.relowner,'MEMBER')) AS table_owner
    FROM pg_roles r JOIN pg_database d ON d.datname=current_database()
    JOIN pg_namespace n ON n.nspname='public' WHERE r.rolname=current_user
  `
  if (rows.length !== 1 || Object.entries(rows[0]).some(([key, value]) => key !== 'role' && value !== false)) throw new Error('NON_OWNER_APPLICATION_ROLE_REQUIRED')
  return rows[0]
}

export async function materializeBatchEntry(db: PrismaClient, backendRoot: string, entry: BatchEntry, actorUserId: string) {
  const { source } = loadPinnedSource(backendRoot, entry)
  const { getScaleInstrumentSource } = await import('../src/modules/scale/onboarding/instrument-registry')
  const { materializeScaleInstrumentContent } = await import('../src/modules/scale/onboarding/materialize')
  const registered = getScaleInstrumentSource(entry.instrumentKey, entry.instrumentVersion)
  if (!registered || canonicalHash(registered) !== canonicalHash(source)) throw new Error('REGISTERED_SOURCE_MISMATCH')
  return db.$transaction(async tx => {
    await assertNonOwner(tx)
    const result = await materializeScaleInstrumentContent(tx, { ...source.identity, actorUserId })
    const row = await tx.scale.findUniqueOrThrow({ where: { id: result.scale.id } })
    if (row.status !== 'DRAFT' || row.visibility !== 'HIDDEN') throw new Error('DRAFT_HIDDEN_ONLY')
    return { scaleId: row.id, created: result.created, definitionHash: result.definitionHash, status: row.status, visibility: row.visibility }
  }, { timeout: 30_000 })
}

function safeError(error: unknown) {
  // No connection URL, SQL, answer payload or local credential content in a public receipt.
  if (error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)) return error.message
  return 'BATCH_ENTRY_FAILED'
}

async function main() {
  const { values } = parseArgs({ options: {
    manifest: { type: 'string' }, out: { type: 'string' }, apply: { type: 'boolean', default: false },
    'actor-user-id': { type: 'string' },
  }, strict: true, allowPositionals: false })
  if (!values.manifest || !values.out) throw new Error('MANIFEST_AND_OUTPUT_REQUIRED')
  const manifestBytes = readFileSync(values.manifest)
  const manifest = batchManifestSchema.parse(JSON.parse(manifestBytes.toString('utf8')))
  const backendRoot = process.cwd(), out = resolve(values.out)
  mkdirSync(out, { recursive: true })
  if (existsSync(resolve(out, 'receipt.json'))) throw new Error('OUTPUT_ALREADY_USED_CHOOSE_NEW_DIRECTORY')
  const startedAt = new Date().toISOString()
  let db: PrismaClient | undefined
  const entries: unknown[] = []
  let failed = false
  try {
    if (values.apply) {
      const url = requireDisposableBatchUrl(process.env.SCALE_BATCH_DATABASE_URL)
      if (!values['actor-user-id']) throw new Error('ACTOR_USER_ID_REQUIRED')
      const { PrismaClient } = await import('@prisma/client')
      db = new PrismaClient({ datasources: { db: { url } } })
      await assertNonOwner(db)
    }
    for (const entry of manifest.sources) {
      const id = entry.instrumentKey + '@' + entry.instrumentVersion
      try {
        const validation = validateBatchEntry(backendRoot, entry)
        writeFileSync(resolve(out, id + '.reports.json'), JSON.stringify(validation, null, 2) + '\n')
        const materialization = db ? await materializeBatchEntry(db, backendRoot, entry, values['actor-user-id']!) : null
        entries.push({ id, status: 'PASS', sourceSha256: entry.sourceSha256, reportFile: id + '.reports.json', materialization })
      } catch (error) {
        failed = true
        entries.push({ id, status: 'FAIL', errorCode: safeError(error) })
      }
      // Persist completed entries after every tool; rerunning uses the same pins and idempotent materializer.
      writeFileSync(resolve(out, 'receipt.json'), JSON.stringify({
        schemaVersion: 1, batchId: manifest.batchId, startedAt, updatedAt: new Date().toISOString(),
        mode: values.apply ? 'ISOLATED_DRAFT_MATERIALIZE' : 'VALIDATE',
        manifestSha256: sha256(manifestBytes), entries,
        activation: 'NOTRUN', production: 'NOTRUN', browser: 'NOTRUN',
      }, null, 2) + '\n')
    }
  } finally { await db?.$disconnect() }
  if (failed) process.exitCode = 1
}
if (require.main === module) main().catch(error => {
  process.stderr.write(safeError(error) + '\n')
  process.exitCode = 1
})
