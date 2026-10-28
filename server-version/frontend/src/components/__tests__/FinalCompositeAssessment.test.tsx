import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DeviceInputProvenanceV1 } from '../../modules/scale/device-input-provenance'
import type { CompositeAttemptState, CompositeCurrentItem } from '../../modules/composite/types'
import FinalCompositeAssessment from '../FinalCompositeAssessment'
import { createFinalDraftMeta, finalDraftStore } from '../../services/persistence/finalDraftStore'

const trainingPresentation = vi.hoisted(() => ({enabled:false}))
vi.mock('../../training/context', async original => ({...await original<typeof import('../../training/context')>(), isTrainingHost:()=>trainingPresentation.enabled}))

const { mockCapture, mockResolve, mockRetry } = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockResolve: vi.fn(),
  mockRetry: vi.fn(),
}))

vi.mock('../../modules/scale/device-input-provenance', async () => {
  const actual = await vi.importActual<typeof import('../../modules/scale/device-input-provenance')>('../../modules/scale/device-input-provenance')
  return { ...actual, resolveScaleDeviceInputProvenance: mockResolve }
})

vi.mock('../../services/persistence/finalDraftCapacityRetry', () => ({
  runFinalDraftCapacityRetry: mockRetry,
}))

const { frameHandlers } = vi.hoisted(()=>({frameHandlers:new Map<string,any>()}))

// The test-only button emits two callbacks in one React event, before render.
vi.mock('../questionnaire/FormPlayer', async () => {
 const actual=await vi.importActual<typeof import('../questionnaire/FormPlayer')>('../questionnaire/FormPlayer')
 return {...actual,default:(props:any)=>{frameHandlers.set(props.item.id,props);return <><actual.default {...props}/>{props.item.label==='同帧其他'&&<button onClick={()=>{props.onChange(['other']);props.onOtherTextChange('同帧文本')}}>同帧选择与文本</button>}</>}}
})

const provenance: DeviceInputProvenanceV1 = {
  schemaVersion: 1,
  deviceClass: 'DESKTOP',
  osFamily: 'Windows',
  browserFamily: 'Chrome',
  viewportWidth: 1280,
  viewportHeight: 720,
  screenWidth: 1920,
  screenHeight: 1080,
  devicePixelRatio: 1,
  maxTouchPoints: 0,
  primaryPointer: 'FINE',
  capturedAt: '2026-09-08T00:00:00.000Z',
}

const scaleItem: CompositeCurrentItem = {
  id: 'composite-scale-item-1',
  type: 'SCALE',
  position: 0,
  required: true,
  definitionHash: 'composite-scale-definition-hash',
  scaleAssessmentId: 'composite-scale-assessment-1',
  scale: {
    id: 'scale-1',
    name: '综合量表',
    definition: {
      schemaVersion: 2,
      respondentType: 'participant_self_report',
      display: { randomizeItems: false },
      items: [{
        itemCode: 'item-1',
        content: '综合量表第一题',
        type: 'single',
        required: true,
        sortOrder: 0,
        responseSetKey: 'set-1',
        randomizeOptions: false,
        options: [{ value: 'often', label: '经常' }],
      }],
    },
  },
}

const formItem: CompositeCurrentItem = {
  id: 'composite-form-item-1',
  type: 'FORM_SECTION',
  position: 0,
  required: true,
  formSectionId: 'composite-form-section-1',
  definitionHash: 'composite-form-definition-hash',
  title: '综合表单',
  formAnswers: [{
    formItemId: 'form-item-1',
    type: 'text_input',
    label: '年级',
    placeholder: null,
    options: null,
    required: false,
    contextKey: null,
    value: null,
  }],
}

const makeState = (currentItem: CompositeCurrentItem): CompositeAttemptState => ({
  id: 'composite-attempt-1',
  assessmentId: 'composite-assessment-1',
  name: '示例综合测评',
  instruction: null,
  status: 'IN_PROGRESS',
  progress: 0,
  completedItems: 0,
  totalItems: 1,
  currentIndex: 0,
  startedAt: '2026-09-08T00:00:00.000Z',
  lastSavedAt: '2026-09-08T00:00:00.000Z',
  completedAt: null,
  anonymousCode: null,
  items: [{ id: currentItem.id, type: currentItem.type, position: 0, label: '当前单元', completed: false, index: 0 }],
  currentItem,
  deliveryMode: 'FINAL_ONLY',
  attemptEpoch: 1,
  contextSnapshotHash: null,
})

const resolveProvenance = ({
  metadata,
  serverValue,
  existing,
}: {
  metadata?: Record<string, unknown>
  serverValue?: DeviceInputProvenanceV1
  existing?: DeviceInputProvenanceV1 | null
}) => (
  (metadata?.scaleDeviceInputProvenance as DeviceInputProvenanceV1 | undefined)
  ?? serverValue
  ?? existing
  ?? mockCapture()
)

