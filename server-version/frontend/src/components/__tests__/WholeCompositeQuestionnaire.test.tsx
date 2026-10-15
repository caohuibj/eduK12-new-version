import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import WholeCompositeQuestionnaire, { wholeAnswerKey, wholeDraftKey, type WholeQuestionnaireApi } from '../WholeCompositeQuestionnaire'
import { createFinalDraftMeta, finalDraftStore } from '../../services/persistence/finalDraftStore'
import type { CompositeAttemptState, WholeQuestionnaireDefinition, WholeQuestionnaireInput } from '../../modules/composite/types'
const { retry } = vi.hoisted(() => ({ retry: vi.fn() }))
vi.mock('../../services/persistence/finalDraftCapacityRetry', () => ({ runFinalDraftCapacityRetry: retry }))
vi.mock('../../modules/assessment-media/AssessmentImageGate', () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock('../../modules/assessment-media/ScaleFormVideoGate', () => ({ default: ({ children }: { children: ReactNode }) => children }))
const key = wholeDraftKey('whole-attempt', 1)
const definition = (counts = [100, 30, 30, 5, 5, 9, 35, 4]): WholeQuestionnaireDefinition => ({ attemptId: 'whole-attempt', attemptEpoch: 1, slotSetHash: 's'.repeat(64), contextSnapshotHash: 'context',
  units: counts.map((count, unit) => ({ itemId: `unit-${unit}`, scaleAssessmentId: `child-${unit}`, definitionHash: `definition-${unit}`,
    scale: { id: `scale-${unit}`, name: `量表 ${unit}`, definition: { schemaVersion: 2, respondentType: 'participant_self_report', display: { randomizeItems: false },
      items: Array.from({ length: count }, (_, question) => ({ itemCode: `question-${question}`, content: `量表 ${unit} 题目 ${question}`, type: 'single', required: true, sortOrder: question, responseSetKey: 'r', randomizeOptions: false, options: [{ value: 1, label: '选项一' }, { value: 2, label: '选项二' }] })) } } })) })
const state = { id: 'whole-attempt', attemptEpoch: 1, name: '整卷问卷', instruction: null, productKind: 'QUESTIONNAIRE', deliveryMode: 'FINAL_ONLY', status: 'IN_PROGRESS', items: [], currentItem: null } as unknown as CompositeAttemptState
const api = () => ({ wholeDefinition: vi.fn().mockResolvedValue({ code: 0, data: definition() }), reportStatus: vi.fn().mockResolvedValue({ code: 0, data: { wholeSubmissionReceived: false } }), submitWhole: vi.fn().mockImplementation(async (id: string, payload: WholeQuestionnaireInput) => ({ code: 0, data: { status: 'ACCEPTED', attemptId: id, submissionId: payload.submissionId, payloadHash: 'h'.repeat(64), acceptedAt: '2026-10-15T00:00:00Z', committedAt: '2026-10-15T00:00:01Z', replayed: false } })) })
const view = (client: WholeQuestionnaireApi, completed = vi.fn()) => render(<WholeCompositeQuestionnaire state={state} api={client} fallback={<p>旧单元作答</p>} onCompleted={completed} onExit={vi.fn()} />)
const seed = async (d: WholeQuestionnaireDefinition, omitLast = false) => {
  await finalDraftStore.ensure(createFinalDraftMeta({ draftKey: key, instrument: 'composite-whole', attemptId: state.id, attemptEpoch: 1, definitionHash: d.slotSetHash, contextSnapshotHash: d.contextSnapshotHash, deliveryMode: 'final_only', submissionId: 'whole-browser-sealed-submission' }))
  for (const [unitIndex, unit] of d.units.entries()) for (const [index, question] of unit.scale.definition!.items.entries()) {
    if (omitLast && unitIndex + 1 === d.units.length && index + 1 === unit.scale.definition!.items.length) continue
    await finalDraftStore.putAnswer({ draftKey: key, itemKey: wholeAnswerKey(unit.itemId, question.itemCode), value: { responseValue: unitIndex % 2 + 1 }, updatedAt: Date.now() })
  }
}
const lastQuestion = async (count: number) => {
  await screen.findByRole('button', { name: '下一题' })
  for (let index = 1; index < count; index++) fireEvent.click(screen.getByRole('button', { name: '下一题' }))
}
beforeEach(() => { vi.clearAllMocks(); retry.mockImplementation(async ({ operation }) => operation(1)) })
afterEach(async () => { await finalDraftStore.delete(key); for (let i = 0; i < 8; i++) await finalDraftStore.delete(`composite-scale:child-${i}`) })

describe('whole questionnaire durable browser submission', () => {
  it('restores 218 answers with repeated question codes, sends one HTTP body, and clears only after the durable receipt', async () => {
    const d = definition(), client = api(), completed = vi.fn()
    await seed(d)
    let confirm!: () => void
    client.submitWhole.mockImplementationOnce((id: string, payload: WholeQuestionnaireInput) => new Promise(resolve => { confirm = () => resolve({ code: 0, data: { status: 'ACCEPTED', attemptId: id, submissionId: payload.submissionId, payloadHash: 'h'.repeat(64) } }) }))
    view(client, completed)
    await lastQuestion(218)
    expect(client.submitWhole).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '提交整份问卷' }))
    await waitFor(() => expect(client.submitWhole).toHaveBeenCalledTimes(1))
    const payload = client.submitWhole.mock.calls[0][1]
    expect(payload.units).toHaveLength(8)
    expect(payload.units.reduce((n: number, unit: WholeQuestionnaireInput['units'][number]) => n + unit.answers.length, 0)).toBe(218)
    expect(payload.units[0].answers[0].responseValue).toBe(1)
    expect(payload.units[1].answers[0].responseValue).toBe(2)
    expect((await finalDraftStore.get(key))?.sealedSubmission?.payload).toEqual(payload)
    expect(completed).not.toHaveBeenCalled()
    await act(async () => confirm())
    await waitFor(() => expect(completed).toHaveBeenCalledTimes(1))
    expect(await finalDraftStore.get(key)).toBeNull()
  })

  it('keeps a sealed 218-answer request across reload and retries it with enrollment disabled', async () => {
    const d = definition(), client = api()
    await seed(d)
    const first = view(client)
    client.submitWhole.mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 503, code: 'COMPLETION_BUSY' }))
    await lastQuestion(218)
    fireEvent.click(screen.getByRole('button', { name: '提交整份问卷' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '重试并确认整卷提交' })).not.toBeDisabled())
    const sealed = (await finalDraftStore.get(key))!.sealedSubmission!.payload
    expect((await finalDraftStore.get(key))!.status).toBe('RETRY_PENDING')
    first.unmount()
    client.wholeDefinition.mockClear(); client.reportStatus.mockClear(); client.wholeDefinition.mockRejectedValue(Object.assign(new Error('enrollment disabled'), { status: 409 }))
    view(client)
    fireEvent.click(await screen.findByRole('button', { name: '重试并确认整卷提交' }))
    await screen.findByRole('heading', { name: '交卷成功' })
    expect(client.wholeDefinition).not.toHaveBeenCalled(); expect(client.reportStatus).not.toHaveBeenCalled()
    expect(client.submitWhole.mock.calls[1][1]).toEqual(sealed)
    expect(await finalDraftStore.get(key)).toBeNull()
  })

  it('does not seal or submit an incomplete draft', async () => {
    const d = definition([1, 1]), client = api(); client.wholeDefinition.mockResolvedValue({ code: 0, data: d })
    await seed(d, true); view(client); await lastQuestion(2)
    fireEvent.click(screen.getByRole('button', { name: '提交整份问卷' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('还有必答题')
    expect(client.submitWhole).not.toHaveBeenCalled()
    expect(await finalDraftStore.get(key)).toMatchObject({ status: 'DRAFT', sealedSubmission: undefined })
  })

  it('keeps the saved receipt authoritative when opening the report fails', async () => {
    const d = definition([1, 1]), client = api(); client.wholeDefinition.mockResolvedValue({ code: 0, data: d })
    await seed(d); view(client, () => { throw new Error('navigation failed') }); await lastQuestion(2)
    fireEvent.click(screen.getByRole('button', { name: '提交整份问卷' }))
    await screen.findByRole('heading', { name: '交卷成功' })
    expect(await screen.findByRole('alert')).toHaveTextContent('无需重新交卷')
    expect(client.submitWhole).toHaveBeenCalledTimes(1)
    expect(await finalDraftStore.get(key)).toBeNull()
    expect(screen.queryByRole('button', { name: '重试并确认整卷提交' })).not.toBeInTheDocument()
  })
})
