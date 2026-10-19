import type { ComponentProps, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import FinalCompositeAssessment from '../FinalCompositeAssessment'
import WholeCompositeQuestionnaire, { wholeAnswerKey, wholeDraftKey } from '../WholeCompositeQuestionnaire'
import { createFinalDraftMeta, finalDraftStore } from '../../services/persistence/finalDraftStore'
import type { CompositeAttemptState, CompositeCurrentItem, WholeQuestionnaireDefinition } from '../../modules/composite/types'
import type { TrainingCheckpointPanel } from '../../modules/composite/TrainingCheckpointPanel'
import type { SurveyScaleTimings } from '../../modules/scale/item-timing'

const checkpoint = vi.hoisted(() => ({ props: null as ComponentProps<typeof TrainingCheckpointPanel> | null }))
vi.mock('../../modules/composite/TrainingCheckpointPanel', () => ({ TrainingCheckpointPanel: (props: ComponentProps<typeof TrainingCheckpointPanel>) => { checkpoint.props = props; return null } }))
vi.mock('../../modules/scale/TrainingTimingBoundary', async () => ({
  ...await vi.importActual<typeof import('../../modules/scale/TrainingTimingBoundary')>('../../modules/scale/TrainingTimingBoundary'),
  TrainingTimingBoundary: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('../../modules/assessment-media/AssessmentImageGate', () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock('../../modules/assessment-media/ScaleFormVideoGate', () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock('../questionnaire/ScalePlayer', () => ({ default: ({ value }: { value: unknown }) => <output data-testid="scale-value">{String(value)}</output> }))
vi.mock('../questionnaire/FormPlayer', () => ({ default: ({ value }: { value: unknown }) => <output data-testid="form-value">{String(value)}</output> }))

const timing = (count: number): SurveyScaleTimings => ({ q: { schemaVersion: 1, firstResponseMs: count * 10, activeTimeMs: count * 20,
  changeCount: count, revisitCount: 0, visits: 1, interrupted: false, recoveredWithoutClock: false } })
const trainingTiming = { schemaVersion: 1 as const, contract: 'BROWSER_ACTIVE_SCALE_V1' as const, snapshotHash: 'timing-hash' }
const scale: NonNullable<CompositeCurrentItem['scale']> = { id: 'scale', name: 'Scale', definition: { schemaVersion: 2, respondentType: 'participant_self_report', display: { randomizeItems: false }, items: [
  { itemCode: 'q', content: 'Question', type: 'single', required: true, sortOrder: 0, responseSetKey: 'r', randomizeOptions: false, options: [{ value: 1, label: 'One' }, { value: 2, label: 'Two' }] },
] } }
const stateFor = (currentItem: CompositeCurrentItem): CompositeAttemptState => ({ id: 'recovery-attempt', assessmentId: 'assessment', name: 'Recovery', instruction: null,
  status: 'IN_PROGRESS', progress: 0, completedItems: 0, totalItems: 1, currentIndex: 0, startedAt: '', lastSavedAt: '', completedAt: null, anonymousCode: null,
  items: [{ id: currentItem.id, type: currentItem.type, position: 0, label: 'Unit', completed: false, index: 0 }], currentItem, deliveryMode: 'FINAL_ONLY', attemptEpoch: 1, contextSnapshotHash: null })
const shared = { submitFormSection: vi.fn(), submitScale: vi.fn(), onReload: vi.fn(), onExit: vi.fn(), onCompleted: vi.fn(), onEnterCognitive: vi.fn(), onEnterSituational: vi.fn() }
const keys: string[] = []
afterEach(async () => { vi.restoreAllMocks(); checkpoint.props = null; for (const key of keys.splice(0)) await finalDraftStore.delete(key) })
const mountUnit = async (kind: 'scale' | 'form') => {
  const item: CompositeCurrentItem = kind === 'scale'
    ? { id: 'unit', type: 'SCALE', position: 0, required: true, definitionHash: 'definition', scaleAssessmentId: 'recovery-scale', scale, trainingTiming }
    : { id: 'unit', type: 'FORM_SECTION', position: 0, required: true, definitionHash: 'definition', formSectionId: 'section', formAnswers: [
      { formItemId: 'q', type: 'text_input', label: 'Question', placeholder: null, options: null, required: false, contextKey: null, value: null },
    ] }
  const state = stateFor(item)
  const key = kind === 'scale' ? 'composite-scale:recovery-scale' : 'composite-form-section:recovery-attempt:section'
  keys.push(key)
  const meta = createFinalDraftMeta({ draftKey: key, instrument: kind === 'scale' ? 'scale' : 'composite-form-section', attemptId: kind === 'scale' ? 'recovery-scale' : state.id,
    attemptEpoch: 1, definitionHash: 'definition', contextSnapshotHash: null, deliveryMode: 'final_only', submissionId: 'recovery-submission',
    instrumentMetadata: { trainingScaleTiming: { snapshotHash: trainingTiming.snapshotHash, items: timing(1) } } })
  await finalDraftStore.ensure(meta)
  await finalDraftStore.putAnswer({ draftKey: key, itemKey: 'q', value: kind === 'scale' ? { responseValue: 1 } : 'old', updatedAt: 1 })
  render(<FinalCompositeAssessment state={state} {...shared} />)
  await screen.findByTestId(`${kind}-value`)
  await waitFor(() => expect(checkpoint.props).not.toBeNull())
  return { key, meta, slotKey: kind === 'scale' ? 'scale:unit' : 'form-section:section' }
}

describe('checkpoint recovery publication boundaries', () => {
  it.each(['form', 'scale'] as const)('keeps %s UI and timing refs unchanged until durable replacement succeeds', async kind => {
    const { key, meta, slotKey } = await mountUnit(kind)
    const before = await checkpoint.props!.getDrafts()
    const replace = finalDraftStore.replaceAnswers.bind(finalDraftStore)
    let commit!: () => Promise<void>
    const pending = vi.spyOn(finalDraftStore, 'replaceAnswers').mockImplementation((...args) => new Promise<void>((resolve, reject) => { commit = async () => { try { await replace(...args); resolve() } catch (error) { reject(error) } } }))
    const rows = [{ slotKey, answers: { q: kind === 'scale' ? { responseValue: 2 } : 'new' }, itemTimings: timing(9) }]
    let restored!: Promise<void>
    await act(async () => { restored = checkpoint.props!.restore(rows); await Promise.resolve() })
    await waitFor(() => expect(pending).toHaveBeenCalledTimes(1))
    expect(pending.mock.calls[0][0]).toMatchObject({ draftKey: key, definitionHash: meta.definitionHash, attemptEpoch: 1 })
    expect(screen.getByTestId(`${kind}-value`)).toHaveTextContent(kind === 'scale' ? '1' : 'old')
    expect(await checkpoint.props!.getDrafts()).toEqual(before)
    await act(async () => { await commit(); await restored })
    expect(screen.getByTestId(`${kind}-value`)).toHaveTextContent(kind === 'scale' ? '2' : 'new')
    if (kind === 'scale') {
      expect((await checkpoint.props!.getDrafts())[0].itemTimings).toEqual(timing(9))
      expect((await finalDraftStore.get(key))?.instrumentMetadata?.trainingScaleTiming).toEqual({ snapshotHash: trainingTiming.snapshotHash, items: timing(9) })
    }
  })

  it.each(['form', 'scale'] as const)('does not publish %s recovery on persistence failure', async kind => {
    const { key, slotKey } = await mountUnit(kind)
    const before = await checkpoint.props!.getDrafts()
    const beforeStorage = await finalDraftStore.snapshot(key)
    vi.spyOn(finalDraftStore, 'replaceAnswers').mockRejectedValue(new Error('Injected commit failure'))
    await act(async () => { await expect(checkpoint.props!.restore([{ slotKey, answers: { q: kind === 'scale' ? { responseValue: 2 } : 'new' }, itemTimings: timing(9) }])).rejects.toThrow('Injected commit failure') })
    expect(screen.getByTestId(`${kind}-value`)).toHaveTextContent(kind === 'scale' ? '1' : 'old')
    expect(await checkpoint.props!.getDrafts()).toEqual(before)
    expect(await finalDraftStore.snapshot(key)).toEqual(beforeStorage)
  })

  const mountWhole = async () => {
    const key = wholeDraftKey('recovery-whole', 1); keys.push(key)
    const definition: WholeQuestionnaireDefinition = { attemptId: 'recovery-whole', attemptEpoch: 1, slotSetHash: 'whole-definition', contextSnapshotHash: null,
      units: ['first', 'second'].map(itemId => ({ itemId, scaleAssessmentId: `child-${itemId}`, definitionHash: `definition-${itemId}`, scale, trainingTiming })) }
    const state = { ...stateFor({ id: 'unused', type: 'SCALE', position: 0, required: true }), id: 'recovery-whole', items: [] }
    await finalDraftStore.ensure(createFinalDraftMeta({ draftKey: key, instrument: 'composite-whole', attemptId: state.id, attemptEpoch: 1, definitionHash: definition.slotSetHash,
      contextSnapshotHash: null, deliveryMode: 'final_only', submissionId: 'whole-recovery', instrumentMetadata: { wholeScaleTiming: Object.fromEntries(definition.units.map(unit => [unit.itemId, { snapshotHash: trainingTiming.snapshotHash, items: timing(1) }])) } }))
    for (const unit of definition.units) await finalDraftStore.putAnswer({ draftKey: key, itemKey: wholeAnswerKey(unit.itemId, 'q'), value: { responseValue: 1 }, updatedAt: 1 })
    const api = { wholeDefinition: vi.fn().mockResolvedValue({ code: 0, data: definition }), reportStatus: vi.fn().mockResolvedValue({ code: 0, data: { wholeSubmissionReceived: false } }), submitWhole: vi.fn() }
    render(<WholeCompositeQuestionnaire state={state} api={api} fallback={null} onCompleted={vi.fn()} onExit={vi.fn()} />)
    await screen.findByTestId('scale-value')
    await waitFor(() => expect(checkpoint.props).not.toBeNull())
    const rows = definition.units.map(unit => ({ slotKey: `scale:${unit.itemId}`, answers: { q: { responseValue: 2 } }, itemTimings: timing(9) }))
    return { key, rows }
  }

  it('keeps all whole-questionnaire answers and timing refs after failed replacement', async () => {
    const { key, rows } = await mountWhole()
    const before = await checkpoint.props!.getDrafts()
    const beforeStorage = await finalDraftStore.snapshot(key)
    const replace = vi.spyOn(finalDraftStore, 'replaceAnswers').mockRejectedValue(new Error('Injected whole commit failure'))
    await act(async () => { await expect(checkpoint.props!.restore(rows)).rejects.toThrow('Injected whole commit failure') })
    expect(replace.mock.calls[0][1]).toHaveLength(2)
    expect(Object.keys(replace.mock.calls[0][2]!.wholeScaleTiming as object)).toEqual(['first', 'second'])
    expect(screen.getByTestId('scale-value')).toHaveTextContent('1')
    expect(await checkpoint.props!.getDrafts()).toEqual(before)
    expect(await finalDraftStore.snapshot(key)).toEqual(beforeStorage)
  })

  it('publishes every whole unit and matching timing only after the single commit', async () => {
    const { key, rows } = await mountWhole()
    const before = await checkpoint.props!.getDrafts()
    const actual = finalDraftStore.replaceAnswers.bind(finalDraftStore)
    let commit!: () => Promise<void>
    const replace = vi.spyOn(finalDraftStore, 'replaceAnswers').mockImplementation((...args) => new Promise<void>((resolve, reject) => { commit = async () => { try { await actual(...args); resolve() } catch (error) { reject(error) } } }))
    let restored!: Promise<void>
    await act(async () => { restored = checkpoint.props!.restore(rows); await Promise.resolve() })
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1))
    expect(await checkpoint.props!.getDrafts()).toEqual(before)
    expect(screen.getByTestId('scale-value')).toHaveTextContent('1')
    await act(async () => { await commit(); await restored })
    expect(await checkpoint.props!.getDrafts()).toEqual(rows)
    expect(screen.getByTestId('scale-value')).toHaveTextContent('2')
    expect((await finalDraftStore.listAnswers(key)).map(row => row.value)).toEqual([{ responseValue: 2 }, { responseValue: 2 }])
  })

  it('rejects an incomplete whole checkpoint before altering any unit', async () => {
    const { key, rows } = await mountWhole()
    const before = await checkpoint.props!.getDrafts()
    const replace = vi.spyOn(finalDraftStore, 'replaceAnswers')
    await expect(checkpoint.props!.restore(rows.slice(0, 1))).rejects.toThrow('服务器整卷草稿不完整')
    expect(replace).not.toHaveBeenCalled()
    expect(await checkpoint.props!.getDrafts()).toEqual(before)
    expect((await finalDraftStore.listAnswers(key)).map(row => row.value)).toEqual([{ responseValue: 1 }, { responseValue: 1 }])
  })
})