beforeEach(() => {
  trainingPresentation.enabled = false
  vi.clearAllMocks()
  mockCapture.mockReturnValue(provenance)
  mockResolve.mockImplementation(resolveProvenance)
  mockRetry.mockImplementation(async ({ operation }: { operation: () => Promise<unknown> }) => operation())
})

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all([
    finalDraftStore.delete('composite-scale:composite-scale-assessment-1'),
    finalDraftStore.delete('composite-form-section:composite-attempt-1:composite-form-section-1'),
  ])
})

const sharedProps = {
  onReload: vi.fn().mockResolvedValue(undefined),
  onExit: vi.fn(),
  onCompleted: vi.fn(),
  onEnterCognitive: vi.fn(),
  onEnterSituational: vi.fn(),
}

describe('historical empty sections', () => {
  it('submits an explicit empty FINAL for an ordinary frozen section', async () => {
    const submitFormSection = vi.fn().mockResolvedValue({ code: 0 })
    render(<FinalCompositeAssessment state={makeState({ ...formItem, formAnswers: [], contextSection: false })} submitFormSection={submitFormSection} submitScale={vi.fn()} {...sharedProps} />)
    await userEvent.click(await screen.findByRole('button', { name: '确认并继续' }))
    await waitFor(() => expect(submitFormSection).toHaveBeenCalledWith('composite-attempt-1', 'composite-form-section-1', expect.objectContaining({ answers: [], definitionHash: 'composite-form-definition-hash' })))
  })
  it('explains recovery for an invalid frozen context instead of silently skipping it', async () => {
    const submitFormSection = vi.fn()
    render(<FinalCompositeAssessment state={makeState({ ...formItem, formAnswers: [], contextSection: true })} submitFormSection={submitFormSection} submitScale={vi.fn()} {...sharedProps} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('请联系教师发布修复版本')
    expect(screen.queryByRole('button', { name: '确认并继续' })).not.toBeInTheDocument()
    expect(submitFormSection).not.toHaveBeenCalled()
  })
})

describe('FinalCompositeAssessment durable selection and exit', () => {
  const multiItem = (): CompositeCurrentItem => ({
    ...scaleItem, scale: { ...scaleItem.scale!, definition: {
      ...scaleItem.scale!.definition!, items: ['item-1', 'item-2', 'item-3'].map((itemCode, index) => ({
        ...scaleItem.scale!.definition!.items[0], itemCode, content: `综合量表第 ${index + 1} 题`,
        options: [{ value: 'often', label: '经常' }, { value: 'rare', label: '偶尔' }],
      })),
    } },
  })
  it('waits for the current item write before exiting and preserves both item answers', async () => {
    const user = userEvent.setup()
    const onExit = vi.fn()
    const state = makeState(multiItem())
    const props = { ...sharedProps, onExit, state, submitScale: vi.fn(), submitFormSection: vi.fn() }
    render(<FinalCompositeAssessment {...props} />)
    await user.click(await screen.findByRole('button', { name: '经常' }))
    await screen.findByText('已保存到本机。')
    expect(screen.getByText('综合量表第 1 题')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /下一题/ }))
    expect(screen.getByRole('button', { name: '经常' })).toHaveAttribute('aria-pressed', 'false')
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const original = finalDraftStore.putAnswer.bind(finalDraftStore)
    const spy = vi.spyOn(finalDraftStore, 'putAnswer').mockImplementationOnce(async answer => { await gate; await original(answer) })
    try {
      await user.click(screen.getByRole('button', { name: '偶尔' }))
      await user.click(screen.getByRole('button', { name: '保存并退出' }))
      expect(onExit).not.toHaveBeenCalled()
      await act(async () => { release(); await gate })
      await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1))
      expect(await finalDraftStore.listAnswers('composite-scale:composite-scale-assessment-1')).toEqual(expect.arrayContaining([
        expect.objectContaining({ itemKey: 'item-1', value: { responseValue: 'often' } }),
        expect.objectContaining({ itemKey: 'item-2', value: { responseValue: 'rare' } }),
      ]))
    } finally {
      release()
      spy.mockRestore()
    }
  })

  it('restores saved item selections without advancing or bleeding into the next item', async () => {
    const user = userEvent.setup(), draftKey = 'composite-scale:composite-scale-assessment-1'
    await finalDraftStore.ensure(createFinalDraftMeta({ draftKey, instrument: 'scale', attemptId: 'composite-scale-assessment-1',
      attemptEpoch: 1, definitionHash: scaleItem.definitionHash!, contextSnapshotHash: null, deliveryMode: 'final_only', submissionId: 'saved-scale-selection' }))
    await finalDraftStore.putAnswer({ draftKey, itemKey: 'item-1', value: { responseValue: 'often' }, updatedAt: Date.now() })
    await finalDraftStore.putAnswer({ draftKey, itemKey: 'item-2', value: { responseValue: 'rare' }, updatedAt: Date.now() })
    render(<FinalCompositeAssessment {...sharedProps} state={makeState(multiItem())} submitScale={vi.fn()} submitFormSection={vi.fn()} />)
    expect(await screen.findByRole('button', { name: '经常' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('综合量表第 1 题')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /下一题/ }))
    expect(screen.getByRole('button', { name: '偶尔' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: /下一题/ }))
    expect(screen.getByRole('button', { name: '偶尔' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the page and current selection when durable storage fails', async () => {
    const user = userEvent.setup()
    const onExit = vi.fn()
    render(<FinalCompositeAssessment {...sharedProps} onExit={onExit} state={makeState(multiItem())} submitScale={vi.fn()} submitFormSection={vi.fn()} />)
    await screen.findByRole('button', { name: '经常' })
    const spy = vi.spyOn(finalDraftStore, 'putAnswer').mockRejectedValueOnce(new Error('本机保存失败，请重试'))
    await user.click(screen.getByRole('button', { name: '经常' }))
    await user.click(screen.getByRole('button', { name: '保存并退出' }))
    await waitFor(() => expect(screen.getAllByText('本机保存失败，请重试').length).toBeGreaterThan(0))
    expect(onExit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '经常' })).toHaveAttribute('aria-pressed', 'true')
    spy.mockRestore()
    await user.click(screen.getByRole('button', { name: '经常' }))
    await screen.findByText('已保存到本机。')
    await user.click(screen.getByRole('button', { name: '保存并退出' }))
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1))
  })
})

