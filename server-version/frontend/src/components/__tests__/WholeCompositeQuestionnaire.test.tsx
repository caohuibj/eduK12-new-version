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
const view = (client: WholeQuestionnaireApi, completed: () => void = vi.fn()) => render(<WholeCompositeQuestionnaire state={state} api={client} fallback={<p>旧单元作答</p>} onCompleted={completed} onExit={vi.fn()} />)
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
  it('replays exactly the sealed optional timing after response loss and reload', async () => {
    const d = definition([2]), client = api()
    d.units[0].trainingTiming={schemaVersion:1,contract:'BROWSER_ACTIVE_SCALE_V1',snapshotHash:'t'.repeat(64)}
    client.wholeDefinition.mockResolvedValue({code:0,data:d})
    await seed(d)
    const first = view(client)
    client.submitWhole.mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 503, code: 'COMPLETION_BUSY' }))
    await lastQuestion(2)
    fireEvent.click(screen.getByRole('button', { name: '提交整份问卷' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '重试并确认整卷提交' })).not.toBeDisabled())
    const sealed = (await finalDraftStore.get(key))!.sealedSubmission!.payload
    expect((sealed as WholeQuestionnaireInput).units[0].itemTimings).toBeDefined()
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
    const draft = await finalDraftStore.get(key)
    expect(draft?.status).toBe('DRAFT')
    expect(draft?.sealedSubmission).toBeUndefined()
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
  it('recovers a lost POST response by its original submission identity without resubmitting answers', async () => {
    const d = definition([1, 1]), client = api(), completed = vi.fn()
    client.wholeDefinition.mockResolvedValue({ code: 0, data: d })
    const lookup = vi.fn(async (id: string, submissionId: string) => ({ code: 0, data: { status: 'ACCEPTED' as const, attemptId: id, submissionId, payloadHash: 'h'.repeat(64), acceptedAt: '', committedAt: '', replayed: true } }))
    Object.assign(client, { wholeReceipt: lookup })
    client.submitWhole.mockRejectedValueOnce(new TypeError('response lost'))
    await seed(d); view(client, completed); await lastQuestion(2)
    fireEvent.click(screen.getByRole('button', { name: '提交整份问卷' }))
    await waitFor(() => expect(completed).toHaveBeenCalledTimes(1))
    expect(client.submitWhole).toHaveBeenCalledTimes(1); expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup.mock.calls[0].slice(0, 2)).toEqual(['whole-attempt', 'whole-browser-sealed-submission'])
    expect(await finalDraftStore.get(key)).toBeNull()
    const saved = JSON.parse(localStorage.getItem('composite:whole-receipt:whole-attempt')!)
    expect(saved.submissionId).toBe('whole-browser-sealed-submission'); expect(saved.answers).toBeUndefined()
  })

})

it('returns focus to the first missing anonymous whole-questionnaire answer without submitting',async()=>{
 const client=api();client.wholeDefinition.mockResolvedValue({code:0,data:definition([2])})
 render(<WholeCompositeQuestionnaire state={state} api={client} publicMode recoveryToken="synthetic-recovery" fallback={<p>fallback</p>} onCompleted={vi.fn()} onExit={vi.fn()}/>);
 fireEvent.click(await screen.findByRole('button',{name:'下一题'}))
 fireEvent.click(screen.getByRole('button',{name:'提交整份问卷'}))
 await waitFor(()=>expect(document.getElementById('training-anonymous-whole-required:whole-attempt')).toHaveFocus())
 expect(screen.getByText('整卷第 1 / 2 题')).toBeInTheDocument()
 expect(client.submitWhole).not.toHaveBeenCalled()
})
it('keeps anonymous receipt success distinct from report release and does not repeat the raw credential',async()=>{
 const d=definition([1]),client=api();client.wholeDefinition.mockResolvedValue({code:0,data:d});await seed(d)
 render(<WholeCompositeQuestionnaire state={state} api={client} publicMode recoveryToken="do-not-repeat-recovery" fallback={<p>fallback</p>} onCompleted={vi.fn()} onExit={vi.fn()}/>);
 fireEvent.click(await screen.findByRole('button',{name:'提交整份问卷'}))
 expect(await screen.findByText(/报告按生成状态和开放权限显示/)).toBeInTheDocument()
 expect(screen.queryByText('do-not-repeat-recovery',{exact:true})).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'查看报告进度'})).toBeEnabled()
 expect(client.submitWhole).toHaveBeenCalledTimes(1)
})
