import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CompositeAttemptState, CompositeCurrentItem } from '../../modules/composite/types'
import { finalDraftStore } from '../../services/persistence/finalDraftStore'
import FinalCompositeAssessment from '../FinalCompositeAssessment'

const { mockRetry, trainingHost } = vi.hoisted(() => ({ mockRetry: vi.fn(), trainingHost: vi.fn(() => false) }))
vi.mock('../../training/context', () => ({ isTrainingHost: trainingHost }))

vi.mock('../../services/persistence/finalDraftCapacityRetry', () => ({
  runFinalDraftCapacityRetry: mockRetry,
}))

const formItem: CompositeCurrentItem = {
  id: 'composite-form-choice-item',
  type: 'FORM_SECTION',
  position: 0,
  required: true,
  formSectionId: 'composite-form-choice-section',
  definitionHash: 'composite-form-choice-definition',
  title: '学生信息',
  formAnswers: [{
    formItemId: 'grade',
    type: 'single_choice',
    label: '当前年级',
    placeholder: null,
    options: [
      { value: 'g1', label: '一年级' },
      { value: 'g2', label: '二年级' },
    ],
    required: true,
    contextKey: null,
    value: null,
  }],
}

const state: CompositeAttemptState = {
  id: 'composite-attempt-form-player',
  assessmentId: 'composite-assessment-form-player',
  name: 'Bundle Form Player',
  instruction: null,
  status: 'IN_PROGRESS',
  progress: 0,
  completedItems: 0,
  totalItems: 1,
  currentIndex: 0,
  startedAt: '2026-09-14T00:00:00.000Z',
  lastSavedAt: '2026-09-14T00:00:00.000Z',
  completedAt: null,
  anonymousCode: null,
  items: [{ id: formItem.id, type: formItem.type, position: 0, label: '学生信息', completed: false, index: 0 }],
  currentItem: formItem,
  deliveryMode: 'FINAL_ONLY',
  attemptEpoch: 1,
  contextSnapshotHash: null,
}