describe('FinalCompositeAssessment provenance sibling placement', () => {
  it('sends one top-level provenance object for a Scale child', async () => {
    const user = userEvent.setup()
    const submitScale = vi.fn().mockResolvedValue({ code: 0, message: 'ok', data: null })
    render(
      <FinalCompositeAssessment
        state={makeState(scaleItem)}
        submitScale={submitScale}
        submitFormSection={vi.fn()}
        {...sharedProps}
      />,
    )

    await user.click(await screen.findByRole('button', { name: '经常' }))
    await user.click(screen.getByRole('button', { name: '提交整份量表' }))
    await waitFor(() => expect(submitScale).toHaveBeenCalledTimes(1))

    const input = submitScale.mock.calls[0][2] as Record<string, any>
    expect(input.deviceInputProvenance).toEqual(provenance)
    expect(input.answers).toHaveLength(1)
    expect(input.answers[0]).not.toHaveProperty('deviceInputProvenance')
  })

  it('keeps Scale provenance out of a Form child submit', async () => {
    const user = userEvent.setup()
    const submitFormSection = vi.fn().mockResolvedValue({ code: 0, message: 'ok', data: null })
    render(
      <FinalCompositeAssessment
        state={makeState(formItem)}
        submitScale={vi.fn()}
        submitFormSection={submitFormSection}
        {...sharedProps}
      />,
    )

    await user.click(await screen.findByRole('button', { name: '提交整个区段' }))
    await waitFor(() => expect(submitFormSection).toHaveBeenCalledTimes(1))

    const input = submitFormSection.mock.calls[0][2] as Record<string, unknown>
    expect(input).not.toHaveProperty('deviceInputProvenance')
  })
})

describe('durable submission confirmation', () => {
  it('does not relabel an accepted submission as failed when loading the next screen fails', async () => {
    const user = userEvent.setup()
    const submitScale = vi.fn().mockResolvedValue({ code: 0, data: { submissionId: 'accepted' } })
    const onReload = vi.fn().mockRejectedValue(new Error('report unavailable'))
    render(<FinalCompositeAssessment {...sharedProps} onReload={onReload} state={makeState(scaleItem)} submitScale={submitScale} submitFormSection={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: '经常' }))
    await user.click(screen.getByRole('button', { name: '提交整份量表' }))
    expect(await screen.findByText('服务器已确认保存。后续页面暂时未能加载，可重新读取进度或报告；无需再次交卷。')).toBeInTheDocument()
    expect(submitScale).toHaveBeenCalledTimes(1)
    expect(await finalDraftStore.get('composite-scale:composite-scale-assessment-1')).toBeNull()
  })
})

