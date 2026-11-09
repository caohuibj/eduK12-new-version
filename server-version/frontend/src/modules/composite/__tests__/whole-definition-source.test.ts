import { describe, expect, it, vi } from 'vitest'
import { wholeDefinitionWithInlineFallback } from '../whole-definition-source'
import type { WholeQuestionnaireDefinition } from '../types'

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
