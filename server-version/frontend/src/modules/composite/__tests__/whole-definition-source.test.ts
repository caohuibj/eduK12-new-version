import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyWholeTemplateBinding,
  assembleInlineWholePayload,
  cacheWholeQuestionnaireTemplate,
  clearWholeQuestionnaireTemplateCacheForTest,
  evictCachedWholeQuestionnaireTemplate,
  getCachedWholeQuestionnaireTemplate,
  getKnownWholeTemplateHashes,
  isWholeQuestionnaireBinding,
  resolveWholeDefinitionPayload,
  takeStoredWholeDefinition,
  wholeDefinitionWithInlineFallback,
} from '../whole-definition-source'
import type {
  WholeQuestionnaireBinding,
  WholeQuestionnaireDefinition,
  WholeQuestionnaireTemplate,
} from '../types'

const definition = (attemptId: string, overrides: Partial<WholeQuestionnaireDefinition> = {}) => ({
  attemptId, attemptEpoch: 1, slotSetHash: 'a'.repeat(64), contextSnapshotHash: null,
  units: [{ itemId: 'u1', scaleAssessmentId: 's1', definitionHash: 'b'.repeat(64), presentationMode: 'ONE_BY_ONE', scale: { id: 's1', name: 'Scale', instruction: null, instrumentVersion: '1', definition: { items: [{ itemCode: 'q1', required: true, responseSetKey: 'r' }] } } }],
  formSections: [],
  ...overrides,
}) as unknown as WholeQuestionnaireDefinition

describe('whole definition dual-track delivery (X-05A)', () => {
  const identity = { attemptId: 'attempt-1', attemptEpoch: 1, contextSnapshotHash: null }

  it('serves the inline payload without the fallback GET when the frozen identity matches', async () => {
    const inline = definition('attempt-1')
    const fallback = vi.fn()
    const result = await wholeDefinitionWithInlineFallback(inline, identity, fallback)
    expect(result.code).toBe(0)
    expect(result.data).toBe(inline)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('serves a form-section-only inline payload', async () => {
    const inline = definition('attempt-1', {
      units: [],
      formSections: [{ id: 'sec-1', title: 'Form', description: null, contextSection: false, definitionHash: 'c'.repeat(64), items: [] }],
    })
    const fallback = vi.fn()
    const result = await wholeDefinitionWithInlineFallback(inline, identity, fallback)
    expect(result.data).toBe(inline)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('falls back to GET when the frozen identity mismatches (stale epoch or context)', async () => {
    const served = { code: 0, data: definition('attempt-1') }
    const fallback = vi.fn().mockResolvedValue(served)
    await expect(wholeDefinitionWithInlineFallback(definition('attempt-1'), { ...identity, attemptEpoch: 2 }, fallback)).resolves.toBe(served)
    await expect(wholeDefinitionWithInlineFallback(definition('attempt-1'), { ...identity, contextSnapshotHash: 'ctx-2' }, fallback)).resolves.toBe(served)
    await expect(wholeDefinitionWithInlineFallback(definition('attempt-2'), identity, fallback)).resolves.toBe(served)
    expect(fallback).toHaveBeenCalledTimes(3)
  })

  it('falls back to GET when the inline payload is absent or structurally incomplete', async () => {
    const served = { code: 0, data: definition('attempt-1') }
    const fallback = vi.fn().mockResolvedValue(served)
    await expect(wholeDefinitionWithInlineFallback(null, identity, fallback)).resolves.toBe(served)
    await expect(wholeDefinitionWithInlineFallback(definition('attempt-1', { units: [], formSections: [] }), identity, fallback)).resolves.toBe(served)
    expect(fallback).toHaveBeenCalledTimes(2)
  })
})


describe('Study Wave inline definition one-time storage', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key) },
  }
  const key = 'composite:inline-definition:attempt-1'

  it('consumes the correct attempt only once', () => {
    const inline = definition('attempt-1')
    values.set(key, JSON.stringify(inline))
    expect(takeStoredWholeDefinition('attempt-1', storage)).toEqual(inline)
    expect(values.has(key)).toBe(false)
    expect(takeStoredWholeDefinition('attempt-1', storage)).toBeNull()
  })

  it('rejects stale, mismatched and corrupt cached definitions without replay', () => {
    values.set(key, JSON.stringify(definition('attempt-2')))
    expect(takeStoredWholeDefinition('attempt-1', storage)).toBeNull()
    expect(values.has(key)).toBe(false)
    values.set(key, '{not valid json')
    expect(takeStoredWholeDefinition('attempt-1', storage)).toBeNull()
    expect(values.has(key)).toBe(false)
  })

  it('treats unavailable session storage as a cache miss', () => {
    expect(takeStoredWholeDefinition('attempt-1', {
      getItem: () => { throw new Error('storage unavailable') },
      removeItem: () => { throw new Error('storage unavailable') },
    })).toBeNull()
  })

  it('rejects an old attempt epoch against fresh server identity and falls back to GET', async () => {
    const stale = definition('attempt-1', { attemptEpoch: 1 })
    const fresh = definition('attempt-1', { attemptEpoch: 2 })
    values.set(key, JSON.stringify(stale))
    const candidate = takeStoredWholeDefinition('attempt-1', storage)
    const fallback = vi.fn().mockResolvedValue({ code: 0, data: fresh })
    const result = await wholeDefinitionWithInlineFallback(
      candidate, { attemptId: 'attempt-1', attemptEpoch: 2, contextSnapshotHash: null }, fallback,
    )
    expect(result.data).toBe(fresh)
    expect(fallback).toHaveBeenCalledOnce()
    expect(values.has(key)).toBe(false)
  })
})