describe('C04 typed FINAL persistence', () => {
  it.each([false, true])('restores numeric zero and retries the identical sealed typed payload (public=%s)', async publicMode => {
    const q = { itemKey: 'q_typed', type: 'NUMBER' as const, prompt: '数值事实', required: true, options: [], rows: [], min: 0, max: 10 }
    const current: CompositeCurrentItem = { ...formItem, formAnswers: [{ ...formItem.formAnswers![0], required: true, type: 'number', label: q.prompt, formDefinition: q, value: 0 }] }
    const submit = vi.fn().mockRejectedValueOnce(new Error('暂时断线')).mockResolvedValue({ code: 0 })
    const props = { ...sharedProps, state: makeState(current), publicMode, recoveryToken: publicMode ? 'synthetic-recovery-token' : undefined, submitFormSection: submit, submitScale: vi.fn() }
    const first = render(<FinalCompositeAssessment {...props} />)
    expect(await screen.findByRole('spinbutton', { name: q.prompt })).toHaveValue(0)
    await waitFor(() => expect(screen.getByRole('button', { name: '提交整个区段' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '提交整个区段' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    const payload = submit.mock.calls[0][2]
    expect(payload.answers).toEqual([{ formItemId: 'form-item-1', value: 0 }])
    first.unmount()
    render(<FinalCompositeAssessment {...props} />)
    await waitFor(() => expect(screen.getByRole('button', { name: '提交整个区段' })).toBeEnabled())
    expect(screen.getByRole('spinbutton', { name: q.prompt })).toHaveValue(0)
    await userEvent.click(screen.getByRole('button', { name: '提交整个区段' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2))
    expect(submit.mock.calls[1][2]).toEqual(payload)
  })
})


describe('C04 negative and large text draft restoration', () => {
  it.each([
    { type: 'NUMBER' as const, value: -1.25 },
    { type: 'LONG_TEXT' as const, value: '中文长文本\n'.repeat(800) },
  ])('preserves $type across local save, unmount and FINAL', async ({ type, value }) => {
    const q = { itemKey: 'q_typed', type, prompt: '恢复题', required: true, options: [], rows: [], ...(type === 'NUMBER' ? { min: -10, max: 10, precision: 2 } : { maxLength: 10000 }) }
    const current: CompositeCurrentItem = { ...formItem, formAnswers: [{ ...formItem.formAnswers![0], required: true, type: type.toLowerCase(), label: q.prompt, formDefinition: q, value: null }] }
    const submit = vi.fn().mockResolvedValue({ code: 0 })
    const props = { ...sharedProps, state: makeState(current), submitFormSection: submit, submitScale: vi.fn() }
    const first = render(<FinalCompositeAssessment {...props} />)
    const input = await screen.findByLabelText(q.prompt)
    await waitFor(() => expect(input).toBeEnabled())
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(input, { target: { value: String(value) } })
    await waitFor(async () => expect((await finalDraftStore.listAnswers('composite-form-section:composite-attempt-1:composite-form-section-1'))[0].value).toEqual(value))
    first.unmount()
    render(<FinalCompositeAssessment {...props} />)
    await waitFor(() => expect(screen.getByLabelText(q.prompt)).toHaveValue(value))
    await userEvent.click(screen.getByRole('button', { name: '提交整个区段' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    expect(submit.mock.calls[0][2].answers).toEqual([{ formItemId: 'form-item-1', value }])
  })
})

describe('C05 structured FINAL persistence', () => {
  it.each([
    { type: 'LIKERT' as const, value: 'a', patch: {} },
    { type: 'MATRIX' as const, value: { r1: 'b', r2: 'a' }, patch: { rows: [{ rowKey: 'r1', label: '第一行' }, { rowKey: 'r2', label: '第二行' }] } },
    { type: 'MATRIX_MULTIPLE' as const, value: { r1: ['b', 'a'], r2: ['a'] }, patch: { rows: [{ rowKey: 'r1', label: '第一行' }, { rowKey: 'r2', label: '第二行' }] } },
    { type: 'RANK_ORDER' as const, value: ['b', 'a'], patch: {} },
    { type: 'SLIDER' as const, value: 0, patch: { min: -1, max: 1, options: [] } },
    { type: 'CONSTANT_SUM' as const, value: { a: 0, b: 100 }, patch: { total: 100 } },
  ])('restores $type and replays identical sealed typed payload across reload', async ({ type, value, patch }) => {
    const q = { itemKey: 'q_typed', type, prompt: '结构化恢复题', required: true, options: [{ optionKey: 'a', label: '甲' }, { optionKey: 'b', label: '乙' }], rows: [], ...patch }
    const current: CompositeCurrentItem = { ...formItem, formAnswers: [{ ...formItem.formAnswers![0], required: true, type: type.toLowerCase(), label: q.prompt, formDefinition: q, value: value as import('../questionnaire/FormPlayer').FormPlayerValue }] }
    const submit = vi.fn().mockRejectedValueOnce(new Error('暂时断线')).mockResolvedValue({ code: 0 })
    const props = { ...sharedProps, state: makeState(current), publicMode: true, recoveryToken: 'synthetic-recovery-token', submitFormSection: submit, submitScale: vi.fn() }
    const first = render(<FinalCompositeAssessment {...props} />)
    await waitFor(() => expect(screen.getByRole('button', { name: '提交整个区段' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '提交整个区段' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    const payload = submit.mock.calls[0][2]
    expect(payload.answers).toEqual([{ formItemId: 'form-item-1', value }])
    first.unmount()
    render(<FinalCompositeAssessment {...props} />)
    await waitFor(() => expect(screen.getByRole('button', { name: '提交整个区段' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '提交整个区段' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2))
    expect(submit.mock.calls[1][2]).toEqual(payload)
  })
})

describe('C06 visibility and durable answer cleanup',()=>{
 it('saves each ordinary form edit without an empty cleanup transaction', async () => {
  render(<FinalCompositeAssessment {...sharedProps} state={makeState(formItem)} submitFormSection={vi.fn()} submitScale={vi.fn()}/>)
  const input = await screen.findByRole('textbox')
  await waitFor(() => expect(input).toBeEnabled())
  const save = vi.spyOn(finalDraftStore, 'putAnswer')
  const prune = vi.spyOn(finalDraftStore, 'deleteAnswers')
  await userEvent.type(input, 'abc')
  await screen.findByText('已保存到本机。')
  expect(save.mock.calls.map(([answer]) => answer.value)).toEqual(['a', 'ab', 'abc'])
  expect(prune).not.toHaveBeenCalled()
  expect((await finalDraftStore.listAnswers('composite-form-section:composite-attempt-1:composite-form-section-1'))[0].value).toBe('abc')
 })
 it('clears a previously saved hidden answer and seals only visible fields',async()=>{
  const policy={version:3 as const,requiredRefusal:'BLOCK_SUBMIT' as const,hiddenRequired:'EXEMPT' as const}
  const first={...formItem.formAnswers![0],formItemId:'source',type:'single_choice',label:'是否显示',required:true,options:[{value:'yes',label:'显示'},{value:'no',label:'隐藏'}],formPolicy:policy,formDefinition:{itemKey:'q_source',type:'SINGLE' as const,prompt:'是否显示',required:true,options:[{optionKey:'yes',label:'显示'},{optionKey:'no',label:'隐藏'}],rows:[]}}
  const second={...formItem.formAnswers![0],formItemId:'conditional',type:'long_text',label:'条件内容',required:true,formPolicy:policy,formDefinition:{itemKey:'q_conditional',type:'LONG_TEXT' as const,prompt:'条件内容',required:true,options:[],rows:[],displayIf:{itemKey:'q_source',operator:'EQUALS' as const,optionKey:'yes'}}}
  const submit=vi.fn().mockResolvedValue({code:0,data:{}})
  render(<FinalCompositeAssessment {...sharedProps} state={makeState({...formItem,formAnswers:[first,second]})} submitFormSection={submit} submitScale={vi.fn()}/>)
  const user=userEvent.setup();await waitFor(()=>expect(screen.getByRole('radio',{name:'显示'})).toBeEnabled())
  await user.click(screen.getByRole('radio',{name:'显示'}));await user.click(screen.getByRole('button',{name:'下一题'}));await user.type(screen.getByLabelText('条件内容'),'应被清除')
  const prune = vi.spyOn(finalDraftStore, 'deleteAnswers')
  await user.click(screen.getByRole('button',{name:'上一题'}));await user.click(screen.getByRole('radio',{name:'隐藏'}))
  await waitFor(async()=>expect((await finalDraftStore.listAnswers('composite-form-section:composite-attempt-1:composite-form-section-1')).some(a=>a.itemKey==='conditional')).toBe(false))
  expect(prune.mock.calls).toEqual([['composite-form-section:composite-attempt-1:composite-form-section-1', ['conditional']]])
  await user.click(screen.getByRole('button',{name:'提交整个区段'}));await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1))
  expect(submit.mock.calls[0][2].answers).toEqual([{formItemId:'source',value:'no'}])
 })
})


describe('C06 versioned sealed recovery',()=>{
 it.each([false,true])('preserves refusal through offline sealed replay (public=%s)',async publicMode=>{
  const policy={version:3 as const,requiredRefusal:'ALLOW_SUBMIT' as const,hiddenRequired:'EXEMPT' as const}
  const q={itemKey:'q_refusal',type:'SHORT_TEXT' as const,prompt:'拒答恢复',required:true,options:[],rows:[],allowRefusal:true}
  const current:CompositeCurrentItem={...formItem,formAnswers:[{...formItem.formAnswers![0],label:q.prompt,required:true,formDefinition:q,formPolicy:policy,value:{_surveyRefusal:true}}]}
  const submit=vi.fn().mockRejectedValueOnce(new Error('离线')).mockResolvedValue({code:0})
  const props={...sharedProps,state:makeState(current),publicMode,recoveryToken:publicMode?'synthetic-recovery':undefined,submitFormSection:submit,submitScale:vi.fn()}
  const first=render(<FinalCompositeAssessment {...props}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'提交整个区段'})).toBeEnabled());await userEvent.click(screen.getByRole('button',{name:'提交整个区段'}));await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1))
  const payload=submit.mock.calls[0][2];expect(payload.answers).toEqual([{formItemId:'form-item-1',value:{_surveyRefusal:true}}]);first.unmount()
  render(<FinalCompositeAssessment {...props}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'提交整个区段'})).toBeEnabled());await userEvent.click(screen.getByRole('button',{name:'提交整个区段'}));await waitFor(()=>expect(submit).toHaveBeenCalledTimes(2));expect(submit.mock.calls[1][2]).toEqual(payload)
 })
 it('keeps same-frame selection and Other text through offline sealed replay',async()=>{
  const policy={version:3 as const,requiredRefusal:'BLOCK_SUBMIT' as const,hiddenRequired:'EXEMPT' as const}
  const q={itemKey:'q_other',type:'MULTIPLE' as const,prompt:'同帧其他',required:true,options:[{optionKey:'yes',label:'普通'},{optionKey:'other',label:'其他'}],rows:[],otherOptionKey:'other'}
  const current:CompositeCurrentItem={...formItem,formAnswers:[{...formItem.formAnswers![0],type:'multiple_choice',label:q.prompt,required:true,formDefinition:q,formPolicy:policy,options:[{value:'yes',label:'普通'},{value:'other',label:'其他'}]}]}
  const submit=vi.fn().mockRejectedValueOnce(new Error('离线')).mockResolvedValue({code:0});const props={...sharedProps,state:makeState(current),submitFormSection:submit,submitScale:vi.fn()}
  const first=render(<FinalCompositeAssessment {...props}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'提交整个区段'})).toBeEnabled());await userEvent.click(screen.getByRole('button',{name:'同帧选择与文本'}))
  await waitFor(async()=>{const answers=await finalDraftStore.listAnswers('composite-form-section:composite-attempt-1:composite-form-section-1');expect(answers.find(a=>a.itemKey==='form-item-1')?.value).toEqual(['other']);expect(answers.find(a=>a.itemKey==='form-item-1:other')?.value).toBe('同帧文本')})
  await userEvent.click(screen.getByRole('button',{name:'提交整个区段'}));await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1));const payload=submit.mock.calls[0][2];expect(payload.answers).toEqual([{formItemId:'form-item-1',value:['other'],otherText:'同帧文本'}]);first.unmount();render(<FinalCompositeAssessment {...props}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'提交整个区段'})).toBeEnabled());await userEvent.click(screen.getByRole('button',{name:'提交整个区段'}));await waitFor(()=>expect(submit).toHaveBeenCalledTimes(2));expect(submit.mock.calls[1][2]).toEqual(payload)
 })
})


