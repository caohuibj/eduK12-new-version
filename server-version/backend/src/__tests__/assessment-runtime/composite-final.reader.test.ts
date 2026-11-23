import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { listScalePackages } from '../../modules/scale/scale-package.registry'
import { buildScaleResult } from '../../modules/scale/scale-result'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { encryptCompactField } from '../../modules/assessment-runtime/compact-field-codec'
import { createPublicTemplateStore, type PublicTemplateRow } from '../../modules/assessment-runtime/public-templates'
import {
  buildScaleUnitFactsBatch,
  encodeCompositeFinalFacts,
  encodeCompositeFinalRaw,
} from '../../modules/assessment-runtime/composite-final.codec'
import {
  hydrateCompositeScaleUnitsBatch,
  readCompositeFinalFacts,
  readCompositeFinalFactsBatch,
  readCompositeFinalFeedback,
  readCompositeFinalRaw,
  readCompositeFinalRawBatch,
} from '../../modules/assessment-runtime/composite-final.reader'
import { compositeFinalKeyString } from '../../modules/assessment-runtime/composite-final.contract'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const sqlText = (q: any): string => (Array.isArray(q?.strings) ? q.strings.join('?') : String(q?.sql ?? q))

describe('composite-final reader (hot/cold column isolation & single-roundtrip template batching)', () => {
  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
  })
  afterEach(() => vi.unstubAllEnvs())

  async function makeFixture(count = 2) {
    const rows = new Map<string, PublicTemplateRow>()
    const repo = {
      read: vi.fn(async (hashes: string[]) => hashes.flatMap(h => (rows.has(h) ? [rows.get(h)!] : []))),
      append: vi.fn(async (rs: PublicTemplateRow[]) => { for (const r of rs) rows.set(r.templateHash, r) }),
    }
    const writeTemplates = createPublicTemplateStore(repo)
    const pkg = listScalePackages().find(p => p.goldenCases.some(c => c.expected.quality))!
    const gold = pkg.goldenCases.find(c => c.expected.quality)!
    const compositeId = randomUUID()
    const itemId = randomUUID()
    const scaleId = randomUUID()
    const slotKey = `scale:${itemId}`
    const completedAt = new Date('2026-11-24T02:00:00.000Z')

    const records = []
    for (let i = 0; i < count; i++) {
      const attemptId = randomUUID()
      const submissionId = `whole-${sha(`sub-${i}`)}`
      const payloadHash = sha(`payload-${i}`)
      const publicationHash = sha('pub-1')
      const slotSetHash = sha('slots-1')
      const aggregateHash = sha(`agg-${i}`)
      const result = buildScaleResult({
        scaleId,
        instrumentKey: pkg.key,
        name: pkg.key,
        instrumentVersion: pkg.instrumentVersion,
        definition: pkg.definition,
        answers: gold.answers,
        referenceSets: pkg.references,
      })
      const [unitFact] = await buildScaleUnitFactsBatch([{
        itemId,
        scaleId,
        sourceDefinitionHash: result.method.definitionHash,
        itemOrder: pkg.definition.items.map(it => it.itemCode),
        result,
      }], writeTemplates)
      const facts = encodeCompositeFinalFacts({
        schemaVersion: 1,
        attemptId,
        attemptEpoch: 1,
        compositeId,
        publicationHash,
        slotSetHash,
        contextHash: null,
        completedAt: completedAt.toISOString(),
        executedSlotKeys: [slotKey],
        units: { [slotKey]: unitFact },
      })
      const raw = encodeCompositeFinalRaw({
        schemaVersion: 1,
        attemptId,
        attemptEpoch: 1,
        submissionId,
        payloadHash,
        completedAt: completedAt.toISOString(),
        units: {
          [slotKey]: {
            unitType: 'SCALE',
            itemId,
            codes: gold.answers.map(a => a.itemCode),
            values: gold.answers.map(a => a.responseValue),
          },
        },
      })
      records.push({
        attemptId,
        attemptEpoch: 1,
        compositeId,
        organizationId: null,
        courseId: 'course-1',
        publicationHash,
        slotSetHash,
        contextHash: null,
        submissionId,
        payloadHash,
        aggregateHash,
        factsHash: facts.hash,
        factsCipher: facts.cipher,
        rawHash: raw.hash,
        rawCipher: raw.cipher,
        feedbackCipher: encryptCompactField({ state: 'READY', title: 'Test Feedback', attemptId }),
        completedAt,
        result,
        slotKey,
      })
    }
    repo.read.mockClear()
    return { records, repo, coldTemplates: createPublicTemplateStore(repo) }
  }

  it('enforces hot/cold/feedback column isolation in SQL queries and detects row binding drift', async () => {
    const { records } = await makeFixture(1)
    const r = records[0]

    const factsDb = { $queryRaw: vi.fn().mockResolvedValue([r]) }
    const loadedFacts = await readCompositeFinalFacts(factsDb, { attemptId: r.attemptId, attemptEpoch: 1 })
    expect(loadedFacts?.facts.attemptId).toBe(r.attemptId)
    const factsSql = sqlText(factsDb.$queryRaw.mock.calls[0][0])
    expect(factsSql).toContain('facts_cipher')
    expect(factsSql).not.toContain('raw_cipher')
    expect(factsSql).not.toContain('feedback_cipher')

    const rawDb = { $queryRaw: vi.fn().mockResolvedValue([r]) }
    const loadedRaw = await readCompositeFinalRaw(rawDb, { attemptId: r.attemptId, attemptEpoch: 1 })
    expect(loadedRaw?.raw.submissionId).toBe(r.submissionId)
    const rawSql = sqlText(rawDb.$queryRaw.mock.calls[0][0])
    expect(rawSql).toContain('raw_cipher')
    expect(rawSql).not.toContain('facts_cipher')
    expect(rawSql).not.toContain('feedback_cipher')

    const fbDb = { $queryRaw: vi.fn().mockResolvedValue([r]) }
    const loadedFb = await readCompositeFinalFeedback<{ state: string; attemptId: string }>(fbDb, { attemptId: r.attemptId, attemptEpoch: 1 })
    expect(loadedFb?.feedback).toMatchObject({ state: 'READY', attemptId: r.attemptId })
    const fbSql = sqlText(fbDb.$queryRaw.mock.calls[0][0])
    expect(fbSql).toContain('feedback_cipher')
    expect(fbSql).not.toContain('facts_cipher')
    expect(fbSql).not.toContain('raw_cipher')

    // Row metadata tampering (e.g. swapped publicationHash column) must fail binding check
    const tamperedDb = { $queryRaw: vi.fn().mockResolvedValue([{ ...r, publicationHash: sha('other-pub') }]) }
    await expect(readCompositeFinalFacts(tamperedDb, { attemptId: r.attemptId, attemptEpoch: 1 }))
      .rejects.toThrow('binding mismatch')
  })

  it('batches hot facts, cold raw, and public template hydration in 1 roundtrip each across multiple attempts', async () => {
    const { records, repo, coldTemplates } = await makeFixture(3)
    const keys = records.map(r => ({ attemptId: r.attemptId, attemptEpoch: r.attemptEpoch }))

    const factsDb = { $queryRaw: vi.fn().mockResolvedValue(records) }
    const rawDb = { $queryRaw: vi.fn().mockResolvedValue(records) }

    const factsMap = await readCompositeFinalFactsBatch(factsDb, [...keys, keys[0]]) // dedupes duplicate key
    const rawMap = await readCompositeFinalRawBatch(rawDb, keys)
    expect(factsDb.$queryRaw).toHaveBeenCalledTimes(1)
    expect(rawDb.$queryRaw).toHaveBeenCalledTimes(1)
    expect(factsMap.size).toBe(3)
    expect(rawMap.size).toBe(3)

    const hydrated = await hydrateCompositeScaleUnitsBatch(
      [...factsMap.values()],
      { rawByKey: rawMap, full: true, canonical: false, templates: coldTemplates },
    )
    // All 3 participants share the same templates -> 1 single repo.read roundtrip on cold cache!
    expect(repo.read).toHaveBeenCalledTimes(1)
    for (const r of records) {
      const unitRes = hydrated.get(compositeFinalKeyString(r))?.get(r.slotKey)
      expect(unitRes?.result).toEqual(JSON.parse(JSON.stringify(r.result)))
    }
  })
})
