import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'

const dbRows = vi.hoisted(() => new Map<string, { templateHash: string; templateKind: string; plaintextBytes: number; payloadEncrypted: string }>())
const mockQueryRaw = vi.hoisted(() => vi.fn())
const mockExecuteRaw = vi.hoisted(() => vi.fn())

vi.mock('../../config/database', () => ({
  prisma: {
    $queryRaw: (...args: any[]) => mockQueryRaw(...args),
    $executeRaw: (...args: any[]) => mockExecuteRaw(...args),
  },
}))

import { computeWholeValidationHashFromTemplate } from '../../modules/composite/whole-questionnaire.service'
import { runnerDefinition } from '../../modules/scale/scale-definition'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import {
  seedScaleAdmissionRuntime,
  loadScaleAdmissionRuntime,
} from '../../modules/scale/scale-admission.service'
import {
  createFrozenScaleRuntimeSnapshot,
  encryptFrozenScaleRuntimeSnapshot,
} from '../../modules/assessment-runtime/runtime-snapshot'
import {
  createPublicTemplateStore,
  publicTemplateHash,
  type PublicTemplateRow,
} from '../../modules/assessment-runtime/public-templates'
import {
  createFrozenActiveSlotSet,
  loadFrozenActiveSlotSet,
  storeFrozenActiveSlotSet,
} from '../../modules/assessment-runtime/slot-set'
import { retainImmutableCanonicalValue } from '../../modules/assessment-runtime/canonical'
import { prepareCanonicalSubmission, stableSubmissionJson } from '../../services/instrumentFinalSubmit'

const extractSqlLeafValues = (value: unknown, out: unknown[] = []): unknown[] => {
  if (typeof value === 'object' && value !== null && 'values' in value && Array.isArray((value as { values: unknown }).values)) {
    for (const inner of (value as { values: unknown[] }).values) extractSqlLeafValues(inner, out)
  } else {
    out.push(value)
  }
  return out
}