it('clears hidden selected Other and late same-frame text when a source changes',async()=>{
 const policy={version:3 as const,requiredRefusal:'BLOCK_SUBMIT' as const,hiddenRequired:'EXEMPT' as const}
 const source={...formItem.formAnswers![0],formItemId:'source-frame',type:'single_choice',label:'同帧来源',required:true,value:'yes',options:[{value:'yes',label:'显示'},{value:'no',label:'隐藏'}],formPolicy:policy,formDefinition:{itemKey:'q_source_frame',type:'SINGLE' as const,prompt:'同帧来源',required:true,options:[{optionKey:'yes',label:'显示'},{optionKey:'no',label:'隐藏'}],rows:[]}}
 const other={...formItem.formAnswers![0],formItemId:'other-frame',type:'multiple_choice',label:'同帧其他',required:true,options:[{value:'other',label:'其他'}],formPolicy:policy,formDefinition:{itemKey:'q_other_frame',type:'MULTIPLE' as const,prompt:'同帧其他',required:true,options:[{optionKey:'other',label:'其他'}],rows:[],otherOptionKey:'other',displayIf:{itemKey:'q_source_frame',operator:'EQUALS' as const,optionKey:'yes'}}}
 const submit=vi.fn().mockResolvedValue({code:0});render(<FinalCompositeAssessment {...sharedProps} state={makeState({...formItem,formAnswers:[source,other]})} submitFormSection={submit} submitScale={vi.fn()}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'下一题'})).toBeEnabled());await userEvent.click(screen.getByRole('button',{name:'下一题'}));await userEvent.click(screen.getByRole('button',{name:'同帧选择与文本'}))
 await act(async()=>{void frameHandlers.get('source-frame').onChange('no');void frameHandlers.get('other-frame').onOtherTextChange('晚到文本')})
 await waitFor(async()=>{const rows=await finalDraftStore.listAnswers('composite-form-section:composite-attempt-1:composite-form-section-1');expect(rows.some(r=>r.itemKey==='other-frame'||r.itemKey==='other-frame:other')).toBe(false);expect(rows.find(r=>r.itemKey==='source-frame')?.value).toBe('no')})
 await userEvent.click(screen.getByRole('button',{name:'提交整个区段'}));await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1));expect(submit.mock.calls[0][2].answers).toEqual([{formItemId:'source-frame',value:'no'}])
})

