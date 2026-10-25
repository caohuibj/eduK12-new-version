import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../../modules/assessment-runtime/runtime-snapshot', async importOriginal => {
  const original = await importOriginal<any>()
  return { ...original, loadFrozenScaleRuntimeSnapshot: (...args: unknown[]) => { mocks.load(...args); return original.loadFrozenScaleRuntimeSnapshot(...args) } }
})
import { compileResearchScale } from '../../modules/survey/builder.compiler'
import { createFrozenScaleRuntimeSnapshot, encryptFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { loadScaleAssessmentForResponse } from '../../modules/scale/scale-workflow.service'
import { buildScaleResult } from '../../modules/scale/scale-result'
import { DISCLOSURE_PRESETS } from '../../modules/scale/policy/disclosure'

function fixture() {
  const definition = compileResearchScale('Fixture', { schemaVersion: 1, respondentType: 'participant_self_report', aggregation: 'sum',
    responseOptions: [{ optionKey: 'yes', label: 'Yes', score: 1 }, { optionKey: 'no', label: 'No', score: 0 }], dimensions: [{ dimensionKey: 'total', label: 'Total', direction: 'descriptive' }],
    items: [{ itemKey: 'one', prompt: 'Question', required: true, reverse: false, dimensionKeys: ['total'] }] })
  const runtime = createFrozenScaleRuntimeSnapshot({ instrumentKey: 'fixture', instrumentVersion: '1', definition })
  const encrypted = encryptFrozenScaleRuntimeSnapshot(runtime)
  const result = (answer: string) => buildScaleResult({ scaleId: 'scale', instrumentKey: 'fixture', name: 'Fixture', instrumentVersion: '1', definition, answers: [{ itemCode: definition.items[0].itemCode, responseValue: answer }] })
  const row = { id: 'attempt', attemptEpoch: 1, compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash, runtimeSnapshotEncrypted: encrypted,
    status: 'COMPLETED', scale: { id: 'scale', code: 'fixture', name: 'Fixture', instrumentVersion: '1', instrumentClass: 'CUSTOM_DESCRIPTIVE' }, result: result('yes'), answers: [], completedAt: new Date('2026-10-24T00:00:00Z'), totalTime: 100 }
  const prepared = { assessmentId: row.id, attemptEpoch: row.attemptEpoch, compiledRuntimeHash: row.compiledRuntimeHash, encrypted, runtime }
  return { row, prepared, result }
}
beforeEach(() => { vi.clearAllMocks(); process.env.DATA_ENCRYPTION_KEY = 'e'.repeat(64) })
describe('same-request frozen Scale runtime response reuse', () => {
  it('preserves the completed DTO without reloading an exactly bound runtime', async () => {
    const { row, prepared } = fixture()
    const expected = await loadScaleAssessmentForResponse(row)
    expect(mocks.load).toHaveBeenCalledTimes(1); mocks.load.mockClear()
    expect(await loadScaleAssessmentForResponse(row, {}, undefined, prepared)).toEqual(expected)
    expect(mocks.load).not.toHaveBeenCalled()
  })
  it.each(['id', 'attemptEpoch', 'compiledRuntimeHash', 'runtimeSnapshotEncrypted'] as const)('falls back when current %s differs, even with the same scientific snapshot', async key => {
    const { row, prepared } = fixture()
    const current = { ...row, [key]: key === 'attemptEpoch' ? 2 : key === 'runtimeSnapshotEncrypted' ? encryptFrozenScaleRuntimeSnapshot(prepared.runtime) : 'different' }
    const expected = await loadScaleAssessmentForResponse(current); mocks.load.mockClear()
    expect(await loadScaleAssessmentForResponse(current, {}, undefined, prepared)).toEqual(expected)
    expect(mocks.load).toHaveBeenCalledTimes(1)
  })
  it('loads the concurrent winner result rather than retaining a prepared loser result', async () => {
    const { row, prepared, result } = fixture()
    const winner = { ...row, result: result('no'), submissionId: 'winner' }
    const expected = await loadScaleAssessmentForResponse(winner); mocks.load.mockClear()
    expect(await loadScaleAssessmentForResponse(winner, {}, undefined, prepared)).toEqual(expected)
    expect(mocks.load).not.toHaveBeenCalled()
    expect(winner.result).not.toEqual(row.result)
  })
  it('preserves current disclosure restrictions while reusing only immutable runtime', async () => {
    const { row, prepared } = fixture()
    const options = { currentRestrictions: DISCLOSURE_PRESETS.NONE() }
    const expected = await loadScaleAssessmentForResponse(row, options); mocks.load.mockClear()
    expect(await loadScaleAssessmentForResponse(row, options, undefined, prepared)).toEqual(expected)
    expect(mocks.load).not.toHaveBeenCalled()
  })
  it('retains the durable-response fallback for a changed unreadable runtime', async () => {
    const { row, prepared } = fixture()
    const current = { ...row, runtimeSnapshotEncrypted: 'unreadable-synthetic-envelope' }
    const expected = await loadScaleAssessmentForResponse(current); mocks.load.mockClear()
    await expect(loadScaleAssessmentForResponse(current, {}, undefined, prepared)).resolves.toEqual(expected)
    expect(mocks.load).toHaveBeenCalledTimes(1)
  })
})