describe('FinalCompositeAssessment presentation reuse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    trainingHost.mockReturnValue(false)
    mockRetry.mockImplementation(async ({ operation }: { operation: () => Promise<unknown> }) => operation())
  })

  afterEach(async () => {
    await finalDraftStore.delete('composite-form-section:composite-attempt-form-player:composite-form-choice-section')
    await finalDraftStore.delete('composite-scale:whole-page-scale')
  })

  it('uses FormPlayer native choice semantics while preserving the Composite FINAL payload', async () => {
    const user = userEvent.setup()
    const submitFormSection = vi.fn().mockResolvedValue({ code: 0, message: 'ok', data: null })

    render(
      <FinalCompositeAssessment
        state={state}
        submitFormSection={submitFormSection}
        submitScale={vi.fn()}
        onReload={vi.fn().mockResolvedValue(undefined)}
        onExit={vi.fn()}
        onCompleted={vi.fn()}
        onEnterCognitive={vi.fn()}
        onEnterSituational={vi.fn()}
      />,
    )

    const firstGrade = await screen.findByRole('radio', { name: '一年级' })
    expect(firstGrade).not.toBeChecked()

    await user.click(firstGrade)
    expect(firstGrade).toBeChecked()
    await user.click(screen.getByRole('button', { name: '提交整个区段' }))

    await waitFor(() => expect(submitFormSection).toHaveBeenCalledTimes(1))
    expect(submitFormSection.mock.calls[0][0]).toBe(state.id)
    expect(submitFormSection.mock.calls[0][1]).toBe('composite-form-choice-section')
    expect(submitFormSection.mock.calls[0][2]).toMatchObject({
      attemptEpoch: 1,
      definitionHash: 'composite-form-choice-definition',
      answers: [{ formItemId: 'grade', value: 'g1' }],
    })
  })
  it('seals ordinary optional fallback fields as null, including cleared text', async () => {
    const user = userEvent.setup()
    const submitFormSection = vi.fn().mockResolvedValue({ code: 0, data: null })
    const optional = { ...formItem, formAnswers: undefined, answers: [{ ...formItem.formAnswers![0], type: 'text_input', label: '选填意见', required: false }] }
    render(<FinalCompositeAssessment state={{ ...state, currentItem: optional }} submitFormSection={submitFormSection} submitScale={vi.fn()} onReload={vi.fn().mockResolvedValue(undefined)} onExit={vi.fn()} onCompleted={vi.fn()} onEnterCognitive={vi.fn()} onEnterSituational={vi.fn()} />)
    const input = await screen.findByRole('textbox')
    await user.type(input, '   ')
    await user.click(screen.getByRole('button', { name: '提交整个区段' }))
    await waitFor(() => expect(submitFormSection).toHaveBeenCalledTimes(1))
    expect(submitFormSection.mock.calls[0][2].answers).toEqual([{ formItemId: 'grade', value: null }])
  })

  it('clears an optional single choice without choosing a refusal value', async () => {
    const user = userEvent.setup()
    const submitFormSection = vi.fn().mockResolvedValue({ code: 0, data: null })
    const optional = { ...formItem, formAnswers: [{ ...formItem.formAnswers![0], required: false }] }
    render(<FinalCompositeAssessment state={{ ...state, currentItem: optional }} submitFormSection={submitFormSection} submitScale={vi.fn()} onReload={vi.fn().mockResolvedValue(undefined)} onExit={vi.fn()} onCompleted={vi.fn()} onEnterCognitive={vi.fn()} onEnterSituational={vi.fn()} />)
    await user.click(await screen.findByRole('radio', { name: '一年级' }))
    await user.click(screen.getByRole('button', { name: '清空本题（不作答）' }))
    expect(screen.getByRole('radio', { name: '一年级' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: '提交整个区段' }))
    await waitFor(() => expect(submitFormSection).toHaveBeenCalledTimes(1))
    expect(submitFormSection.mock.calls[0][2].answers).toEqual([{ formItemId: 'grade', value: null }])
  })

  it('allows School to collapse instructions without losing an answer or submitting it', async () => {
    const user = userEvent.setup()
    const submitFormSection = vi.fn()
    const props = { state, campusMode:true, instructionsSummary:'作答说明', submitFormSection, submitScale:vi.fn(), onReload:vi.fn().mockResolvedValue(undefined), onExit:vi.fn(), onCompleted:vi.fn(), onEnterCognitive:vi.fn(), onEnterSituational:vi.fn() }
    const { container } = render(<FinalCompositeAssessment {...props} />)
    const answer = await screen.findByRole('radio', { name:'一年级' })
    await user.click(answer)
    const instructions = container.querySelector('details.assessment-instructions')!
    expect(instructions).not.toHaveAttribute('open')
    await user.click(screen.getByText('作答说明', { exact:true }))
    expect(instructions).toHaveAttribute('open')
    expect(instructions).toHaveTextContent(/当前部分：\s*学生信息/)
    expect(instructions).toBeVisible()
    await user.click(screen.getByText('作答说明', { exact:true }))
    expect(instructions).not.toHaveAttribute('open')
    expect(answer).toBeChecked()
    expect(submitFormSection).not.toHaveBeenCalled()
    expect(container.querySelector('.training-form-surface')).toBeNull()
  })

  it('lets Teacher advance single-choice fields within a block and keeps the final submit manual', async()=>{
    const user=userEvent.setup(),submitFormSection=vi.fn().mockResolvedValue({code:0,data:null})
    const item={...formItem,formAnswers:[formItem.formAnswers![0],{...formItem.formAnswers![0],formItemId:'second',label:'第二题'}]}
    render(<FinalCompositeAssessment state={{...state,currentItem:item}} campusMode={false} autoAdvanceSingleChoice submitFormSection={submitFormSection} submitScale={vi.fn()} onReload={vi.fn().mockResolvedValue(undefined)} onExit={vi.fn()} onCompleted={vi.fn()} onEnterCognitive={vi.fn()} onEnterSituational={vi.fn()}/>)
    await user.click(await screen.findByRole('radio',{name:'一年级'}))
    await screen.findByRole('region',{name:'表单题目 2 / 2'})
    await user.click(screen.getByRole('radio',{name:'二年级'}))
    await waitFor(()=>expect(screen.getByRole('radio',{name:'二年级'})).toBeChecked())
    expect(submitFormSection).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button',{name:'提交整个区段'}))
    await waitFor(()=>expect(submitFormSection).toHaveBeenCalledTimes(1))
    expect(submitFormSection.mock.calls[0][2].answers).toEqual([{formItemId:'grade',value:'g1'},{formItemId:'second',value:'g2'}])
  })

  it('limits the Training skin to ordinary Form and leaves other entry/mode surfaces unchanged', async () => {
    trainingHost.mockReturnValue(true)
    const props = { state, submitFormSection: vi.fn(), submitScale: vi.fn(), onReload: vi.fn().mockResolvedValue(undefined), onExit: vi.fn(), onCompleted: vi.fn(), onEnterCognitive: vi.fn(), onEnterSituational: vi.fn() }
    const { container, rerender } = render(<FinalCompositeAssessment {...props} />)
    await screen.findByRole('radio', { name: '一年级' })
    expect(container.querySelector('.training-form-surface')).not.toBeNull()
    rerender(<FinalCompositeAssessment {...props} campusMode />)
    expect(container.querySelector('.training-form-surface')).toBeNull()
    rerender(<FinalCompositeAssessment {...props} publicMode />)
    expect(container.querySelector('.training-form-surface')).toBeNull()
    trainingHost.mockReturnValue(false)
    rerender(<FinalCompositeAssessment {...props} />)
    expect(container.querySelector('.training-form-surface')).toBeNull()
    trainingHost.mockReturnValue(true)
    rerender(<FinalCompositeAssessment {...props} state={{ ...state, currentItem: { ...formItem, type: 'COGNITIVE' } }} />)
    expect(container.querySelector('.training-form-surface')).toBeNull()
  })

})