it('focuses the first missing anonymous whole-page scale answer without sending a FINAL',async()=>{
 const first=scaleItem.scale!.definition!.items[0]
 const current:CompositeCurrentItem={...scaleItem,presentationMode:'ALL_AT_ONCE',scale:{...scaleItem.scale!,definition:{...scaleItem.scale!.definition!,items:[first,{...first,itemCode:'item-2',content:'第二道必答题',sortOrder:1}]}}}
 const submit=vi.fn()
 render(<FinalCompositeAssessment {...sharedProps} state={makeState(current)} publicMode recoveryToken="synthetic-recovery" submitScale={submit} submitFormSection={vi.fn()}/>);
 await userEvent.click(await screen.findByRole('button',{name:'提交整份量表'}))
 await waitFor(()=>expect(document.getElementById('training-anonymous-required:composite-attempt-1:item-1')).toHaveFocus())
 expect(screen.getByRole('alert')).toHaveTextContent('还有 2 道必答题未作答')
 expect(submit).not.toHaveBeenCalled()
 expect(screen.getByText(/仅可恢复此浏览器中仍有效的本机草稿/)).toBeInTheDocument()
})
it('focuses the missing anonymous form field without changing required validation or submitting',async()=>{
 const current:CompositeCurrentItem={...formItem,formAnswers:[{...formItem.formAnswers![0],required:true}]}
 const submit=vi.fn()
 render(<FinalCompositeAssessment {...sharedProps} state={makeState(current)} publicMode recoveryToken="synthetic-recovery" submitScale={vi.fn()} submitFormSection={submit}/>);
 await userEvent.click(await screen.findByRole('button',{name:'提交整个区段'}))
 await waitFor(()=>expect(document.getElementById('training-anonymous-required:composite-attempt-1:form-item-1')).toHaveFocus())
 expect(screen.getByRole('alert')).toHaveTextContent('还有 1 个必填字段未完成')
 expect(submit).not.toHaveBeenCalled()
})
it('uses a compact Training header and Chinese SJT labels without changing the child action', async () => {
  trainingPresentation.enabled = true
  const item: CompositeCurrentItem = {id:'sjt-item',type:'SITUATIONAL',position:0,required:true}
  const state = {...makeState(item),instruction:'教师提供的测试作答说明',items:[{id:item.id,type:item.type,position:0,label:'SITUATIONAL',completed:false,index:0}]}
  const submitFormSection=vi.fn(),submitScale=vi.fn(),onEnterSituational=vi.fn()
  const view=render(<FinalCompositeAssessment state={state} submitFormSection={submitFormSection} submitScale={submitScale} {...sharedProps} onEnterSituational={onEnterSituational}/>)
  const button=await screen.findByRole('button',{name:'开始/继续情境判断测评'})
  const summary=screen.getByText('作答说明',{selector:'summary'})
  expect(summary.closest('details')).not.toHaveAttribute('open')
  expect(screen.getByText('教师提供的测试作答说明')).not.toBeVisible()
  expect(view.container).not.toHaveTextContent('SITUATIONAL')
  expect(screen.getByText('1. 情境判断')).toBeVisible()
  await userEvent.click(summary)
  expect(screen.getByText('教师提供的测试作答说明')).toBeVisible()
  await userEvent.click(button)
  expect(onEnterSituational).toHaveBeenCalledWith(item)
  expect(submitFormSection).not.toHaveBeenCalled()
  expect(submitScale).not.toHaveBeenCalled()
})


