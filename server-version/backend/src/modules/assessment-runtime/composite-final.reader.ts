import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { decryptCompactField } from './compact-field-codec'
import { publicTemplatesForDatabase, type PublicTemplateStore } from './public-templates'
import {
  collectScaleUnitFactTemplateRequests,
  decodeCompositeFinalFacts,
  decodeCompositeFinalRaw,
  hydrateScaleUnitFact,
} from './composite-final.codec'
import {
  compositeFinalKeyString,
  type CompositeFinalFactsV1,
  type CompositeFinalKey,
  type CompositeFinalRawV1,
  type CompositeScaleUnitFactV1,
  type CompositeScaleUnitRawV1,
  type HydratedScaleUnitResult,
} from './composite-final.contract'

export type CompositeFinalDb = Pick<Prisma.TransactionClient, '$queryRaw'>

export interface StoredCompositeFinalFactsRow {
  attemptId: string
  attemptEpoch: number
  compositeId: string
  organizationId: string | null
  courseId: string | null
  publicationHash: string
  slotSetHash: string
  contextHash: string | null
  submissionId: string
  payloadHash: string
  aggregateHash: string
  factsHash: string
  factsCipher: string
  completedAt: Date
}

export interface StoredCompositeFinalRawRow {
  attemptId: string
  attemptEpoch: number
  submissionId: string
  payloadHash: string
  rawHash: string
  rawCipher: string
  completedAt: Date
}

export interface StoredCompositeFinalFeedbackRow {
  attemptId: string
  attemptEpoch: number
  publicationHash: string
  aggregateHash: string
  feedbackCipher: string | null
  completedAt: Date
}

export interface LoadedCompositeFinalFacts {
  meta: Omit<StoredCompositeFinalFactsRow, 'factsCipher'>
  facts: CompositeFinalFactsV1
}

export interface LoadedCompositeFinalRaw {
  meta: Omit<StoredCompositeFinalRawRow, 'rawCipher'>
  raw: CompositeFinalRawV1
}

function dedupeKeys(keys: readonly CompositeFinalKey[]): CompositeFinalKey[] {
  const map = new Map<string, CompositeFinalKey>()
  for (const key of keys) {
    if (!key.attemptId || !Number.isSafeInteger(key.attemptEpoch) || key.attemptEpoch < 1) {
      throw new Error('Invalid composite final lookup key')
    }
    map.set(compositeFinalKeyString(key), key)
  }
  return [...map.values()]
}

function verifyFactsMetaBinding(row: StoredCompositeFinalFactsRow, facts: CompositeFinalFactsV1): void {
  if (
    facts.attemptId !== row.attemptId
    || facts.attemptEpoch !== row.attemptEpoch
    || facts.compositeId !== row.compositeId
    || facts.publicationHash !== row.publicationHash
    || facts.slotSetHash !== row.slotSetHash
    || facts.contextHash !== row.contextHash
  ) {
    throw new Error('Composite final facts row binding mismatch')
  }
}

function verifyRawMetaBinding(row: StoredCompositeFinalRawRow, raw: CompositeFinalRawV1): void {
  if (
    raw.attemptId !== row.attemptId
    || raw.attemptEpoch !== row.attemptEpoch
    || raw.submissionId !== row.submissionId
    || raw.payloadHash !== row.payloadHash
  ) {
    throw new Error('Composite final raw row binding mismatch')
  }
}

/** Single-attempt hot facts reader: NEVER touches raw_cipher or feedback_cipher. */
export async function readCompositeFinalFacts(
  db: CompositeFinalDb = prisma,
  key: CompositeFinalKey,
): Promise<LoadedCompositeFinalFacts | null> {
  const rows = await db.$queryRaw<StoredCompositeFinalFactsRow[]>(Prisma.sql`
    SELECT attempt_id AS "attemptId",
      attempt_epoch AS "attemptEpoch",
      composite_id AS "compositeId",
      organization_id AS "organizationId",
      course_id AS "courseId",
      publication_hash AS "publicationHash",
      slot_set_hash AS "slotSetHash",
      context_hash AS "contextHash",
      submission_id AS "submissionId",
      payload_hash AS "payloadHash",
      aggregate_hash AS "aggregateHash",
      facts_hash AS "factsHash",
      facts_cipher AS "factsCipher",
      completed_at AS "completedAt"
    FROM composite_attempt_finals
    WHERE attempt_id = ${key.attemptId} AND attempt_epoch = ${key.attemptEpoch}
    LIMIT 1
  `)
  const row = rows[0]
  if (!row) return null
  const facts = decodeCompositeFinalFacts(row.factsCipher, row.factsHash)
  verifyFactsMetaBinding(row, facts)
  const { factsCipher: _ignored, ...meta } = row
  return { meta, facts }
}