beforeEach(() => {
  vi.clearAllMocks()
  dbRows.clear()
  vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64))
  vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED', 'true')
  vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED', 'true')
  vi.stubEnv('ASSESSMENT_WHOLE_COMPACT_MANIFEST_ENABLED', 'true')

  mockExecuteRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join('?')
    if (sqlText.includes('INSERT INTO assessment_public_templates')) {
      const flat = extractSqlLeafValues(values[0])
      for (let i = 0; i + 3 < flat.length; i += 4) {
        const templateHash = String(flat[i])
        const templateKind = String(flat[i + 1])
        const plaintextBytes = Number(flat[i + 2])
        const payloadEncrypted = String(flat[i + 3])
        if (!dbRows.has(templateHash)) {
          dbRows.set(templateHash, { templateHash, templateKind, plaintextBytes, payloadEncrypted })
        }
      }
      return 1
    }
    return 0
  })

  mockQueryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join('?')
    if (sqlText.includes('FROM assessment_public_templates')) {
      const hashes = extractSqlLeafValues(values[0]).map(String)
      return hashes.map(h => dbRows.get(h)).filter(Boolean)
    }
    return []
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('whole-questionnaire optimization runtime caches & hashing', () => {
  it('computes identical validation hashes to prepareCanonicalSubmission across v1, v2, timings, deadlines, and form sections', () => {
    const ruleItems = [
      { itemCode: 'q2', required: false, values: ['0', '1', 2] },
      { itemCode: 'q1', required: true, values: [1, 2, 3, 4] },
    ]
    const ruleHash = 'f'.repeat(64)
    const tmpl = {
      itemId: 'item-a',
      itemIdJson: JSON.stringify('item-a'),
      scaleId: 'scale-1',
      scaleName: 'Scale One',
      instrumentVersion: '2.0.0',
      instruction: null,
      definitionHash: 'b'.repeat(64),
      definitionHashJson: JSON.stringify('b'.repeat(64)),
      presentationMode: 'ONE_BY_ONE' as const,
      runnerDefinition: {} as any,
      staticDeliveryUnit: {} as any,
      rule: { rulesHash: ruleHash },
      ruleItems,
      canonicalRuleV1KeyValue: `"items":${stableSubmissionJson(ruleItems)}`,
      canonicalRuleV2KeyValue: `"rulesHash":${JSON.stringify(ruleHash)}`,
    }
    const validationFormSections = [
      {
        sectionId: 'sec-1',
        definitionHash: 'c'.repeat(64),
        items: [{ id: 'f1', required: true, formType: 'text_input' }],
      },
    ]
    const requiredFormSlots = ['form-section:sec-1']
    const templateFields = {
      canonicalRequiredFormSlotsJson: stableSubmissionJson(requiredFormSlots),
      canonicalValidationFormSectionsJson: stableSubmissionJson(validationFormSections),
    }

    const timing = { startedAtMs: 1700000000000, minDurationMs: 5000 } as any
    for (const schemaVersion of [1, 2] as const) {
      for (const withSections of [false, true]) {
        for (const principal of [{ userId: 'u-1', recoveryTokenHash: null }, { userId: null, recoveryTokenHash: 'r'.repeat(64) }]) {
          for (const deadlineMs of [null, 1700003600000]) {
            const binding = {
              attemptId: 'attempt-1',
              attemptEpoch: 2,
              slotSetHash: 'a'.repeat(64),
              contextHash: withSections ? 'd'.repeat(64) : null,
              ...principal,
            }
            const manifest = {
              schemaVersion,
              binding,
              requiredFormSlots,
              ...(withSections ? { formSections: validationFormSections } : {}),
              units: [{
                itemId: tmpl.itemId,
                assessmentId: 'scale-assess-1',
                definitionHash: tmpl.definitionHash,
                ...(timing ? { trainingTiming: timing } : {}),
                admissionHash: 'e'.repeat(64),
                deadlineMs,
                ...(schemaVersion === 2 ? { rulesHash: ruleHash } : { items: ruleItems }),
              }],
            }
            const fastHash = computeWholeValidationHashFromTemplate(
              binding,
              schemaVersion,
              {
                canonicalRequiredFormSlotsJson: templateFields.canonicalRequiredFormSlotsJson,
                canonicalValidationFormSectionsJson: withSections ? templateFields.canonicalValidationFormSectionsJson : null,
              },
              [{
                tmpl,
                assessmentId: 'scale-assess-1',
                admissionHash: 'e'.repeat(64),
                deadlineMs,
                trainingTiming: timing,
              }],
            )
            expect(fastHash).toBe(prepareCanonicalSubmission(manifest).hash)
          }
        }
      }
    }

    expect(() =>
      computeWholeValidationHashFromTemplate(
        {
          attemptId: 'attempt-1',
          attemptEpoch: 1,
          slotSetHash: 'a'.repeat(64),
          contextHash: null,
          userId: 'u-1',
          recoveryTokenHash: null,
        },
        2,
        {
          canonicalRequiredFormSlotsJson: '[]',
          canonicalValidationFormSectionsJson: null,
        },
        [{
          tmpl,
          assessmentId: 'scale-assess-1',
          admissionHash: 'e'.repeat(64),
          deadlineMs: Number.NaN,
        }],
      ),
    ).toThrow(/无效数字/)
  })

  it('caches runnerDefinition on immutable canonical definitions and isolates returned items array mutations', () => {
    const raw = structuredClone(getScaleInstrumentSource('adexi_v1', '2.0.0')!.executable!.definition)
    const uncached = runnerDefinition(raw)
    const immutable = retainImmutableCanonicalValue(structuredClone(raw))
    const first = runnerDefinition(immutable)
    const second = runnerDefinition(immutable)

    expect(first).toEqual(uncached)
    expect(second).toEqual(uncached)
    expect(first.items).not.toBe(second.items)
    first.items.push({ mutated: true })
    expect(runnerDefinition(immutable).items).toHaveLength(uncached.items.length)
    expect(runnerDefinition({ schemaVersion: 2, items: [], display: {}, respondentType: 'SELF' } as any).items).toEqual([])
  })

  it('reuses seeded scale runtime snapshot only while runtimeSnapshotEncrypted matches', async () => {
    const def = structuredClone(getScaleInstrumentSource('adexi_v1', '2.0.0')!.executable!.definition)
    const runtime1 = createFrozenScaleRuntimeSnapshot({
      instrumentKey: 'adexi_v1',
      instrumentVersion: '2.0.0',
      definition: def,
      frozenAt: new Date('2026-11-15T00:00:00.000Z'),
    })
    const runtime2 = createFrozenScaleRuntimeSnapshot({
      instrumentKey: 'adexi_v1',
      instrumentVersion: '2.0.0',
      definition: def,
      frozenAt: new Date('2026-11-15T00:01:00.000Z'),
    })
    const enc1 = encryptFrozenScaleRuntimeSnapshot(runtime1 as any)
    const enc2 = encryptFrozenScaleRuntimeSnapshot(runtime2 as any)

    const row = { runtimeSnapshotEncrypted: enc1 }
    seedScaleAdmissionRuntime(row, runtime1 as any)
    await expect(loadScaleAdmissionRuntime(row)).resolves.toBe(runtime1)

    row.runtimeSnapshotEncrypted = enc2
    const reloaded = await loadScaleAdmissionRuntime(row)
    expect(reloaded).not.toBe(runtime1)
    expect(reloaded.frozenAt).toBe(runtime2.frozenAt)
  })

  it('skips DB read/write when precomputedHash hits warm publicTemplates cache and falls back cleanly on cold miss', async () => {
    const rows = new Map<string, PublicTemplateRow>()
    const read = vi.fn(async (hashes: string[]) => hashes.map(h => rows.get(h)).filter((r): r is PublicTemplateRow => Boolean(r)))
    const append = vi.fn(async (batch: PublicTemplateRow[]) => {
      for (const row of batch) rows.set(row.templateHash, row)
    })

    const warmStore = createPublicTemplateStore({ read, append })
    const plan = { schemaVersion: 2, requiredFormSlots: [], units: [{ itemId: 'u1', definitionHash: 'd'.repeat(64) }] }
    const expectedHash = publicTemplateHash('WHOLE_VALIDATION_PLAN', plan)

    const [savedHash] = await warmStore.saveMany([{ kind: 'WHOLE_VALIDATION_PLAN', value: plan }])
    expect(savedHash).toBe(expectedHash)
    expect(append).toHaveBeenCalledTimes(1)

    append.mockClear()
    read.mockClear()
    const [fastHash] = await warmStore.saveMany([{
      kind: 'WHOLE_VALIDATION_PLAN',
      value: plan,
      precomputedHash: expectedHash,
    }])
    expect(fastHash).toBe(expectedHash)
    expect(append).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()

    await expect(
      warmStore.saveMany([{ kind: 'FROZEN_SLOT_PLAN', value: plan, precomputedHash: expectedHash }]),
    ).rejects.toThrow(/kind mismatch/)

    // A fresh cold store with empty cache must still persist even if precomputedHash is supplied.
    const coldStore = createPublicTemplateStore({ read, append })
    const [persistedHash] = await coldStore.saveMany([{
      kind: 'WHOLE_VALIDATION_PLAN',
      value: plan,
      precomputedHash: expectedHash,
    }])
    expect(persistedHash).toBe(expectedHash)
    expect(append).toHaveBeenCalledTimes(1)
  })

  it('caches verified FSP2 slot set ciphertexts across loadFrozenActiveSlotSet calls and isolates key changes', async () => {
    const slotSet = createFrozenActiveSlotSet({
      schemaVersion: 1,
      runtimeGeneration: 'UNIFIED_V1',
      attemptEpoch: 1,
      slots: [{
        slotKey: 'scale:' + randomUUID(),
        unitType: 'SCALE',
        required: true,
        sourceDefinitionIdentity: { key: 'adexi_v1', version: '2.0.0', hash: 'd'.repeat(64) },
        sourceBinding: { scaleCode: 'adexi_v1', compiledRuntimeHash: createHash('sha256').update('rt').digest('hex') },
      }],
    })
    const encryptedRef = await storeFrozenActiveSlotSet(slotSet)
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1)
    mockQueryRaw.mockClear()
    mockExecuteRaw.mockClear()

    const first = await loadFrozenActiveSlotSet(encryptedRef)
    const second = await loadFrozenActiveSlotSet(encryptedRef)
    expect(first).toEqual(slotSet)
    expect(second).toBe(first)
    expect(mockQueryRaw).not.toHaveBeenCalled()

    vi.stubEnv('DATA_ENCRYPTION_KEY', 'b'.repeat(64))
    await expect(loadFrozenActiveSlotSet(encryptedRef)).rejects.toThrow()
  })
})