const wholePageScale: CompositeCurrentItem = {
  id: 'whole-page-unit', type: 'SCALE', position: 0, required: true,
  presentationMode: 'ALL_AT_ONCE', scaleAssessmentId: 'whole-page-scale', definitionHash: 'frozen-page-hash',
  scale: { id: 'source-scale', name: '冻结整页量表', definition: {
    schemaVersion: 2, respondentType: 'participant_self_report', display: { randomizeItems: false },
    items: [0, 1, 2].map(index => ({ itemCode: `q${index}`, content: `整页题目${index}`, type: 'single', required: true, sortOrder: index, responseSetKey: 'choice', randomizeOptions: false,
      options: [{ value: 1, label: `数值${index}` }, { value: '1', label: `文本${index}` }] })),
  } },
}

describe('Composite exact frozen presentation mode', () => {
  beforeEach(() => { vi.clearAllMocks(); trainingHost.mockReturnValue(true); mockRetry.mockImplementation(async ({ operation }: { operation: () => Promise<unknown> }) => operation()) })
  afterEach(async () => { await finalDraftStore.delete('composite-scale:whole-page-scale') })
  const props = () => ({ state: { ...state, currentItem: wholePageScale }, submitFormSection: vi.fn(), submitScale: vi.fn().mockResolvedValue({ code: 0, data: null }), onReload: vi.fn().mockResolvedValue(undefined), onExit: vi.fn(), onCompleted: vi.fn(), onEnterCognitive: vi.fn(), onEnterSituational: vi.fn() })
  it('shows three items together, preserves typed local restore and requires manual unit submission', async () => {
    const user = userEvent.setup(), input = props()
    const view = render(<FinalCompositeAssessment {...input} />)
    await screen.findByRole('button', { name: '数值0' })
    expect(screen.getAllByRole('group', { name: /整页题目/ })).toHaveLength(3)
    expect(screen.queryByRole('button', { name: '下一题' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '上一题' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '数值0' }))
    await user.click(screen.getByRole('button', { name: '文本1' }))
    await user.click(screen.getByRole('button', { name: '数值2' }))
    await waitFor(async () => expect((await finalDraftStore.listAnswers('composite-scale:whole-page-scale')).length).toBe(3))
    expect(input.submitScale).not.toHaveBeenCalled()
    view.unmount()
    render(<FinalCompositeAssessment {...input} />)
    expect(await screen.findByRole('button', { name: '数值0' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '文本0' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '文本1' })).toHaveAttribute('aria-pressed', 'true')
    expect(input.submitScale).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '提交整份量表' }))
    await waitFor(() => expect(input.submitScale).toHaveBeenCalledTimes(1))
    expect(input.submitScale.mock.calls[0][2].answers).toEqual([
      { itemCode: 'q0', responseValue: 1 }, { itemCode: 'q1', responseValue: '1' }, { itemCode: 'q2', responseValue: 1 },
    ])
  })
  it('keeps old units sequential without inferring mode from origin', async () => {
    const input = props()
    render(<FinalCompositeAssessment {...input} state={{ ...input.state, currentItem: { ...wholePageScale, presentationMode: undefined } }} />)
    await screen.findByRole('button', { name: '数值0' })
    expect(screen.queryByRole('button', { name: '数值1' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一题' })).toBeInTheDocument()
  })
  it('lets Teacher auto-advance a one-by-one scale but never auto-submit the last item',async()=>{
    trainingHost.mockReturnValue(false)
    const user=userEvent.setup(),input=props()
    render(<FinalCompositeAssessment {...input} state={{...input.state,currentItem:{...wholePageScale,presentationMode:'ONE_BY_ONE'}}} campusMode={false} autoAdvanceSingleChoice/>)
    await user.click(await screen.findByRole('button',{name:'数值0'}))
    await user.click(await screen.findByRole('button',{name:'数值1'}))
    await user.click(await screen.findByRole('button',{name:'数值2'}))
    await waitFor(()=>expect(screen.getByRole('button',{name:'数值2'})).toHaveAttribute('aria-pressed','true'))
    expect(input.submitScale).not.toHaveBeenCalled()
    expect(screen.getByRole('region',{name:'量表题目 3 / 3'})).toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'提交整份量表'}))
    await waitFor(()=>expect(input.submitScale).toHaveBeenCalledTimes(1))
  })
  it('keeps frozen all-at-once delivery when Teacher opts into single-choice advance',async()=>{
    trainingHost.mockReturnValue(false)
    const user=userEvent.setup(),input=props()
    render(<FinalCompositeAssessment {...input} campusMode={false} autoAdvanceSingleChoice/>)
    await user.click(await screen.findByRole('button',{name:'数值0'}))
    expect(screen.getAllByRole('region',{name:/量表题目/})).toHaveLength(3)
    expect(input.submitScale).not.toHaveBeenCalled()
  })

})