/** Batched hot facts reader for group reports, longitudinal tracking, safety discovery,
 * and Training Analysis: 1 SQL query, NEVER fetches raw_cipher or feedback_cipher. */
export async function readCompositeFinalFactsBatch(
  db: CompositeFinalDb = prisma,
  keys: readonly CompositeFinalKey[],
): Promise<Map<string, LoadedCompositeFinalFacts>> {
  const unique = dedupeKeys(keys)
  const result = new Map<string, LoadedCompositeFinalFacts>()
  if (!unique.length) return result

  const tuples = Prisma.join(unique.map(k => Prisma.sql`(${k.attemptId}, ${k.attemptEpoch})`))
  const rows = await db.$queryRaw<StoredCompositeFinalFactsRow[]>(Prisma.sql`
    SELECT attempt_id AS "attemptId",
      attempt_epoch AS "attemptEpoch",
      composite_id AS "compositeId",
      organization_id AS "organizationId",
      course_id AS "courseId",
      publication_hash AS "publicationHash",
      slot_set_hash AS "slotSetHash",
      context_hash AS "contextHash",
      submission_id AS "submissionId",
      payload_hash AS "payloadHash",
      aggregate_hash AS "aggregateHash",
      facts_hash AS "factsHash",
      facts_cipher AS "factsCipher",
      completed_at AS "completedAt"
    FROM composite_attempt_finals
    WHERE (attempt_id, attempt_epoch) IN (${tuples})
  `)
  for (const row of rows) {
    const facts = decodeCompositeFinalFacts(row.factsCipher, row.factsHash)
    verifyFactsMetaBinding(row, facts)
    const { factsCipher: _ignored, ...meta } = row
    result.set(compositeFinalKeyString(row), { meta, facts })
  }
  return result
}

/** Single-attempt cold raw reader (exports & re-scoring only): NEVER touches facts_cipher. */
export async function readCompositeFinalRaw(
  db: CompositeFinalDb = prisma,
  key: CompositeFinalKey,
): Promise<LoadedCompositeFinalRaw | null> {
  const rows = await db.$queryRaw<StoredCompositeFinalRawRow[]>(Prisma.sql`
    SELECT attempt_id AS "attemptId",
      attempt_epoch AS "attemptEpoch",
      submission_id AS "submissionId",
      payload_hash AS "payloadHash",
      raw_hash AS "rawHash",
      raw_cipher AS "rawCipher",
      completed_at AS "completedAt"
    FROM composite_attempt_finals
    WHERE attempt_id = ${key.attemptId} AND attempt_epoch = ${key.attemptEpoch}
    LIMIT 1
  `)
  const row = rows[0]
  if (!row) return null
  const raw = decodeCompositeFinalRaw(row.rawCipher, row.rawHash)
  verifyRawMetaBinding(row, raw)
  const { rawCipher: _ignored, ...meta } = row
  return { meta, raw }
}

/** Batched cold raw reader for paginated raw exports and re-scoring. */
export async function readCompositeFinalRawBatch(
  db: CompositeFinalDb = prisma,
  keys: readonly CompositeFinalKey[],
): Promise<Map<string, LoadedCompositeFinalRaw>> {
  const unique = dedupeKeys(keys)
  const result = new Map<string, LoadedCompositeFinalRaw>()
  if (!unique.length) return result

  const tuples = Prisma.join(unique.map(k => Prisma.sql`(${k.attemptId}, ${k.attemptEpoch})`))
  const rows = await db.$queryRaw<StoredCompositeFinalRawRow[]>(Prisma.sql`
    SELECT attempt_id AS "attemptId",
      attempt_epoch AS "attemptEpoch",
      submission_id AS "submissionId",
      payload_hash AS "payloadHash",
      raw_hash AS "rawHash",
      raw_cipher AS "rawCipher",
      completed_at AS "completedAt"
    FROM composite_attempt_finals
    WHERE (attempt_id, attempt_epoch) IN (${tuples})
  `)
  for (const row of rows) {
    const raw = decodeCompositeFinalRaw(row.rawCipher, row.rawHash)
    verifyRawMetaBinding(row, raw)
    const { rawCipher: _ignored, ...meta } = row
    result.set(compositeFinalKeyString(row), { meta, raw })
  }
  return result
}

