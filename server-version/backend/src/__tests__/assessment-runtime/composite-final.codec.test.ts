import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { listScalePackages } from '../../modules/scale/scale-package.registry'
import { buildScaleResult } from '../../modules/scale/scale-result'
import { compileScaleRuntime } from '../../modules/assessment-runtime/compiler'
import { createCanonicalUnitResultEnvelope, projectScaleCanonicalUnitResult } from '../../modules/assessment-runtime/unit-result'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createPublicTemplateStore, type PublicTemplateRow } from '../../modules/assessment-runtime/public-templates'
import { isScaleReportFactsView } from '../../modules/assessment-runtime/compact-scale-facts'
import {
  buildScaleUnitFactsBatch,
  decodeCompositeFinalFacts,
  decodeCompositeFinalRaw,
  decodeCompositeUnitSeeds,
  encodeCompositeFinalFacts,
  encodeCompositeFinalRaw,
  encodeCompositeUnitSeeds,
  hydrateScaleUnitFact,
} from '../../modules/assessment-runtime/composite-final.codec'
import type {
  CompositeFinalFactsV1,
  CompositeFinalRawV1,
  CompositeScaleUnitRawV1,
} from '../../modules/assessment-runtime/composite-final.contract'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

function makeTemplateStore() {
  const rows = new Map<string, PublicTemplateRow>()
  const repo = {
    read: vi.fn(async (hashes: string[]) => hashes.flatMap(h => (rows.has(h) ? [rows.get(h)!] : []))),
    append: vi.fn(async (rs: PublicTemplateRow[]) => { for (const r of rs) rows.set(r.templateHash, r) }),
  }
  return { rows, repo, store: createPublicTemplateStore(repo) }
}