it('keeps the campus privacy appendix in one folded instruction entry without submitting',async()=>{
 const submit=vi.fn()
 render(<FinalCompositeAssessment campusMode state={makeState(formItem)} instructionsSummary="作答说明" instructionsAppendix={<p>校园作答隐私补充说明</p>} submitFormSection={submit} submitScale={vi.fn()} {...sharedProps}/>)
 await screen.findByRole('button',{name:'保存并退出'})
 const summary=screen.getByText('作答说明',{selector:'summary'})
 expect(screen.getAllByText('作答说明',{selector:'summary'})).toHaveLength(1)
 expect(screen.getByText('校园作答隐私补充说明')).not.toBeVisible()
 await userEvent.click(summary)
 expect(screen.getByText('校园作答隐私补充说明')).toBeVisible()
 expect(screen.getByText(/未提交的答案保存在当前浏览器/)).toBeVisible()
 expect(submit).not.toHaveBeenCalled()
})


it('advances a campus form only after durable save and never submits the page automatically',async()=>{
 const submit=vi.fn()
 const fields=['第一题','第二题'].map((label,index)=>({formItemId:'auto-'+index,type:'single_choice',label,required:true,options:[{value:'a',label:'选项 A'}],placeholder:null,contextKey:null,value:null}))
 render(<FinalCompositeAssessment campusMode state={makeState({...formItem,formAnswers:fields})} submitFormSection={submit} submitScale={vi.fn()} {...sharedProps}/>)
 await userEvent.click(await screen.findByRole('radio',{name:'选项 A'}))
 await screen.findByText('第二题')
 expect((await finalDraftStore.listAnswers('composite-form-section:composite-attempt-1:composite-form-section-1')).some(row=>row.itemKey==='auto-0'&&row.value==='a')).toBe(true)
 await userEvent.click(screen.getByRole('radio',{name:'选项 A'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'提交本页'})).toBeEnabled())
 expect(submit).not.toHaveBeenCalled()
})

it('enables campus single-question scale advance while keeping its FINAL manual',async()=>{
 const submit=vi.fn()
 const first=scaleItem.scale!.definition!.items[0]
 const item={...scaleItem,scale:{...scaleItem.scale!,definition:{...scaleItem.scale!.definition!,items:[first,{...first,itemCode:'item-2',content:'综合量表第二题'}]}}}
 render(<FinalCompositeAssessment campusMode state={makeState(item)} submitFormSection={vi.fn()} submitScale={submit} {...sharedProps}/>)
 await userEvent.click(await screen.findByRole('button',{name:'经常'}))
 await screen.findByRole('heading',{name:/综合量表第二题/})
 await userEvent.click(screen.getByRole('button',{name:'经常'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:/提交整份量表/})).toBeEnabled())
 expect(submit).not.toHaveBeenCalled()
})


