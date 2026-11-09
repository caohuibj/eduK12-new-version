import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import WholeCompositeQuestionnaire, { wholeAnswerKey, wholeFormAnswerKey, wholeDraftKey, type WholeQuestionnaireApi } from '../WholeCompositeQuestionnaire'
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

  it('seamlessly renders mixed Form + Scale questionnaire, transitions with 0 HTTP calls, and submits unified payload', async () => {
    const mixedDef: WholeQuestionnaireDefinition = {
      attemptId: 'whole-attempt',
      attemptEpoch: 1,
      slotSetHash: 'm'.repeat(64),
      contextSnapshotHash: 'context-mixed',
      formSections: [
        {
          id: 'section-demographics',
          title: '基本信息',
          description: '请填写背景信息',
          position: 0,
          contextSection: false,
          definitionHash: 'hash-form-sec',
          items: [
            {
              id: 'gender-item',
              formType: 'single_choice',
              formLabel: '您的性别',
              formPlaceholder: null,
              required: true,
              formOptions: [{ value: 'male', label: '男' }, { value: 'female', label: '女' }],
              contextKey: 'gender',
              position: 0,
              formSectionPosition: 0,
            },
            {
              id: 'age-item',
              formType: 'fill_blank',
              formLabel: '您的年龄',
              formPlaceholder: '请输入年龄',
              required: true,
              formOptions: null,
              contextKey: null,
              position: 1,
              formSectionPosition: 1,
            },
          ],
        },
      ],
      units: [
        {
          itemId: 'scale-unit-1',
          scaleAssessmentId: 'child-scale-1',
          definitionHash: 'hash-scale-1',
          position: 1,
          scale: {
            id: 'scale-1',
            name: '学习动机量表',
            instruction: '请根据实际情况选择',
            definition: {
              schemaVersion: 2,
              respondentType: 'participant_self_report',
              display: { randomizeItems: false },
              items: [
                {
                  itemCode: 'sm-q1',
                  content: '我对学习新知识感兴趣',
                  type: 'single',
                  required: true,
                  sortOrder: 0,
                  responseSetKey: 'likert',
                  randomizeOptions: false,
                  options: [{ value: 1, label: '完全不同意' }, { value: 2, label: '完全同意' }],
                },
              ],
            },
          },
        },
      ],
    }

    const client = api()
    client.wholeDefinition.mockResolvedValue({ code: 0, data: mixedDef })
    const completed = vi.fn()
    view(client, completed)

    expect(await screen.findByText('基本信息')).toBeInTheDocument()
    expect(screen.getByText('您的性别')).toBeInTheDocument()
    expect(screen.getByText('整卷第 1 / 3 题')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('女'))
    fireEvent.click(screen.getByRole('button', { name: '下一题' }))

    expect(await screen.findByText('您的年龄')).toBeInTheDocument()
    expect(screen.getByText('整卷第 2 / 3 题')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('请输入年龄'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: '下一题' }))

    expect(await screen.findByText('学习动机量表')).toBeInTheDocument()
    expect(screen.getByText('我对学习新知识感兴趣')).toBeInTheDocument()
    expect(screen.getByText('整卷第 3 / 3 题')).toBeInTheDocument()

    expect(client.submitWhole).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('完全同意'))

    fireEvent.click(screen.getByRole('button', { name: '提交整份问卷' }))
    await waitFor(() => expect(client.submitWhole).toHaveBeenCalledTimes(1))

    const payload = client.submitWhole.mock.calls[0][1]
    expect(payload.units).toHaveLength(1)
    expect(payload.units[0].itemId).toBe('scale-unit-1')
    expect(payload.units[0].answers).toEqual([{ itemCode: 'sm-q1', responseValue: 2, responseTimeMs: expect.any(Number), changeCount: 0 }])

    expect(payload.formAnswers).toBeDefined()
    expect(payload.formAnswers).toHaveLength(1)
    expect(payload.formAnswers[0].sectionId).toBe('section-demographics')
    expect(payload.formAnswers[0].answers).toEqual([
      { formItemId: 'gender-item', value: 'female' },
      { formItemId: 'age-item', value: '25' },
    ])

    await screen.findByRole('heading', { name: '交卷成功' })
    expect(completed).toHaveBeenCalledTimes(1)
    expect(await finalDraftStore.get(key)).toBeNull()
  })

  it('blocks whole submission if a required form question is unanswered', async () => {
    const mixedDef: WholeQuestionnaireDefinition = {
      attemptId: 'whole-attempt',
      attemptEpoch: 1,
      slotSetHash: 'm'.repeat(64),
      contextSnapshotHash: 'context-mixed',
      formSections: [
        {
          id: 'sec-1',
          title: '表单区',
          description: null,
          position: 0,
          contextSection: false,
          definitionHash: 'h-sec-1',
          items: [
            {
              id: 'req-item',
              formType: 'fill_blank',
              formLabel: '必填表单题',
              formPlaceholder: null,
              required: true,
              formOptions: null,
              contextKey: null,
              position: 0,
              formSectionPosition: 0,
            },
          ],
        },
      ],
      units: [
        {
          itemId: 'unit-1',
          scaleAssessmentId: 'child-1',
          definitionHash: 'h-scale-1',
          position: 1,
          scale: {
            id: 'scale-1',
            name: '量表 1',
            definition: {
              schemaVersion: 2,
              respondentType: 'participant_self_report',
              display: { randomizeItems: false },
              items: [
                { itemCode: 'q1', content: '题目 1', type: 'single', required: true, sortOrder: 0, responseSetKey: 'r', randomizeOptions: false, options: [{ value: 1, label: 'A' }] },
              ],
            },
          },
        },
      ],
    }

    const client = api()
    client.wholeDefinition.mockResolvedValue({ code: 0, data: mixedDef })
    view(client)

    expect(await screen.findByText('必填表单题')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一题' }))

    expect(await screen.findByText('题目 1')).toBeInTheDocument()
    fireEvent.click(screen.getByText('A'))

    fireEvent.click(screen.getByRole('button', { name: '提交整份问卷' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('还有必答题未作答')
    expect(client.submitWhole).not.toHaveBeenCalled()
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

it('skips redundant reportStatus check on fresh in-progress attempt for 0ms question render', async () => {
  const d = definition([1]), client = api(); client.wholeDefinition.mockResolvedValue({ code: 0, data: d })
  render(<WholeCompositeQuestionnaire state={state} isFreshStart api={client} publicMode recoveryToken="synthetic-recovery" fallback={<p>fallback</p>} onCompleted={vi.fn()} onExit={vi.fn()}/>)
  expect(await screen.findByText(/量表 0 题目 0/)).toBeInTheDocument()
  expect(client.reportStatus).not.toHaveBeenCalled()
  expect(client.wholeDefinition).toHaveBeenCalledTimes(1)
})

it('verifies cross-device / reload entry checks reportStatus and shows accepted screen without rendering Question 1', async () => {
  const client = api()
  client.reportStatus.mockResolvedValue({
    code: 0,
    data: {
      wholeSubmissionReceived: true,
      wholeSubmissionId: 'sub-device-a',
      reportStatus: { state: 'PROCESSING', jobId: 'job-1', retryAfterSeconds: 3, errorCode: null, completedAt: null },
    },
  })
  // isFreshStart is false (default when re-entering or on device B)
  render(<WholeCompositeQuestionnaire state={state} isFreshStart={false} api={client} publicMode recoveryToken="synthetic-recovery" fallback={<p>fallback</p>} onCompleted={vi.fn()} onExit={vi.fn()}/>)

  expect(await screen.findByRole('heading', { name: '交卷成功' })).toBeInTheDocument()
  expect(client.reportStatus).toHaveBeenCalledTimes(1)
  expect(client.wholeDefinition).not.toHaveBeenCalled()
  expect(screen.queryByText(/量表 0 题目 0/)).not.toBeInTheDocument()
})

it('fetches the definition through api.wholeDefinition so the inline identity check still applies', async () => {
  // X-09 review: the inline definition must go through wholeDefinitionWithInlineFallback
  // (attemptId + epoch + context hash + one-time consumption). A direct prop would
  // bypass the epoch check, so the runner always calls api.wholeDefinition here.
  const d = definition([1]), client = api()
  client.wholeDefinition.mockResolvedValue({ code: 0, data: d })
  render(
    <WholeCompositeQuestionnaire
      state={state}
      isFreshStart
      api={client}
      publicMode
      recoveryToken="synthetic-recovery"
      fallback={<p>fallback</p>}
      onCompleted={vi.fn()}
      onExit={vi.fn()}
    />,
  )
  expect(await screen.findByText(/量表 0 题目 0/)).toBeInTheDocument()
  expect(client.reportStatus).not.toHaveBeenCalled()
  expect(client.wholeDefinition).toHaveBeenCalledTimes(1)
  expect(client.wholeDefinition).toHaveBeenCalledWith(state.id)
})