describe('composite-final codec (4-instrument unified single-row FINAL)', () => {
  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('losslessly roundtrips mixed Scale + Form + SJT + Cognitive facts, raw payloads, and unitSeeds', async () => {
    const { store, repo } = makeTemplateStore()
    const pkg = listScalePackages().find(p => p.goldenCases.some(c => c.expected.quality))!
    const gold = pkg.goldenCases.find(c => c.expected.quality)!
    const attemptId = randomUUID()
    const compositeId = randomUUID()
    const scaleItemId = randomUUID()
    const formSectionId = randomUUID()
    const sjtItemId = randomUUID()
    const cogItemId = randomUUID()
    const completedAt = '2026-11-24T01:00:00.000Z'
    const submissionId = `whole-${sha('sub-1')}`
    const payloadHash = sha('payload-1')

    const scaleResult = buildScaleResult({
      scaleId: randomUUID(),
      instrumentKey: pkg.key,
      name: pkg.key,
      instrumentVersion: pkg.instrumentVersion,
      definition: pkg.definition,
      answers: gold.answers,
      referenceSets: pkg.references,
    })
    const compiledRuntime = compileScaleRuntime({
      instrumentKey: pkg.key,
      instrumentVersion: pkg.instrumentVersion,
      definition: pkg.definition,
      sourceDefinitionHash: canonicalHash(pkg.definition),
    })
    const scaleCanonical = createCanonicalUnitResultEnvelope({
      core: projectScaleCanonicalUnitResult({ runtime: compiledRuntime, result: scaleResult, contextHash: null }),
      completedAt,
      persistenceProvenance: { sourceType: 'ASSESSMENT', sourceAttemptId: attemptId, sourceSubmissionId: submissionId },
    })

    const [scaleFact] = await buildScaleUnitFactsBatch([{
      itemId: scaleItemId,
      scaleId: scaleResult.instrument.scaleId,
      sourceDefinitionHash: scaleResult.method.definitionHash,
      itemOrder: pkg.definition.items.map(i => i.itemCode),
      result: scaleResult,
      canonical: scaleCanonical,
    }], store)
    // Single saveMany roundtrip for bundle + refs + interpretations
    expect(repo.append).toHaveBeenCalledTimes(1)

    const facts: CompositeFinalFactsV1 = {
      schemaVersion: 1,
      attemptId,
      attemptEpoch: 1,
      compositeId,
      publicationHash: sha('pub-1'),
      slotSetHash: sha('slots-1'),
      contextHash: null,
      completedAt,
      executedSlotKeys: [`form:${formSectionId}`, `scale:${scaleItemId}`, `situational:${sjtItemId}`, `cognitive:${cogItemId}`],
      units: {
        [`form:${formSectionId}`]: {
          unitType: 'FORM_SECTION',
          sectionId: formSectionId,
          sourceDefinitionHash: sha('form-def'),
          sourceResultHash: sha('form-res'),
          typedValues: { grade: 'G7', gender: 'F' } as any,
          contextSnapshot: { grade: 'G7' },
        },
        [`scale:${scaleItemId}`]: scaleFact,
        [`situational:${sjtItemId}`]: {
          unitType: 'SITUATIONAL',
          itemId: sjtItemId,
          instrumentKey: 'sjt_demo',
          instrumentVersion: '1.0.0',
          sourceDefinitionHash: sha('sjt-def'),
          sourceResultHash: sha('sjt-res'),
          scores: { empathy: 4.2 },
          trajectory: ['scene_1', 'scene_2'],
          quality: { status: 'interpretable', flags: [] },
          canonicalCore: { unitType: 'SITUATIONAL', metrics: [{ key: 'empathy', value: 4.2 }], quality: { status: 'interpretable', flags: [] } } as any,
        },
        [`cognitive:${cogItemId}`]: {
          unitType: 'COGNITIVE',
          itemId: cogItemId,
          testType: 'gonogo',
          configVersion: '1.0.0',
          engineVersion: '1.0.0',
          scoringVersion: '1.0.0',
          protocolSignature: sha('cog-proto'),
          profile: 'research',
          sourceResultHash: sha('cog-res'),
          trialCount: 60,
          metrics: { hitRate: 0.95, meanRtMs: 382.5 },
          quality: { state: 'interpretable', flags: {}, reasons: [] },
          references: [],
          reportSummary: { headline: '良好' },
          canonicalCore: { unitType: 'COGNITIVE', metrics: [{ key: 'hitRate', value: 0.95 }], quality: { status: 'interpretable', flags: [] } } as any,
        },
      },
    }

    const scaleRaw: CompositeScaleUnitRawV1 = {
      unitType: 'SCALE',
      itemId: scaleItemId,
      codes: gold.answers.map(a => a.itemCode),
      values: gold.answers.map(a => a.responseValue),
    }
    const raw: CompositeFinalRawV1 = {
      schemaVersion: 1,
      attemptId,
      attemptEpoch: 1,
      submissionId,
      payloadHash,
      completedAt,
      units: {
        [`form:${formSectionId}`]: {
          unitType: 'FORM_SECTION',
          sectionId: formSectionId,
          answers: [{ formItemId: 'grade', value: 'G7' }],
        },
        [`scale:${scaleItemId}`]: scaleRaw,
        [`situational:${sjtItemId}`]: {
          unitType: 'SITUATIONAL',
          itemId: sjtItemId,
          responses: { 'scene_1:c1': 'opt_a' },
          totalTimeMs: 42000,
        },
        [`cognitive:${cogItemId}`]: {
          unitType: 'COGNITIVE',
          itemId: cogItemId,
          randomSeed: 'seed-abc-123',
          trials: [{ idx: 0, rt: 380, correct: true }],
          lockedAt: '2026-11-24T00:55:00.000Z',
        },
      },
    }

    const encodedFacts = encodeCompositeFinalFacts(facts)
    expect(encodedFacts.cipher.startsWith('ekc1:zs:')).toBe(true)
    const decodedFacts = decodeCompositeFinalFacts(encodedFacts.cipher, encodedFacts.hash)
    expect(decodedFacts).toEqual(facts)

    const encodedRaw = encodeCompositeFinalRaw(raw)
    expect(encodedRaw.cipher.startsWith('ekc1:zs:')).toBe(true)
    expect(decodeCompositeFinalRaw(encodedRaw.cipher, encodedRaw.hash)).toEqual(raw)

    // Hydrate Scale unit in report view (no raw) and full verified view (with raw)
    const coldTemplates = createPublicTemplateStore(repo)
    const reportView = await hydrateScaleUnitFact(scaleFact, {
      attemptId,
      submissionId,
      completedAt,
      contextHash: null,
      canonical: false,
      reportOnly: true,
    }, coldTemplates)
    expect(isScaleReportFactsView(reportView.result)).toBe(true)
    expect(reportView.result.scores).toEqual(scaleResult.scores)

    const fullView = await hydrateScaleUnitFact(scaleFact, {
      attemptId,
      submissionId,
      completedAt,
      contextHash: null,
      raw: scaleRaw,
      full: true,
    }, coldTemplates)
    expect(fullView.result).toEqual(JSON.parse(JSON.stringify(scaleResult)))
    expect(fullView.canonical).toEqual(scaleCanonical)

    // Unit seeds roundtrip
    const seeds = { schemaVersion: 1 as const, attemptId, attemptEpoch: 1, seeds: { [`cognitive:${cogItemId}`]: 'seed-abc-123' } }
    expect(decodeCompositeUnitSeeds(encodeCompositeUnitSeeds(seeds))).toEqual(seeds)

    // Tamper / digest mismatch rejection
    expect(() => decodeCompositeFinalFacts(encodedFacts.cipher, sha('wrong'))).toThrow('digest mismatch')
    expect(() => decodeCompositeFinalRaw(encodedRaw.cipher, sha('wrong'))).toThrow('digest mismatch')
  })

  it('packs 9 real scales / 303 items into a single FINAL row under 9,000 bytes total (facts + raw)', async () => {
    const { store, repo } = makeTemplateStore()
    const allPkgs = listScalePackages().filter(p => p.goldenCases.some(c => c.expected.quality))
    const targetLens = [63, 50, 44, 37, 35, 30, 20, 14, 10]
    const used = new Set<string>()
    const chosen: Array<{ pkg: typeof allPkgs[number]; gold: any }> = []
    let totalItems = 0
    for (const len of targetLens) {
      let pkg = allPkgs.find(p => p.definition.items.length === len && !used.has(p.key))
      if (!pkg) {
        pkg = [...allPkgs]
          .filter(p => !used.has(p.key))
          .sort((a, b) => Math.abs(a.definition.items.length - len) - Math.abs(b.definition.items.length - len))[0]
      }
      used.add(pkg.key)
      chosen.push({ pkg, gold: pkg.goldenCases.find(c => c.expected.quality)! })
      totalItems += pkg.definition.items.length
    }
    expect(totalItems).toBe(303)

    const attemptId = randomUUID()
    const compositeId = randomUUID()
    const submissionId = `whole-${sha('sub-303')}`
    const completedAt = '2026-11-24T01:00:00.000Z'

    const buildInputs = chosen.map(({ pkg, gold }) => {
      const itemId = randomUUID()
      const result = buildScaleResult({
        scaleId: randomUUID(),
        instrumentKey: pkg.key,
        name: pkg.key,
        instrumentVersion: pkg.instrumentVersion,
        definition: pkg.definition,
        answers: gold.answers,
        referenceSets: pkg.references,
      })
      const compiledRuntime = compileScaleRuntime({
        instrumentKey: pkg.key,
        instrumentVersion: pkg.instrumentVersion,
        definition: pkg.definition,
        sourceDefinitionHash: canonicalHash(pkg.definition),
      })
      const canonical = createCanonicalUnitResultEnvelope({
        core: projectScaleCanonicalUnitResult({ runtime: compiledRuntime, result, contextHash: null }),
        completedAt,
        persistenceProvenance: { sourceType: 'ASSESSMENT', sourceAttemptId: attemptId, sourceSubmissionId: submissionId },
      })
      return {
        itemId,
        scaleId: result.instrument.scaleId,
        sourceDefinitionHash: result.method.definitionHash,
        itemOrder: pkg.definition.items.map(i => i.itemCode),
        result,
        canonical,
        answers: gold.answers,
      }
    })

    const unitFacts = await buildScaleUnitFactsBatch(buildInputs, store)
    // All 9 scales saved their templates in 1 single saveMany call!
    expect(repo.append).toHaveBeenCalledTimes(1)

    const factsUnits: CompositeFinalFactsV1['units'] = {}
    const rawUnits: CompositeFinalRawV1['units'] = {}
    const slotKeys: string[] = []
    buildInputs.forEach((inp, i) => {
      const slotKey = `scale:${inp.itemId}`
      slotKeys.push(slotKey)
      factsUnits[slotKey] = unitFacts[i]
      rawUnits[slotKey] = {
        unitType: 'SCALE',
        itemId: inp.itemId,
        codes: inp.answers.map((a: any) => a.itemCode),
        values: inp.answers.map((a: any) => a.responseValue),
      }
    })

    const facts = encodeCompositeFinalFacts({
      schemaVersion: 1,
      attemptId,
      attemptEpoch: 1,
      compositeId,
      publicationHash: sha('pub-303'),
      slotSetHash: sha('slots-303'),
      contextHash: null,
      completedAt,
      executedSlotKeys: slotKeys,
      units: factsUnits,
    })
    const raw = encodeCompositeFinalRaw({
      schemaVersion: 1,
      attemptId,
      attemptEpoch: 1,
      submissionId,
      payloadHash: sha('payload-303'),
      completedAt,
      units: rawUnits,
    })

    const factsBytes = Buffer.byteLength(facts.cipher, 'utf8')
    const rawBytes = Buffer.byteLength(raw.cipher, 'utf8')
    const combinedBytes = factsBytes + rawBytes
    // Concrete budget gate: 9 scales / 303 items must stay well under 9 KiB combined
    expect(combinedBytes).toBeLessThan(9000)

    // Verify all 9 scales hydrate losslessly from the single row
    const decodedFacts = decodeCompositeFinalFacts(facts.cipher, facts.hash)
    const decodedRaw = decodeCompositeFinalRaw(raw.cipher, raw.hash)
    const coldTemplates = createPublicTemplateStore(repo)
    for (let i = 0; i < buildInputs.length; i++) {
      const slotKey = slotKeys[i]
      const hydrated = await hydrateScaleUnitFact(
        decodedFacts.units[slotKey] as any,
        {
          attemptId,
          submissionId,
          completedAt,
          contextHash: null,
          raw: decodedRaw.units[slotKey] as CompositeScaleUnitRawV1,
          full: true,
        },
        coldTemplates,
      )
      expect(hydrated.result).toEqual(JSON.parse(JSON.stringify(buildInputs[i].result)))
      expect(hydrated.canonical).toEqual(buildInputs[i].canonical)
    }
  })
})