describe('whole template caching & binding assembly', () => {
  const createMemoryStorage = () => {
    const store = new Map<string, string>()
    return {
      store,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    }
  }

  const hashA = '1'.repeat(64)
  const hashB = '2'.repeat(64)
  const slotHash = 'a'.repeat(64)
  const defHash = 'b'.repeat(64)

  const makeTemplate = (templateHash = hashA, slotSetHash = slotHash): WholeQuestionnaireTemplate => ({
    templateHash,
    slotSetHash,
    formSections: [],
    units: [{
      itemId: 'u1',
      definitionHash: defHash,
      presentationMode: 'ONE_BY_ONE',
      scale: {
        id: 's1',
        name: 'Scale 1',
        instruction: 'Read carefully',
        definition: {
          schemaVersion: 2,
          respondentType: 'STUDENT',
          display: { randomizeItems: false },
          items: [{
            itemCode: 'q1',
            content: 'Question 1',
            type: 'SINGLE_CHOICE',
            required: true,
            sortOrder: 1,
            responseSetKey: 'r',
            randomizeOptions: false,
            options: [{ value: 1, label: 'Yes' }],
          }],
        },
      },
    }],
  })

  const timingFixture = {
    schemaVersion: 1 as const,
    contract: 'BROWSER_ACTIVE_SCALE_V1' as const,
    snapshotHash: 'c'.repeat(64),
  }

  const makeBinding = (overrides: Partial<WholeQuestionnaireBinding> = {}): WholeQuestionnaireBinding => ({
    attemptId: 'attempt-student-2',
    attemptEpoch: 1,
    slotSetHash: slotHash,
    contextSnapshotHash: null,
    templateHash: hashA,
    units: [{
      itemId: 'u1',
      scaleAssessmentId: 'scale-child-student-2',
      definitionHash: defHash,
      presentationMode: 'ALL_AT_ONCE',
      trainingTiming: timingFixture,
    }],
    ...overrides,
  })

  beforeEach(() => {
    clearWholeQuestionnaireTemplateCacheForTest()
  })

  it('caches templates without per-user fields and reports known hashes most-recent-first', () => {
    const storage = createMemoryStorage()
    const full1 = definition('attempt-1', { templateHash: hashA })
    const full2 = definition('attempt-2', { templateHash: hashB })

    const cached1 = cacheWholeQuestionnaireTemplate(full1, storage)
    expect(cached1).not.toBeNull()
    expect((cached1!.units[0] as unknown as Record<string, unknown>).scaleAssessmentId).toBeUndefined()

    cacheWholeQuestionnaireTemplate(full2, storage)
    expect(getKnownWholeTemplateHashes(storage)).toEqual([hashB, hashA])
    expect(getCachedWholeQuestionnaireTemplate(hashA, storage)?.templateHash).toBe(hashA)
    expect(getKnownWholeTemplateHashes(storage, 1)).toEqual([hashA])
  })

  it('assembles a binding with a matching template and rejects drift or corrupt bindings', () => {
    const template = makeTemplate()
    const assembled = applyWholeTemplateBinding(template, makeBinding())
    expect(assembled).toMatchObject({
      attemptId: 'attempt-student-2',
      attemptEpoch: 1,
      slotSetHash: slotHash,
      templateHash: hashA,
      units: [{
        itemId: 'u1',
        scaleAssessmentId: 'scale-child-student-2',
        definitionHash: defHash,
        presentationMode: 'ALL_AT_ONCE',
        trainingTiming: timingFixture,
        scale: template.units[0]!.scale,
      }],
    })

    expect(applyWholeTemplateBinding(template, makeBinding({ templateHash: hashB }))).toBeNull()
    expect(applyWholeTemplateBinding(template, makeBinding({ slotSetHash: '9'.repeat(64) }))).toBeNull()
    expect(applyWholeTemplateBinding(template, makeBinding({
      units: [{ itemId: 'u1', scaleAssessmentId: 's2', definitionHash: 'f'.repeat(64) }],
    }))).toBeNull()
    expect(applyWholeTemplateBinding(template, makeBinding({ units: [] }))).toBeNull()
  })

  it('resolves binding from cache, fetches template on miss, and falls back on fetch failure', async () => {
    const storage = createMemoryStorage()
    const template = makeTemplate()
    const binding = makeBinding()
    const fetchTemplate = vi.fn().mockResolvedValue({ code: 0, message: 'OK', data: template })
    const fallbackDef = definition('attempt-student-2', { templateHash: hashB })
    const fallback = vi.fn().mockResolvedValue({ code: 0, message: 'OK', data: fallbackDef })

    // 1. Cache miss -> fetchTemplate
    const fromFetch = await resolveWholeDefinitionPayload({ wholeBinding: binding }, fetchTemplate, fallback, storage)
    expect(fromFetch.data?.attemptId).toBe('attempt-student-2')
    expect(fromFetch.data?.units[0]?.scaleAssessmentId).toBe('scale-child-student-2')
    expect(fetchTemplate).toHaveBeenCalledWith(hashA)
    expect(fallback).not.toHaveBeenCalled()

    // 2. Subsequent call hits memory/storage cache -> zero extra network calls
    fetchTemplate.mockClear()
    const fromCache = await resolveWholeDefinitionPayload({ wholeBinding: binding }, fetchTemplate, fallback, storage)
    expect(fromCache.data?.units[0]?.scaleAssessmentId).toBe('scale-child-student-2')
    expect(fetchTemplate).not.toHaveBeenCalled()
    expect(fallback).not.toHaveBeenCalled()

    // 3. Evicted + fetchTemplate failure -> falls back to full definition GET
    evictCachedWholeQuestionnaireTemplate(hashA, storage)
    fetchTemplate.mockRejectedValueOnce(new Error('409 Stale template'))
    const fromFallback = await resolveWholeDefinitionPayload({ wholeBinding: binding }, fetchTemplate, fallback, storage)
    expect(fromFallback.data).toBe(fallbackDef)
    expect(fallback).toHaveBeenCalledOnce()
    expect(getCachedWholeQuestionnaireTemplate(hashB, storage)).not.toBeNull()
  })

  it('survives storage quota failures gracefully and assembles inline bindings', () => {
    const failingStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError') },
      removeItem: () => { throw new Error('SecurityError') },
    }
    const inlineDef = definition('attempt-1', { templateHash: hashA })
    expect(isWholeQuestionnaireBinding(inlineDef)).toBe(false)
    expect(isWholeQuestionnaireBinding(makeBinding())).toBe(true)
    expect(assembleInlineWholePayload({ wholeDefinition: inlineDef }, failingStorage)).toBe(inlineDef)
    const inlineBound = assembleInlineWholePayload({ wholeBinding: makeBinding() }, failingStorage)
    expect(inlineBound?.units[0]?.scaleAssessmentId).toBe('scale-child-student-2')
  })
})
