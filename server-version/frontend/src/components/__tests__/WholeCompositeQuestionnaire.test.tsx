import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import WholeCompositeQuestionnaire, { wholeAnswerKey, wholeFormAnswerKey, wholeDraftKey, type WholeQuestionnaireApi } from '../WholeCompositeQuestionnaire'
import { createFinalDraftMeta, finalDraftStore } from '../../services/persistence/finalDraftStore'
import type { CompositeAttemptState, WholeQuestionnaireDefinition, WholeQuestionnaireInput } from '../../modules/composite/types'
const { retry } = vi.hoisted(() => ({ retry: vi.fn() }))
vi.mock('../../services/persistence/finalDraftCapacityRetry', () => ({ runFinalDraftCapacityRetry: retry }))
vi.mock('../../modules/assessment-media/AssessmentImageGate', () => ({ default: ({ children, items, loadAsset }: { children: ReactNode; items?: Array<{ asset?: { assetId?: string } }>; loadAsset?: (id: string) => Promise<Blob> }) => {
  const assetId = items?.[0]?.asset?.assetId
  if (assetId && loadAsset) void loadAsset(assetId)
  return children
} }))
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
  it('keeps frozen scale and form order and shows a failed worker without resubmitting', async () => {
    const ordered = definition([1, 1])
    ordered.units[0].scale.name = '量表甲'
    ordered.units[1].scale.name = '量表丙'
    delete (ordered.units[0] as { position?: number }).position
    delete (ordered.units[1] as { position?: number }).position
    ordered.formSections = [{ id: 'form-b', title: '表单乙', description: null, position: 0, contextSection: false, definitionHash: 'd'.repeat(16), items: [{ id: 'field', formType: 'text', formLabel: '填空', formPlaceholder: null, required: false, formOptions: null, contextKey: null }] }]
    const client = api()
    client.wholeDefinition.mockResolvedValue({ code: 0, data: ordered })
    const frozen = { ...state, units: [
      { id: 'a', type: 'SCALE' as const, position: 2, required: true, label: '甲', completed: false, index: 0, itemId: 'unit-0' },
      { id: 'form-b', type: 'FORM_SECTION' as const, position: 0, required: true, label: '乙', completed: false, index: 1, formSectionId: 'form-b' },
      { id: 'c', type: 'SCALE' as const, position: 1, required: true, label: '丙', completed: false, index: 2, itemId: 'unit-1' },
    ] }
    render(<WholeCompositeQuestionnaire state={frozen} isFreshStart api={client} educationMedia={{ loadScaleImage: vi.fn(), loadScaleVideo: vi.fn(), loadFormImage: vi.fn(), loadFormVideo: vi.fn() }} fallback={<p>旧单元作答</p>} onCompleted={vi.fn()} onExit={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: '量表甲' })).toBeTruthy()
    const failed = api()
    failed.reportStatus.mockResolvedValueOnce({ code: 0, data: { wholeSubmissionReceived: true, reportStatus: { state: 'PENDING' } } })
      .mockResolvedValueOnce({ code: 0, data: { status: 'IN_PROGRESS', wholeSubmissionReceived: true, reportStatus: { state: 'FAILED' } } })
    const media = { loadScaleImage: vi.fn(), loadScaleVideo: vi.fn(), loadFormImage: vi.fn(), loadFormVideo: vi.fn() }
    render(<WholeCompositeQuestionnaire state={frozen} api={failed} educationMedia={media} acceptedAction="查看完成状态" fallback={<p>旧单元作答</p>} onCompleted={vi.fn()} onExit={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '查看完成状态' }))
    expect(await screen.findByText('答案已保存，但后台处理失败。请稍后再次查看，不要重新交卷。')).toBeTruthy()
    expect(failed.submitWhole).not.toHaveBeenCalled()
  })

  it('shows the stepped fallback for an all-at-once unit and loads a form option image', async () => {
    render(<WholeCompositeQuestionnaire state={{ ...state, currentItem: { id: 'unit', type: 'SCALE', position: 0, required: true, presentationMode: 'ALL_AT_ONCE' } }} api={api()} fallback={<p>旧单元作答</p>} onCompleted={vi.fn()} onExit={vi.fn()} />)
    expect(screen.getByText('旧单元作答')).toBeTruthy()
    const image = { asset: { assetId: 'asset-1', contentHash: 'c'.repeat(64), mimeType: 'image/png' }, altText: '选项图', order: 0 }
    const formDefinition = { attemptId: 'whole-attempt', attemptEpoch: 1, slotSetHash: 's'.repeat(64), contextSnapshotHash: null, units: [], formSections: [{ id: 'section', title: '表单', description: null, contextSection: false, definitionHash: 'd'.repeat(16), items: [{ id: 'field', formType: 'single_choice', formLabel: '带图选项', formPlaceholder: null, required: false, formOptions: [{ value: 'a', label: '甲', images: [image] }] }] }] }
    const loadFormImage = vi.fn(async () => new Blob())
    const client = api()
    client.wholeDefinition.mockResolvedValue({ code: 0, data: formDefinition })
    render(<WholeCompositeQuestionnaire state={{ ...state, isFreshStart: true } as CompositeAttemptState} isFreshStart api={client} educationMedia={{ loadScaleImage: vi.fn(), loadScaleVideo: vi.fn(), loadFormImage, loadFormVideo: vi.fn() }} fallback={<p>旧单元作答</p>} onCompleted={vi.fn()} onExit={vi.fn()} />)
    await screen.findByText('带图选项')
    await waitFor(() => expect(loadFormImage).toHaveBeenCalledWith('section', 'asset-1'))
  })

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

  it('recovers a late commit after an initial NOT_RECEIVED without re-posting', async () => {
    const d = definition([1, 1]), client = api(), completed = vi.fn()
    client.wholeDefinition.mockResolvedValue({ code: 0, data: d })
    const lookup = vi.fn()
      // Immediate probe after Attempt 1 timeout: server still finishing commit
      .mockResolvedValueOnce({ code: 0, message: 'ok', data: { status: 'NOT_RECEIVED' as const, attemptId: 'whole-attempt', submissionId: 'whole-browser-sealed-submission' } })
      // Delayed confirmation: server committed during the wait.
      .mockResolvedValueOnce({ code: 0, message: 'ok', data: { status: 'ACCEPTED' as const, attemptId: 'whole-attempt', submissionId: 'whole-browser-sealed-submission', payloadHash: 'h'.repeat(64), acceptedAt: '2026-10-15T00:00:00Z', committedAt: '2026-10-15T00:00:01Z', replayed: true } })
    Object.assign(client, { wholeReceipt: lookup })
    client.submitWhole.mockRejectedValueOnce(Object.assign(new Error('timeout of 25000ms exceeded'), { code: 'ECONNABORTED', retryable: true }))
    await seed(d); view(client, completed); await lastQuestion(2)
    fireEvent.click(screen.getByRole('button', { name: '提交整份问卷' }))
    await waitFor(() => expect(completed).toHaveBeenCalledTimes(1), { timeout: 3_000 })
    // A single negative read cannot authorize another POST.
    expect(client.submitWhole).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(await finalDraftStore.get(key)).toBeNull()
  })

  it('retains the sealed answers and only rechecks when receipt reads are unavailable, including after refresh', async () => {
    const d = definition([1, 1]), client = api(), completed = vi.fn()
    client.wholeDefinition.mockResolvedValue({ code: 0, data: d })
    const unavailable = Object.assign(new Error('read unavailable'), { status: 503 })
    const lookup = vi.fn().mockRejectedValue(unavailable)
    const withReceipt = { ...client, wholeReceipt: lookup }
    client.submitWhole.mockRejectedValueOnce(new TypeError('response lost'))
    retry.mockImplementationOnce(async options => {
      const { runFinalDraftCapacityRetry } = await vi.importActual<typeof import('../../services/persistence/finalDraftCapacityRetry')>('../../services/persistence/finalDraftCapacityRetry')
      return runFinalDraftCapacityRetry({ ...options, sleep: async () => {} })
    })
    await seed(d); const beforeRefresh = view(withReceipt, completed); await lastQuestion(2)
    fireEvent.click(screen.getByRole('button', { name: '提交整份问卷' }))
    await screen.findByText('暂时无法确认服务器是否收到答案，本机草稿已保留。', {}, { timeout: 3_000 })
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(client.submitWhole).toHaveBeenCalledTimes(1)
    expect(completed).not.toHaveBeenCalled()
    const sealed = (await finalDraftStore.get(key))!.sealedSubmission!.payload

    beforeRefresh.unmount()
    client.wholeDefinition.mockClear(); client.reportStatus.mockClear()
    let finishLookup!: () => void
    lookup.mockImplementationOnce(() => new Promise((_resolve, reject) => { finishLookup = () => reject(unavailable) }))
    view(withReceipt, completed)
    expect(await screen.findByText('正在查询交卷回执，本机草稿已保留。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '再次确认交卷状态' })).toBeDisabled()
    await act(async () => finishLookup())
    await screen.findByText('暂时无法确认服务器是否收到答案，本机草稿已保留。')
    expect((await finalDraftStore.get(key))?.sealedSubmission?.payload).toEqual(sealed)
    expect(client.wholeDefinition).not.toHaveBeenCalled()
    expect(client.reportStatus).not.toHaveBeenCalled()
    expect(client.submitWhole).toHaveBeenCalledTimes(1)

    lookup.mockResolvedValueOnce({ code: 0, data: { status: 'ACCEPTED', attemptId: state.id,
      submissionId: 'whole-browser-sealed-submission', payloadHash: 'h'.repeat(64) } })
    fireEvent.click(screen.getByRole('button', { name: '再次确认交卷状态' }))
    await waitFor(() => expect(completed).toHaveBeenCalledTimes(1))
    expect(client.submitWhole).toHaveBeenCalledTimes(1)
    expect(await finalDraftStore.get(key)).toBeNull()
  })

  it('replays the same sealed body after confirmed absence and a final pre-replay lookup', async () => {
    const d = definition([1, 1]), client = api(), completed = vi.fn()
    client.wholeDefinition.mockResolvedValue({ code: 0, data: d })
    const lookup = vi.fn(async (attemptId: string, submissionId: string) => ({ code: 0, message: 'ok',
      data: { status: 'NOT_RECEIVED' as const, attemptId, submissionId },
    }))
    client.submitWhole.mockRejectedValueOnce(Object.assign(new Error('upstream timeout'), { status: 504 }))
    retry.mockImplementationOnce(async options => {
      const { runFinalDraftCapacityRetry } = await vi.importActual<typeof import('../../services/persistence/finalDraftCapacityRetry')>('../../services/persistence/finalDraftCapacityRetry')
      return runFinalDraftCapacityRetry({ ...options, sleep: async () => {} })
    })
    await seed(d); view({ ...client, wholeReceipt: lookup }, completed); await lastQuestion(2)
    fireEvent.click(screen.getByRole('button', { name: '提交整份问卷' }))
    await waitFor(() => expect(completed).toHaveBeenCalledTimes(1), { timeout: 3_000 })
    expect(lookup).toHaveBeenCalledTimes(3)
    expect(client.submitWhole).toHaveBeenCalledTimes(2)
    expect(client.submitWhole.mock.calls[1]).toEqual(client.submitWhole.mock.calls[0])
    expect(await finalDraftStore.get(key)).toBeNull()
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