/** Fast single-PK feedback read for GET /feedback: reads ONLY feedback_cipher + header metadata. */
export async function readCompositeFinalFeedback<T = unknown>(
  db: CompositeFinalDb = prisma,
  key: CompositeFinalKey,
): Promise<{
  meta: Omit<StoredCompositeFinalFeedbackRow, 'feedbackCipher'>
  feedback: T | null
} | null> {
  const rows = await db.$queryRaw<StoredCompositeFinalFeedbackRow[]>(Prisma.sql`
    SELECT attempt_id AS "attemptId",
      attempt_epoch AS "attemptEpoch",
      publication_hash AS "publicationHash",
      aggregate_hash AS "aggregateHash",
      feedback_cipher AS "feedbackCipher",
      completed_at AS "completedAt"
    FROM composite_attempt_finals
    WHERE attempt_id = ${key.attemptId} AND attempt_epoch = ${key.attemptEpoch}
    LIMIT 1
  `)
  const row = rows[0]
  if (!row) return null
  const { feedbackCipher, ...meta } = row
  return {
    meta,
    feedback: feedbackCipher ? decryptCompactField<T>(feedbackCipher) : null,
  }
}

/** Batch-hydrates all Scale unit facts across multiple CompositeFinalFactsV1 records
 * using ONE single public_templates.loadMany roundtrip. */
export async function hydrateCompositeScaleUnitsBatch(
  entries: readonly LoadedCompositeFinalFacts[],
  options: {
    rawByKey?: Map<string, LoadedCompositeFinalRaw>
    full?: boolean
    canonical?: boolean
    reportOnly?: boolean
    templates?: PublicTemplateStore
    db?: CompositeFinalDb
  } = {},
): Promise<Map<string, Map<string, HydratedScaleUnitResult>>> {
  const templates = options.templates ?? publicTemplatesForDatabase(options.db)
  const allScaleFacts: CompositeScaleUnitFactV1[] = []
  for (const entry of entries) {
    for (const unit of Object.values(entry.facts.units)) {
      if (unit.unitType === 'SCALE') allScaleFacts.push(unit)
    }
  }
  const templateRequests = collectScaleUnitFactTemplateRequests(allScaleFacts)
  if (templateRequests.length) {
    await templates.loadMany(templateRequests)
  }

  const output = new Map<string, Map<string, HydratedScaleUnitResult>>()
  for (const entry of entries) {
    const keyStr = compositeFinalKeyString(entry.meta)
    const rawRecord = options.rawByKey?.get(keyStr)
    const unitMap = new Map<string, HydratedScaleUnitResult>()
    for (const [slotKey, unit] of Object.entries(entry.facts.units)) {
      if (unit.unitType !== 'SCALE') continue
      const rawUnit = rawRecord?.raw.units[slotKey]
      if (options.full && (!rawUnit || rawUnit.unitType !== 'SCALE')) {
        throw new Error(`Missing raw scale answers for full hydration (${slotKey})`)
      }
      const hydrated = await hydrateScaleUnitFact(
        unit,
        {
          attemptId: entry.meta.attemptId,
          submissionId: entry.meta.submissionId,
          completedAt: entry.facts.completedAt,
          contextHash: entry.facts.contextHash,
          raw: rawUnit?.unitType === 'SCALE' ? (rawUnit as CompositeScaleUnitRawV1) : undefined,
          full: options.full,
          canonical: options.canonical,
          reportOnly: options.reportOnly,
        },
        templates,
      )
      unitMap.set(slotKey, hydrated)
    }
    output.set(keyStr, unitMap)
  }
  return output
}