it('advances to a newly revealed campus form question after the source choice is saved',async()=>{
 const submit=vi.fn()
 const source={formItemId:'source',type:'SINGLE',label:'是否显示后续问题',required:true,options:[{value:'show',label:'显示'}],placeholder:null,contextKey:null,value:null,formDefinition:{itemKey:'source',type:'SINGLE' as const,prompt:'是否显示后续问题',required:true,options:[{optionKey:'show',label:'显示'}],rows:[]}}
 const detail={formItemId:'detail',type:'LONG_TEXT',label:'后续问题',required:false,options:[],placeholder:null,contextKey:null,value:null,formDefinition:{itemKey:'detail',type:'LONG_TEXT' as const,prompt:'后续问题',required:false,options:[],rows:[],displayIf:{itemKey:'source',operator:'EQUALS' as const,optionKey:'show'}}}
 render(<FinalCompositeAssessment campusMode state={makeState({...formItem,formAnswers:[source,detail]})} submitFormSection={submit} submitScale={vi.fn()} {...sharedProps}/>)
 await userEvent.click(await screen.findByRole('radio',{name:'显示'}))
 await screen.findByRole('textbox',{name:'后续问题'})
 expect(submit).not.toHaveBeenCalled()
})


it('uses plain School page wording for submission, progress and required answers',async()=>{
 const submit=vi.fn()
 const fields=[{...formItem.formAnswers![0],required:true},{...formItem.formAnswers![0],formItemId:'optional',label:'补充意见',required:false}]
 const view=render(<FinalCompositeAssessment campusMode state={makeState({...formItem,formAnswers:fields})} submitFormSection={submit} submitScale={vi.fn()} {...sharedProps}/>)
 await userEvent.click(await screen.findByRole('button',{name:'下一题'}))
 await userEvent.click(screen.getByRole('button',{name:'提交本页'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('还有 1 道必答题未完成')
 expect(screen.getByRole('progressbar',{name:'完成进度'})).toBeInTheDocument()
 expect(screen.getByRole('region',{name:'测评内容'})).toBeInTheDocument()
 expect(view.container.textContent).not.toMatch(/区段|字段/)
 expect(submit).not.toHaveBeenCalled()
})

describe('durable acknowledgement before slow progress or feedback reload',()=>{
 it.each(['FORM_SECTION','SCALE'] as const)('shows accepted %s immediately without submitting again while reload waits',async type=>{
  const user=userEvent.setup()
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  const onReload=vi.fn(()=>gate),submit=vi.fn().mockResolvedValue({code:0,data:{completed:true,replayed:false}})
  const item=type==='SCALE'?scaleItem:{...formItem,formAnswers:[],contextSection:false}
  render(<FinalCompositeAssessment {...sharedProps} state={makeState(item)} onReload={onReload} submitScale={submit} submitFormSection={submit}/> )
  try{
   if(type==='SCALE')await user.click(await screen.findByRole('button',{name:'经常'}))
   await user.click(await screen.findByRole('button',{name:type==='SCALE'?'提交整份量表':'确认并继续'}))
   await waitFor(()=>expect(onReload).toHaveBeenCalledTimes(1))
   expect(screen.getByText('服务器已确认当前单元的权威结果。')).toBeVisible()
   expect(screen.queryByText('答案已锁定，正在提交当前单元的同一份 FINAL。')).not.toBeInTheDocument()
   expect(submit).toHaveBeenCalledTimes(1)
  }finally{await act(async()=>release())}
 })
})


describe('frozen scale instruction in the shared unit player',()=>{
 it.each(['training','education','public'] as const)('shows the frozen scale instruction before questions for %s without inventing text',async host=>{
  trainingPresentation.enabled=host==='training'
  const instruction='请根据最近一周的实际感受作答。\n没有对错，请选择最符合自己的选项。'
  const item={...scaleItem,scale:{...scaleItem.scale!,instruction}}
  const props={...sharedProps,submitScale:vi.fn(),submitFormSection:vi.fn(),campusMode:host==='education',publicMode:host==='public'}
  const view=render(<FinalCompositeAssessment {...props} state={makeState(item)}/>)
  const panel=await screen.findByRole('region',{name:'本量表作答说明'})
  expect(panel.textContent).toBe(instruction)
  const question=await screen.findByRole('heading',{name:/综合量表第一题/})
  expect(panel.compareDocumentPosition(question)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  view.rerender(<FinalCompositeAssessment {...props} state={makeState(scaleItem)}/>)
  expect(screen.queryByRole('region',{name:'本量表作答说明'})).not.toBeInTheDocument()
  expect(props.submitScale).not.toHaveBeenCalled()
 })
})
