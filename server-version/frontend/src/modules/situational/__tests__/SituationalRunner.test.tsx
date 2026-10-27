import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import SituationalRunner from '../pages/SituationalRunner'
import { finalDraftStore } from '../../../services/persistence/finalDraftStore'
import { ensureSituationalDraft, situationalDraftKey } from '../draft'
import type { SituationalAttemptResponse } from '../types'
import { embeddedSituationalApi, situationalApi } from '../api'
import { appendResearchEvents, type SituationalResearchEvent } from '../research'
import { situationalHistoryIdentities } from '../history'

const training = vi.hoisted(() => ({ enabled: false }))
vi.mock('../../../training/context', async importOriginal => ({
  ...await importOriginal<typeof import('../../../training/context')>(),
  isTrainingHost: () => training.enabled,
}))
afterEach(() => { training.enabled = false; vi.restoreAllMocks(); vi.unstubAllGlobals() })

vi.mock('../api', () => ({
  situationalApi: {
    start: vi.fn(),
    submit: vi.fn(),
    result: vi.fn(),
    loadAsset: vi.fn(),
  },
  embeddedSituationalApi: vi.fn(),
}))

let embeddedClient: {
  start: ReturnType<typeof vi.fn>
  resume: ReturnType<typeof vi.fn>
  submit: ReturnType<typeof vi.fn>
  result: ReturnType<typeof vi.fn>
}

const startData = (): SituationalAttemptResponse => ({
  attemptId: 'ui-attempt',
  attempt: {
    id: 'ui-attempt', instrumentKey: 'pilot', instrumentVersion: '1.0.0', attemptNo: 1, status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, progress: 0, definitionHash: 'a'.repeat(64), compiledRuntimeHash: 'b'.repeat(64), scorerKey: 'situational.default', scoringVersion: 'pilot-v1', submissionId: null, submissionPayloadHash: null, submittedAt: null, startedAt: '2026-09-08T00:00:00.000Z', completedAt: null, totalTime: null, createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z',
  },
  instrument: {
    key: 'pilot', version: '1.0.0', releaseStatus: 'PUBLISHED', scienceMaturity: 'PILOT', definitionHash: 'a'.repeat(64), compiledRuntimeHash: 'b'.repeat(64), scorerKey: 'situational.default', scoringVersion: 'pilot-v1', frozenAt: '2026-09-08T00:00:00.000Z', sampling: { strategy: 'ALL' },
    definition: { schemaVersion: 1, respondentType: 'participant_self_report', sampling: { strategy: 'ALL' }, scenes: [
      { sceneKey: 'S1', title: '第一场景', sortOrder: 0, stimulus: { type: 'TEXT_V1', text: '第一段文字情境' }, channels: [
        { channelKey: 'choice', responseType: 'SINGLE_CHOICE', prompt: '选择一个行动', options: [{ optionKey: 'A', label: '选择 A' }, { optionKey: 'B', label: '选择 B' }] },
        { channelKey: 'continuous', responseType: 'CONTINUOUS', prompt: '你有多确定？', range: { min: 0, max: 100 } },
      ] },
      { sceneKey: 'S2', title: '第二场景', sortOrder: 1, stimulus: { type: 'TEXT_V1', text: '第二段文字情境' }, channels: [{ channelKey: 'choice', responseType: 'SINGLE_CHOICE', prompt: '选择第二个行动', options: [{ optionKey: 'A', label: '第二个 A' }, { optionKey: 'B', label: '第二个 B' }] }] },
    ] },
    report: { reportVersion: 'v1', primaryMetricKeys: ['metric'], metricOrder: ['metric'], interpretations: [], limitations: [], disclaimer: 'Pilot only' }, referencePolicy: { type: 'none' }, runtimeCapabilities: { standalone: true, embedded: false, aggregateEligible: false, collectionFacts: false, supported: true },
  },
})

const completedData = (source = startData()): SituationalAttemptResponse => ({
  ...source,
  attempt: { ...source.attempt, status: 'COMPLETED' },
})

const visualStartData = (): SituationalAttemptResponse => {
  const source = startData()
  source.instrument.definition.scenes[0]!.stimulus = {
    type: 'IMAGE',
    asset: { assetId: 'ui-image', contentHash: 'a'.repeat(64), mimeType: 'image/png' },
    altText: '界面中的静态图片',
  }
  source.instrument.definition.scenes[1]!.stimulus = {
    type: 'COMIC',
    panels: [
      { assetRef: { assetId: 'ui-panel-1', contentHash: 'b'.repeat(64), mimeType: 'image/webp' }, altText: '漫画第一格' },
      { assetRef: { assetId: 'ui-panel-2', contentHash: 'c'.repeat(64), mimeType: 'image/webp' }, altText: '漫画第二格' },
    ],
  }
  return source
}

const scaledStartData = (sceneCount: number): SituationalAttemptResponse => {
  const source = startData()
  const template = source.instrument.definition.scenes[1] ?? source.instrument.definition.scenes[0]
  if (!template) return source
  return {
    ...source,
    instrument: {
      ...source.instrument,
      definition: {
        ...source.instrument.definition,
        scenes: Array.from({ length: sceneCount }, (_, index) => ({
          ...template,
          sceneKey: `S${index + 1}`,
          title: `第 ${index + 1} 场景`,
          sortOrder: index,
          stimulus: { ...template.stimulus, text: `第 ${index + 1} 段文字情境` },
        })),
      },
    },
  }
}

const renderRunner = () => render(
  <MemoryRouter initialEntries={['/student/situational/pilot']}>
    <Routes>
      <Route path="/student/situational/:instrumentKey" element={<SituationalRunner />} />
      <Route path="/student/situational/attempts/:attemptId/result" element={<div data-testid="situational-result-page">RESULT</div>} />
    </Routes>
  </MemoryRouter>,
)

const renderEmbeddedRunner = () => render(
  <MemoryRouter initialEntries={['/student/composite/situational/ui-child?compositeAttemptId=parent-1&compositeItemId=item-1&returnTo=%2Fstudent%2Fcomposite%2Fattempts%2Fparent-1']}>
    <Routes>
      <Route path="/student/composite/situational/:attemptId" element={<SituationalRunner />} />
      <Route path="/student/composite/attempts/:attemptId" element={<div data-testid="composite-parent-page">PARENT</div>} />
    </Routes>
  </MemoryRouter>
)

const answerDefaultRunner = async () => {
  fireEvent.click(screen.getByLabelText('选择 A'))
  await waitFor(() => expect(screen.getByLabelText('选择 A')).toBeChecked())
  const slider = screen.getByRole('slider')
  fireEvent.change(slider, { target: { value: '100' } })
  await waitFor(() => expect(slider).toHaveValue('100'))
  await waitFor(() => expect(screen.getByRole('button', { name: /下一题/ })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: /下一题/ }))
  expect(await screen.findByText('第二段文字情境')).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('第二个 A'))
  await waitFor(() => expect(screen.getByLabelText('第二个 A')).toBeChecked())
}

describe('Situational text runner', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    // These transport fixtures contain synthetic bytes; decoder behavior has its own hook contracts.
    vi.stubGlobal('Image', class { src = ''; decode = () => Promise.resolve() })
    embeddedClient = { start: vi.fn(), resume: vi.fn(), submit: vi.fn(), result: vi.fn() }
    vi.mocked(embeddedSituationalApi).mockReturnValue(embeddedClient as never)
    await finalDraftStore.delete('situational:ui-attempt')
    await finalDraftStore.delete('situational:ui-child')
    vi.mocked(situationalApi.start).mockResolvedValue({ code: 0, message: 'ok', data: startData() })
    vi.mocked(situationalApi.submit).mockResolvedValue({ code: 0, message: 'ok', data: completedData() })
    vi.mocked(situationalApi.result).mockResolvedValue({ code: 0, message: 'ok', data: completedData() })
    vi.mocked(situationalApi.loadAsset).mockResolvedValue(new Blob(['static visual fixture'], { type: 'image/png' }))
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', { value: vi.fn((blob: Blob) => `blob:${blob.type}`), configurable: true })
    if (!URL.revokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    const embeddedData = startData()
    embeddedData.attemptId = 'ui-child'
    embeddedData.attempt = { ...embeddedData.attempt, id: 'ui-child' }
    embeddedClient.resume.mockResolvedValue({ code: 0, message: 'ok', data: embeddedData })
    embeddedClient.submit.mockResolvedValue({ code: 0, message: 'ok', data: completedData(embeddedData) })
    embeddedClient.result.mockResolvedValue({ code: 0, message: 'ok', data: completedData(embeddedData) })
  })

  it('does not redirect after leaving while a completed start response is pending', async () => {
    let resolveStart!: (value: Awaited<ReturnType<typeof situationalApi.start>>) => void
    const pending = new Promise<Awaited<ReturnType<typeof situationalApi.start>>>(resolve => { resolveStart = resolve })
    vi.mocked(situationalApi.start).mockReturnValueOnce(pending)
    render(<MemoryRouter initialEntries={['/student/situational/pilot']}>
      <Link to="/student/courses/course-1">Leave task</Link>
      <Routes>
        <Route path="/student/situational/:instrumentKey" element={<SituationalRunner />} />
        <Route path="/student/courses/:courseId" element={<p>Current course</p>} />
        <Route path="/student/situational/attempts/:attemptId/result" element={<p>Stale result</p>} />
      </Routes>
    </MemoryRouter>)
    fireEvent.click(screen.getByRole('link', { name: 'Leave task' }))
    const deleteDraft = vi.spyOn(finalDraftStore, 'delete')
    await act(async () => { resolveStart({ code: 0, message: 'ok', data: completedData() }); await pending })
    expect(deleteDraft).not.toHaveBeenCalled()
    expect(screen.getByText('Current course')).toBeInTheDocument()
    expect(screen.queryByText('Stale result')).toBeNull()
  })

  it('hides the previous task while a same-component route change is loading', async () => {
    let resolveNext!: (value: Awaited<ReturnType<typeof situationalApi.start>>) => void
    const pending = new Promise<Awaited<ReturnType<typeof situationalApi.start>>>(resolve => { resolveNext = resolve })
    vi.mocked(situationalApi.start).mockResolvedValueOnce({ code: 0, message: 'ok', data: startData() }).mockReturnValueOnce(pending)
    render(<MemoryRouter initialEntries={['/student/situational/pilot']}>
      <Link to="/student/situational/next">Next task</Link>
      <Routes><Route path="/student/situational/:instrumentKey" element={<SituationalRunner />} /></Routes>
    </MemoryRouter>)
    expect(await screen.findByLabelText('选择 A')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Next task' }))
    expect(screen.getByText('加载冻结题面…')).toBeInTheDocument()
    expect(screen.queryByLabelText('选择 A')).toBeNull()
    const next = startData()
    next.attempt.id = 'ui-child'
    next.attemptId = 'ui-child'
    next.instrument.definition.scenes[0]!.stimulus = { type: 'TEXT_V1', text: '新任务题面' }
    await act(async () => { resolveNext({ code: 0, message: 'ok', data: next }); await pending })
    expect(await screen.findByText('新任务题面')).toBeInTheDocument()
  })

  it('does not apply deferred local research recovery to a newer route attempt', async () => {
    const old = stagedStartData()
    const next = stagedStartData()
    next.attempt.id = 'ui-child'
    next.attemptId = 'ui-child'
    next.instrument.definition.scenes[0]!.stimulus = { type: 'TEXT_V1', text: '新研究任务' }
    let resolveTrials!: (value: Awaited<ReturnType<typeof finalDraftStore.listTrials>>) => void
    const pending = new Promise<Awaited<ReturnType<typeof finalDraftStore.listTrials>>>(resolve => { resolveTrials = resolve })
    const readTrials = finalDraftStore.listTrials.bind(finalDraftStore)
    const trials = vi.spyOn(finalDraftStore, 'listTrials').mockImplementation(key => key === 'situational:ui-attempt' ? pending : readTrials(key))
    vi.mocked(situationalApi.start).mockResolvedValueOnce({ code: 0, message: 'ok', data: old }).mockResolvedValueOnce({ code: 0, message: 'ok', data: next })
    render(<MemoryRouter initialEntries={['/student/situational/pilot']}>
      <Link to="/student/situational/next">Next task</Link>
      <Routes><Route path="/student/situational/:instrumentKey" element={<SituationalRunner />} /></Routes>
    </MemoryRouter>)
    await waitFor(() => expect(trials).toHaveBeenCalledWith('situational:ui-attempt'))
    fireEvent.click(screen.getByRole('link', { name: 'Next task' }))
    expect(await screen.findByText('新研究任务')).toBeInTheDocument()
    expect(screen.queryByText('你有多确定？')).toBeNull()
    await waitFor(async () => {
      const currentTrials = await readTrials('situational:ui-child')
      expect(currentTrials.some(trial => {
        const payload = trial.payload as { events?: SituationalResearchEvent[] }
        return payload.events?.some(event => event.type === 'NODE_EXPOSED')
      })).toBe(true)
    })
    await act(async () => {
      resolveTrials([{ draftKey: 'situational:ui-attempt', trialIndex: 0, createdAt: Date.now(), payload: { type: 'STAGE_CONFIRMED', nodeKey: 'node', stageKey: 'choice', historyIdentity: situationalHistoryIdentities(next.instrument.definition, {})['S1']!, relativeTimeMs: 1 } }])
      await pending
    })
    expect(screen.getByText('新研究任务')).toBeInTheDocument()
    expect(screen.queryByText('你有多确定？')).toBeNull()
    expect(screen.getByLabelText('选择 A')).toBeInTheDocument()
  })

  it('renders text, supports choice/continuous boundaries, fixed scene progress, navigation, and one final request', async () => {
    renderRunner()
    expect(await screen.findByText('第一段文字情境')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '第一场景' })).toBeInTheDocument()
    expect(screen.getByText('第 1 / 2')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(() => expect(screen.getByLabelText('选择 A')).toBeChecked())
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '100')
    fireEvent.change(slider, { target: { value: '1' } })
    await waitFor(() => expect(slider).toHaveValue('1'))
    fireEvent.change(slider, { target: { value: '0' } })
    await waitFor(() => expect(slider).toHaveValue('0'))
    expect(screen.getByText('第 1 / 2')).toBeInTheDocument()
    fireEvent.change(slider, { target: { value: '100' } })
    await waitFor(() => expect(slider).toHaveValue('100'))
    await waitFor(() => expect(screen.getByRole('button', { name: /下一题/ })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: /下一题/ }))
    expect(await screen.findByText('第二段文字情境')).toBeInTheDocument()
    expect(screen.getByText('第 2 / 2')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('第二个 A'))
    await waitFor(() => expect(screen.getByLabelText('第二个 A')).toBeChecked())
    fireEvent.click(screen.getByRole('button', { name: /提交测评/ }))
    await waitFor(() => expect(situationalApi.submit).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(situationalApi.submit).mock.calls[0]?.[1]
    expect(payload.responses).toHaveLength(3)
    expect(payload.responses.some((response) => response.responseValue === 100)).toBe(true)
    expect(JSON.stringify(payload)).not.toMatch(/score|contribution|percentile|quality/i)
  })

  it('serializes rapid local edits and submits the newest slider value', async () => {
    renderRunner()
    expect(await screen.findByText('第一段文字情境')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('选择 A'))
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '1' } })
    fireEvent.change(slider, { target: { value: '40' } })
    fireEvent.change(slider, { target: { value: '100' } })

    await waitFor(() => expect(slider).toHaveValue('100'))
    await waitFor(() => expect(screen.getByRole('button', { name: /下一题/ })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: /下一题/ }))
    fireEvent.click(await screen.findByLabelText('第二个 A'))
    await waitFor(() => expect(screen.getByLabelText('第二个 A')).toBeChecked())
    fireEvent.click(screen.getByRole('button', { name: /提交测评/ }))

    await waitFor(() => expect(situationalApi.submit).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(situationalApi.submit).mock.calls[0]?.[1]
    expect(payload.responses.find((response) => response.channelKey === 'continuous')?.responseValue).toBe(100)
  })

  it('renders IMAGE and ordered COMIC panels through the same runner', async () => {
    const visual = visualStartData()
    vi.mocked(situationalApi.start).mockResolvedValue({ code: 0, message: 'ok', data: visual })
    renderRunner()

    expect(await screen.findByAltText('界面中的静态图片')).toBeInTheDocument()
    expect(vi.mocked(situationalApi.loadAsset)).toHaveBeenCalledWith('ui-attempt', 'ui-image')
    fireEvent.click(screen.getByRole('button', { name: '情境 2，未作答' }))

    expect(await screen.findByAltText('漫画第一格')).toBeInTheDocument()
    const panels = screen.getAllByRole('img')
    expect(panels.map((panel) => panel.getAttribute('alt'))).toEqual(['漫画第一格', '漫画第二格'])
    expect(vi.mocked(situationalApi.loadAsset)).toHaveBeenCalledWith('ui-attempt', 'ui-panel-1')
    expect(vi.mocked(situationalApi.loadAsset)).toHaveBeenCalledWith('ui-attempt', 'ui-panel-2')
  })

  it('blocks the current scene while a visual asset fails and allows an explicit retry', async () => {
    const visual = visualStartData()
    vi.mocked(situationalApi.start).mockResolvedValue({ code: 0, message: 'ok', data: visual })
    vi.mocked(situationalApi.loadAsset)
      .mockRejectedValueOnce(new Error('asset unavailable'))
      .mockResolvedValue(new Blob(['retried visual fixture'], { type: 'image/png' }))
    renderRunner()

    expect(await screen.findByRole('alert')).toHaveTextContent('视觉内容加载失败')
    expect(screen.getByRole('button', { name: /提交测评/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByAltText('界面中的静态图片')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /提交测评/ })).not.toBeDisabled()
  })

  it('records staged exposure only after successful image decode, never on HTTP-success corrupt bytes',async()=>{
    const visual=stagedStartData()
    visual.instrument.definition.scenes[0]!.stimulus={type:'IMAGE',
      asset:{assetId:'staged-image',contentHash:'a'.repeat(64),mimeType:'image/png'},altText:'Decoded staged panel'}
    let rejectDecode!:(error:Error)=>void
    const pending=new Promise<void>((_resolve,reject)=>{rejectDecode=reject})
    const decode=vi.fn().mockReturnValueOnce(pending).mockResolvedValue(undefined)
    vi.stubGlobal('Image',class{src='';decode=decode})
    vi.mocked(situationalApi.start).mockResolvedValue({code:0,message:'ok',data:visual})
    vi.mocked(situationalApi.loadAsset).mockResolvedValue(new Blob(['HTTP 200 but undecodable'],{type:'image/png'}))
    const exposed=async()=> (await finalDraftStore.listTrials('situational:ui-attempt')).flatMap(trial=>
      (trial.payload as {events?:SituationalResearchEvent[]}).events??[]).filter(event=>event.type==='NODE_EXPOSED')
    renderRunner()
    await waitFor(()=>expect(decode).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('选择 A')).toBeDisabled()
    expect(await exposed()).toEqual([])
    await act(async()=>{rejectDecode(new Error('Corrupt image'));await pending.catch(()=>{})})
    expect(await screen.findByRole('alert')).toHaveTextContent('视觉内容加载失败')
    expect(screen.getByLabelText('选择 A')).toBeDisabled()
    expect(await exposed()).toEqual([])
    fireEvent.click(screen.getByRole('button',{name:'重试'}))
    await waitFor(()=>expect(screen.getByLabelText('选择 A')).toBeEnabled())
    await waitFor(async()=>expect(await exposed()).toHaveLength(1))
    expect(decode).toHaveBeenCalledTimes(2)
    expect(situationalApi.submit).not.toHaveBeenCalled()
  })

  it('blocks an incomplete final request and moves to the first missing scene', async () => {
    renderRunner()
    expect(await screen.findByText('第一段文字情境')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(() => expect(screen.getByLabelText('选择 A')).toBeChecked())
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '1' } })
    await waitFor(() => expect(slider).toHaveValue('1'))
    fireEvent.change(slider, { target: { value: '0' } })
    await waitFor(() => expect(slider).toHaveValue('0'))
    await waitFor(() => expect(screen.getByRole('button', { name: /下一题/ })).not.toBeDisabled())

    fireEvent.click(screen.getByRole('button', { name: /提交测评/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('还有必答通道未完成')
    expect(screen.getByText('第二段文字情境')).toBeInTheDocument()
    expect(situationalApi.submit).not.toHaveBeenCalled()
  })

  it('restores a partial raw draft after the runner is remounted', async () => {
    const first = renderRunner()
    expect(await screen.findByText('第一段文字情境')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(() => expect(screen.getByLabelText('选择 A')).toBeChecked())
    first.unmount()

    renderRunner()

    const restored = await screen.findByLabelText('选择 A')
    expect(restored).toBeChecked()
    expect(screen.getByText('第 1 / 2')).toBeInTheDocument()
    expect(screen.getByText('已恢复本机进度')).toBeInTheDocument()
    expect(situationalApi.start).toHaveBeenCalledTimes(2)
  })

  it('emits only one logical final request on duplicate submit clicks', async () => {
    vi.mocked(situationalApi.submit).mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({ code: 0, message: 'ok', data: completedData() }), 50)
    }))
    renderRunner()
    expect(await screen.findByText('第一段文字情境')).toBeInTheDocument()
    await answerDefaultRunner()

    const submit = screen.getByRole('button', { name: /提交测评/ })
    fireEvent.click(submit)
    fireEvent.click(submit)

    await waitFor(() => expect(situationalApi.submit).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('situational-result-page')).toBeInTheDocument()
  })

  it('recovers the authoritative completed result after an ambiguous submit error', async () => {
    vi.mocked(situationalApi.submit).mockRejectedValueOnce(new Error('network timeout'))
    vi.mocked(situationalApi.result).mockResolvedValueOnce({ code: 0, message: 'ok', data: completedData() })
    renderRunner()
    expect(await screen.findByText('第一段文字情境')).toBeInTheDocument()
    await answerDefaultRunner()

    fireEvent.click(screen.getByRole('button', { name: /提交测评/ }))

    await waitFor(() => expect(situationalApi.submit).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(situationalApi.result).toHaveBeenCalledWith('ui-attempt'))
    expect(await screen.findByTestId('situational-result-page')).toBeInTheDocument()
  })

  it('uses the pre-created embedded child and returns to the composite parent after FINAL', async () => {
    renderEmbeddedRunner()
    expect(await screen.findByText('第一段文字情境')).toBeInTheDocument()
    await answerDefaultRunner()

    fireEvent.click(screen.getByRole('button', { name: /提交测评/ }))

    await waitFor(() => expect(embeddedClient.submit).toHaveBeenCalledTimes(1))
    expect(embeddedClient.start).not.toHaveBeenCalled()
    expect(embeddedClient.submit).toHaveBeenCalledWith('ui-child', expect.objectContaining({
      responses: expect.any(Array),
    }))
    expect(await screen.findByTestId('composite-parent-page')).toBeInTheDocument()
  })

  it.each([10, 30, 60])('renders and navigates %i scenes with one final request and no start fan-out', async (sceneCount) => {
    const data = scaledStartData(sceneCount)
    vi.mocked(situationalApi.start).mockResolvedValue({ code: 0, message: 'ok', data })
    await ensureSituationalDraft(data.attempt)
    const draftKey = situationalDraftKey(data.attempt.id)
    await Promise.all(data.instrument.definition.scenes.map((scene) => finalDraftStore.putAnswer({
      draftKey,
      itemKey: `${scene.sceneKey}:choice`,
      value: { responseValue: 'A' },
      updatedAt: Date.now(),
    })))

    renderRunner()
    expect(await screen.findByText('第 1 段文字情境')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `情境 ${sceneCount}，已作答` })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `情境 ${sceneCount}，已作答` }))
    expect(await screen.findByText(`第 ${sceneCount} 段文字情境`)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /提交测评/ }))
    await waitFor(() => expect(situationalApi.submit).toHaveBeenCalledTimes(1))
    expect(situationalApi.start).toHaveBeenCalledTimes(1)
    expect(vi.mocked(situationalApi.submit).mock.calls[0]?.[1].responses).toHaveLength(sceneCount)
  }, 10_000)
})

const stagedStartData = (): SituationalAttemptResponse => {
  const source = startData()
  source.instrument.definition = {
    schemaVersion: 2, respondentType: 'synthetic', sampling: { strategy: 'BRANCH_REACHABLE' }, scenes: [source.instrument.definition.scenes[0]!],
    flow: { strategy: 'BRANCHING_DAG_V1', entryNodeKey: 'node', nodes: [
    { nodeType: 'SCENE', nodeKey: 'node', sceneKey: 'S1', motherSceneKey: 'M', roundKey: 'R', stepKey: 'S', responseStages: [{ stageKey: 'choice', kind: 'CHOICE', channelKeys: ['choice'] }, { stageKey: 'probe', kind: 'POST_CHOICE_PROBE', channelKeys: ['continuous'] }], transition: { type: 'NEXT', nextNodeKey: 'terminal' } },
    { nodeType: 'TERMINAL', nodeKey: 'terminal' },
    ] },
  }
  source.instrument.assignment = { assignmentVersion: 'all-administered-v1', assignmentIdentity: 'c'.repeat(64), seedIdentity: 'd'.repeat(64), selections: [] }
  return source
}

describe('Situational staged scientific presentation', () => {
  it('hides probe prompts before choice confirmation, locks the choice and submits one bounded capture', async () => {
    await finalDraftStore.delete('situational:ui-attempt')
    const source = stagedStartData()
    vi.mocked(situationalApi.start).mockResolvedValue({ code: 0, message: 'ok', data: source })
    vi.mocked(situationalApi.submit).mockResolvedValue({ code: 0, message: 'ok', data: completedData(source) })
    vi.mocked(situationalApi.submit).mockClear()
    renderRunner()
    expect(await screen.findByText('第一段文字情境')).toBeInTheDocument()
    expect(screen.queryByText('你有多确定？')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(() => expect(screen.getByLabelText('选择 A')).toBeChecked())
    fireEvent.click(screen.getByRole('button', { name: '确认行动选择' }))
    expect(await screen.findByRole('slider')).toBeInTheDocument()
    expect(screen.getByLabelText('选择 B')).toBeDisabled()
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '80' } })
    fireEvent.change(slider, { target: { value: '90' } })
    fireEvent.blur(slider)
    await waitFor(() => expect(screen.getByText('90')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '确认本阶段作答' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '确认本阶段作答' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '提交测评' }))
    await waitFor(() => expect(situationalApi.submit).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(situationalApi.submit).mock.calls[0]![1]
    expect(payload.responses).toHaveLength(2)
    expect(payload.researchCapture!.events.filter(e => e.channelKey === 'continuous' && e.type === 'RESPONSE_FIRST_COMMITTED')).toHaveLength(1)
    expect(payload.researchCapture!.events.some(e => e.type === 'PROBE_EXPOSED')).toBe(true)
  })
})


describe('Situational journal failure recovery', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubGlobal('Image',class {src='';decode=()=>Promise.resolve()})
    await finalDraftStore.delete('situational:ui-attempt')
    const source = stagedStartData()
    vi.mocked(situationalApi.start).mockResolvedValue({ code: 0, message: 'ok', data: source })
    vi.mocked(situationalApi.submit).mockResolvedValue({ code: 0, message: 'ok', data: completedData(source) })
    vi.mocked(situationalApi.result).mockRejectedValue(new Error('not completed'))
  })

  it('waits for the durable choice journal before checking or allowing the next stage', async () => {
    renderRunner()
    await screen.findByLabelText('选择 A')
    const putTrial = finalDraftStore.putTrial.bind(finalDraftStore)
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    let started = false
    vi.spyOn(finalDraftStore, 'putTrial').mockImplementation(async row => {
      const batch = row.payload as { events?: SituationalResearchEvent[] }
      if (batch.events?.some(event => event.type === 'RESPONSE_FIRST_COMMITTED')) {
        started = true
        await pending
      }
      return putTrial(row)
    })
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(() => expect(started).toBe(true))
    expect(screen.getByLabelText('选择 A')).not.toBeChecked()
    expect(screen.getByRole('button', { name: '确认行动选择' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '提交测评' })).toBeDisabled()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    await act(async () => { release(); await pending })
    await waitFor(() => expect(screen.getByLabelText('选择 A')).toBeChecked())
    await waitFor(() => expect(screen.getByRole('button', { name: '确认行动选择' })).toBeEnabled())
    const events = (await finalDraftStore.listTrials('situational:ui-attempt')).flatMap(row =>
      (row.payload as { events: SituationalResearchEvent[] }).events)
    expect(events.filter(event => event.type === 'RESPONSE_FIRST_COMMITTED')).toMatchObject([
      { channelKey: 'choice', responseValue: 'A', responseRevision: 1 },
    ])
    fireEvent.click(screen.getByRole('button', { name: '确认行动选择' }))
    expect(await screen.findByRole('slider')).toBeInTheDocument()
  })

  it('keeps the next edit revision consistent after the journal succeeds but the answer cache fails', async () => {
    renderRunner()
    await screen.findByLabelText('选择 A')
    vi.spyOn(finalDraftStore, 'putAnswer').mockRejectedValueOnce(new Error('synthetic cache failure'))
    fireEvent.click(screen.getByLabelText('选择 A'))
    await screen.findAllByText('synthetic cache failure')
    fireEvent.click(screen.getByLabelText('选择 B'))
    await waitFor(() => expect(screen.getByLabelText('选择 B')).toBeChecked())
    const events = (await finalDraftStore.listTrials('situational:ui-attempt')).flatMap(t => {
      const payload = t.payload as { events?: SituationalResearchEvent[] }
      return payload.events ?? [t.payload as SituationalResearchEvent]
    }).filter(e => e.channelKey === 'choice')
    expect(events.map(e => [e.type, e.responseRevision])).toEqual([['RESPONSE_FIRST_COMMITTED', 1], ['RESPONSE_CHANGED', 2]])
  })

  it('keeps a durably confirmed stage locked when its answer-cache write fails', async () => {
    renderRunner()
    await screen.findByLabelText('选择 A')
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(() => expect(screen.getByLabelText('选择 A')).toBeChecked())
    vi.spyOn(finalDraftStore, 'putAnswer').mockRejectedValueOnce(new Error('synthetic confirmation cache failure'))
    fireEvent.click(screen.getByRole('button', { name: '确认行动选择' }))
    expect(await screen.findByRole('slider')).toBeInTheDocument()
    expect(screen.getByLabelText('选择 B')).toBeDisabled()
  })

  it('seals recovered journal answers even if the answer cache was never written', async () => {
    const source = stagedStartData()
    if (source.instrument.definition.schemaVersion !== 2) throw new Error('fixture')
    source.instrument.definition.scenes[0]!.channels = [source.instrument.definition.scenes[0]!.channels[0]!]
    const node = source.instrument.definition.flow.nodes[0]!
    if (node.nodeType !== 'SCENE') throw new Error('fixture')
    delete node.responseStages
    await ensureSituationalDraft(source.attempt)
    const historyIdentity = situationalHistoryIdentities(source.instrument.definition, {})['S1']!
    await appendResearchEvents(source, [], [
      { type: 'NODE_EXPOSED', nodeKey: 'node', historyIdentity, relativeTimeMs: 0 },
      { type: 'RESPONSE_FIRST_COMMITTED', nodeKey: 'node', channelKey: 'choice', responseValue: 'A', responseRevision: 1, historyIdentity, relativeTimeMs: 1 },
    ])
    vi.mocked(situationalApi.start).mockResolvedValue({ code: 0, message: 'ok', data: source })
    renderRunner()
    await waitFor(() => expect(screen.getByLabelText('选择 A')).toBeChecked())
    fireEvent.click(screen.getByRole('button', { name: '提交测评' }))
    await waitFor(() => expect(situationalApi.submit).toHaveBeenCalledTimes(1))
    expect(vi.mocked(situationalApi.submit).mock.calls[0]![1].responses).toEqual([expect.objectContaining({ responseValue: 'A', responseRevision: 1 })])
  })

  it('persists a logical multi-event operation wholly or not at all', async () => {
    const source = stagedStartData()
    await ensureSituationalDraft(source.attempt)
    const events: SituationalResearchEvent[] = [
      { type: 'STAGE_CONFIRMED', nodeKey: 'node', stageKey: 'probe', historyIdentity: 'a'.repeat(64), relativeTimeMs: 0 },
      { type: 'NODE_CONFIRMED', nodeKey: 'node', historyIdentity: 'a'.repeat(64), relativeTimeMs: 0 },
    ]
    const original = finalDraftStore.putTrial.bind(finalDraftStore)
    let writes = 0
    vi.spyOn(finalDraftStore, 'putTrial').mockImplementation(async trial => {
      if (++writes === 2) throw new Error('synthetic second write failure')
      await original(trial)
    })
    const outcome = await appendResearchEvents(source, [], events).then(() => 'saved', () => 'failed')
    const trials = await finalDraftStore.listTrials('situational:ui-attempt')
    const saved = trials.flatMap(t => (t.payload as { events?: SituationalResearchEvent[] }).events ?? [t.payload])
    expect(saved).toHaveLength(outcome === 'saved' ? 2 : 0)
  })
  it('online frozen image uses the attempt proxy and blocks answers until the image is ready', async () => {
    const source=startData()
    source.instrument.online={responseProtocol:'sjt-online-response-v1',compilerVersion:'sjt-online-static-image-v1',definitionHash:source.attempt.definitionHash,displayHash:'display',display:{title:'Online',respondentType:'teacher_self_report',scenes:[{sceneKey:'mother',title:'图片情境',stimulus:'冻结的图文材料',image:{asset:{assetId:'online-image',contentHash:'a'.repeat(64),mimeType:'image/png'},altText:'冻结图片替代文字',caption:'冻结说明'},questions:[{questionKey:'q',prompt:'图片选择',responseType:'SINGLE',required:true,allowRefusal:false,options:[{optionKey:'a',label:'图文选项甲'},{optionKey:'b',label:'图文选项乙'}]}]}]}}
    let resolveImage!: (blob: Blob) => void
    vi.mocked(situationalApi.loadAsset).mockImplementation(() => new Promise(resolve => { resolveImage = resolve }))
    vi.mocked(situationalApi.start).mockResolvedValue({code:0,message:'ok',data:source})
    renderRunner()
    expect(await screen.findByText('冻结的图文材料')).toBeInTheDocument()
    expect(screen.getByLabelText('图文选项甲')).toBeDisabled()
    expect(situationalApi.loadAsset).toHaveBeenCalledWith('ui-attempt','online-image')
    resolveImage(new Blob(['image'],{type:'image/png'}))
    expect(await screen.findByRole('img',{name:'冻结图片替代文字'})).toBeInTheDocument()
    await waitFor(()=>expect(screen.getByLabelText('图文选项甲')).toBeEnabled())
    expect(screen.getByText('冻结说明')).toBeInTheDocument()
  })
  it('online frozen display renders real multiple choices and seals raw arrays', async () => {
    const source=startData()
    source.instrument.online={responseProtocol:'sjt-online-response-v1',compilerVersion:'test',definitionHash:source.attempt.definitionHash,displayHash:'display',display:{title:'Online',respondentType:'teacher_self_report',scenes:[{sceneKey:'mother',title:'在线情境',stimulus:'冻结的文字材料',questions:[{questionKey:'q',prompt:'原始多选题',responseType:'MULTIPLE',required:true,allowRefusal:true,minSelections:2,maxSelections:2,options:[{optionKey:'a',label:'原始选项甲'},{optionKey:'b',label:'原始选项乙'}]}]}]}}
    vi.mocked(situationalApi.start).mockResolvedValue({code:0,message:'ok',data:source})
    renderRunner()
    expect(await screen.findByText('冻结的文字材料')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    fireEvent.click(screen.getByLabelText('原始选项甲'))
    await waitFor(()=>expect(screen.getByLabelText('原始选项甲')).toBeChecked())
    fireEvent.click(screen.getByRole('button',{name:/提交测评/}))
    expect(situationalApi.submit).not.toHaveBeenCalled()
    expect(await screen.findByText('还有必答通道未完成，请补充后再提交。')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('原始选项乙'))
    await waitFor(()=>expect(screen.getByRole('button',{name:/提交测评/})).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button',{name:/提交测评/}))
    await waitFor(()=>expect(situationalApi.submit).toHaveBeenCalledTimes(1))
    expect(vi.mocked(situationalApi.submit).mock.calls[0]![1]).toMatchObject({responseProtocol:'sjt-online-response-v1',responses:[{sceneKey:'sjt_q_q',channelKey:'q',status:'ANSWERED',responseValue:['a','b']}]})
  })

})


describe('Training SJT page confirmation and choice focus', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    training.enabled = true
    await finalDraftStore.delete('situational:ui-attempt')
    vi.mocked(situationalApi.start).mockResolvedValue({ code: 0, message: 'ok', data: startData() })
  })

  it('does not mistake optional readiness for an answer and distinguishes clearing, blank and refusal', async () => {
    const data=startData()
    const first=data.instrument.definition.scenes[0]!
    first.channels=[{...first.channels[0]!,responseType:'MULTIPLE_CHOICE',required:false,online:true,allowRefusal:true,minSelections:1,maxSelections:2}]
    vi.mocked(situationalApi.start).mockResolvedValue({code:0,message:'ok',data})
    renderRunner()
    await screen.findByText('第一段文字情境')
    const next=screen.getByRole('button',{name:/确认本页/})
    expect(screen.getByRole('button',{name:'情境 1，未作答'})).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'情境 2，未作答'})).toBeDisabled()
    expect(next).not.toBeDisabled()
    expect(screen.queryByText('已完成')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(()=>expect(screen.getByRole('button',{name:'情境 1，已作答'})).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(()=>expect(screen.getByRole('button',{name:'情境 1，未作答'})).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('此题留空'))
    await waitFor(()=>expect(screen.getByRole('button',{name:'情境 1，已留空'})).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('明确选择不回答'))
    await waitFor(()=>expect(screen.getByRole('button',{name:'情境 1，已选择不回答'})).toBeInTheDocument())
    await waitFor(()=>expect(next).not.toBeDisabled())
    expect(situationalApi.submit).not.toHaveBeenCalled()
    expect(screen.getByText('第一段文字情境')).toBeInTheDocument()
    const saved=await finalDraftStore.listAnswers('situational:ui-attempt')
    expect(saved.find(row=>row.itemKey==='S1:choice')?.value).toMatchObject({status:'REFUSED'})
  })

  it('focuses the next question only after saving, and never changes scene automatically', async () => {
    renderRunner()
    await screen.findByText('第一段文字情境')
    expect(screen.getByText('作答说明', {selector:'summary'}).closest('details')).not.toHaveAttribute('open')
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(() => expect(screen.getByText('你有多确定？', { selector: 'legend' })).toHaveFocus())
    expect(screen.getByText('第一段文字情境')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认本页/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /情境 2/ })).toBeDisabled()
    const saved = await finalDraftStore.listAnswers('situational:ui-attempt')
    expect(saved.find(row => row.itemKey === 'S1:choice')?.value).toMatchObject({ responseValue: 'A' })
  })

  it('confirms a page once, prevents backtracking, restores its page and keeps final submit manual', async () => {
    const view = renderRunner()
    await screen.findByText('第一段文字情境')
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(() => expect(screen.getByRole('slider')).not.toBeDisabled())
    fireEvent.change(screen.getByRole('slider'), { target: { value: '80' } })
    const next = screen.getByRole('button', { name: /确认本页/ })
    await waitFor(() => expect(next).not.toBeDisabled())
    fireEvent.doubleClick(next)
    fireEvent.click(next)
    fireEvent.click(next)
    await screen.findByText('第二段文字情境')
    expect(screen.getByRole('button', { name: /上一题/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /情境 1/ })).toBeDisabled()
    view.unmount()
    renderRunner()
    await screen.findByText('第二段文字情境')
    expect(screen.queryByText('第一段文字情境')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('第二个 A'))
    await waitFor(() => expect(screen.getByRole('button', { name: '提交测评' })).not.toBeDisabled())
    expect(screen.getByText('第二段文字情境')).toBeInTheDocument()
    expect(situationalApi.submit).not.toHaveBeenCalled()
  })

  it('keeps a completed but unconfirmed Training scene on refresh', async () => {
    const view = renderRunner()
    await screen.findByText('第一段文字情境')
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(() => expect(screen.getByRole('slider')).not.toBeDisabled())
    fireEvent.change(screen.getByRole('slider'), { target: { value: '80' } })
    await waitFor(() => expect(screen.getByRole('button', { name: /确认本页/ })).not.toBeDisabled())
    view.unmount()
    renderRunner()
    await screen.findByText('第一段文字情境')
    expect(screen.queryByText('第二段文字情境')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认本页/ })).not.toBeDisabled()
    expect(situationalApi.submit).not.toHaveBeenCalled()
  })

  it('stays at the current question on answer storage failure', async () => {
    renderRunner()
    await screen.findByText('第一段文字情境')
    vi.spyOn(finalDraftStore, 'putAnswer').mockRejectedValueOnce(new Error('test answer storage unavailable'))
    fireEvent.click(screen.getByLabelText('选择 A'))
    expect((await screen.findAllByText('test answer storage unavailable')).some(element => element.getAttribute('role') === 'alert')).toBe(true)
    expect(screen.getByText('你有多确定？', { selector: 'legend' })).not.toHaveFocus()
    expect(screen.getByRole('button', { name: /确认本页/ })).toBeDisabled()
    expect(screen.getByText('第一段文字情境')).toBeInTheDocument()
  })

  it('does not turn the page when storing the confirmed page fails', async () => {
    renderRunner()
    await screen.findByText('第一段文字情境')
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(() => expect(screen.getByRole('slider')).not.toBeDisabled())
    fireEvent.change(screen.getByRole('slider'), { target: { value: '80' } })
    await waitFor(() => expect(screen.getByRole('button', { name: /确认本页/ })).not.toBeDisabled())
    vi.spyOn(finalDraftStore, 'setInstrumentMetadata').mockRejectedValueOnce(new Error('test page storage unavailable'))
    fireEvent.click(screen.getByRole('button', { name: /确认本页/ }))
    expect(await screen.findByText('test page storage unavailable')).toBeInTheDocument()
    expect(screen.getByText('第一段文字情境')).toBeInTheDocument()
    expect(screen.queryByText('第二段文字情境')).not.toBeInTheDocument()
  })

  it('does not disclose the next scientific stage when selecting a choice', async () => {
    vi.mocked(situationalApi.start).mockResolvedValue({ code: 0, message: 'ok', data: stagedStartData() })
    renderRunner()
    await screen.findByText('第一段文字情境')
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(() => expect(screen.getByRole('button', { name: '确认行动选择' })).not.toBeDisabled())
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认行动选择' }))
    expect(await screen.findByRole('slider')).toBeInTheDocument()
    expect(screen.getByLabelText('选择 B')).toBeDisabled()
  })

  it('does not advance on restored answers or change legacy Survey navigation', async () => {
    const source = startData()
    await ensureSituationalDraft(source.attempt)
    await finalDraftStore.putAnswer({ draftKey: 'situational:ui-attempt', itemKey: 'S1:choice', value: { responseValue: 'A' }, updatedAt: Date.now() })
    const view = renderRunner()
    await screen.findByText('第一段文字情境')
    expect(screen.getByLabelText('选择 A')).toBeChecked()
    expect(screen.getByText('你有多确定？', { selector: 'legend' })).not.toHaveFocus()
    view.unmount()
    training.enabled = false
    renderRunner()
    await screen.findByText('第一段文字情境')
    expect(screen.queryByRole('button', { name: /确认本页/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一题' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /情境 2/ })).not.toBeDisabled()
  })
  it('handles online single choice within the page but keeps multiple choice manual', async () => {
    const source = startData()
    const channels = source.instrument.definition.scenes[0]!.channels
    channels[0]!.online = true
    channels.splice(1, 0, { channelKey: 'multi', responseType: 'MULTIPLE_CHOICE', online: true, prompt: '可选择多项', options: [{ optionKey: 'X', label: '多选 X' }, { optionKey: 'Y', label: '多选 Y' }] })
    vi.mocked(situationalApi.start).mockResolvedValue({ code: 0, message: 'ok', data: source })
    renderRunner()
    await screen.findByText('第一段文字情境')
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(() => expect(screen.getByText('可选择多项', { selector: 'legend' })).toHaveFocus())
    fireEvent.click(screen.getByLabelText('多选 X'))
    await waitFor(() => expect(screen.getByLabelText('多选 X')).toBeChecked())
    expect(screen.getByText('你有多确定？', { selector: 'legend' })).not.toHaveFocus()
    expect(screen.getByText('第一段文字情境')).toBeInTheDocument()
  })

  it('rejects incompatible saved navigation instead of reopening a locked earlier page', async () => {
    const source = startData()
    await ensureSituationalDraft(source.attempt)
    await finalDraftStore.setInstrumentMetadata('situational:ui-attempt', { trainingSjtPage: { version: 1, visitedSceneKeys: ['S1', 'other-path'] } })
    renderRunner()
    expect(await screen.findByText('本机情境换页进度与当前路径不一致，请保留草稿并联系教师。')).toBeInTheDocument()
    expect(screen.queryByLabelText('选择 A')).not.toBeInTheDocument()
  })

})

// Same renderer and stage journal for Training and Survey host adapters. The
// synthetic API exercises UI protocol only, not backend authorization.
describe('shared staged branch runner across hosts',()=>{
  it.each([['training','A','left'],['training','B','right'],['survey','A','left'],['survey','B','right']] as const)('%s host follows %s / %s and sends only its stage evidence',async(host,choice,selected)=>{
    await finalDraftStore.delete('situational:ui-attempt')
    const source=stagedStartData()
    if(source.instrument.definition.schemaVersion!==2)throw new Error('fixture')
    const d=source.instrument.definition,root=d.flow.nodes[0]!
    if(root.nodeType!=='SCENE')throw new Error('fixture')
    d.scenes[0]!.channels=[d.scenes[0]!.channels[0]!]
    root.responseStages=[{stageKey:'choice',kind:'CHOICE',channelKeys:['choice']}]
    root.transition={type:'DECISION',channelKey:'choice',branches:[{optionKey:'A',nextNodeKey:'left'},{optionKey:'B',nextNodeKey:'right'}]}
    for(const [index,key] of ['left','right'].entries()){
      d.scenes.push({sceneKey:key,title:key,sortOrder:index+1,stimulus:{type:'TEXT_V1',text:key+' branch only'},
        channels:[{channelKey:'choice',responseType:'SINGLE_CHOICE',prompt:key+' action',options:[{optionKey:'A',label:key+' option'}]}]})
      d.flow.nodes.splice(d.flow.nodes.length-1,0,{nodeType:'SCENE',nodeKey:key,sceneKey:key,motherSceneKey:key,roundKey:'R',stepKey:key,
        responseStages:[{stageKey:'choice',kind:'CHOICE',channelKeys:['choice']}],transition:{type:'NEXT',nextNodeKey:'terminal'}})
    }
    const submit=vi.fn().mockResolvedValue({code:0,message:'ok',data:completedData(source)}),onCompleted=vi.fn()
    if(host==='survey'){
      const client={start:vi.fn(),resume:vi.fn().mockResolvedValue({code:0,message:'ok',data:source}),submit,
        result:vi.fn(),loadAsset:vi.fn(),loadVideoSources:vi.fn()}
      render(<MemoryRouter><SituationalRunner host={{attemptId:'ui-attempt',parentAttemptId:'survey-parent',compositeItemId:'native',client,onCompleted}}/></MemoryRouter>)
    }else{
      vi.mocked(situationalApi.start).mockResolvedValue({code:0,message:'ok',data:source})
      vi.mocked(situationalApi.submit).mockImplementation(submit)
      renderRunner()
    }
    fireEvent.click(await screen.findByLabelText('选择 '+choice))
    await waitFor(()=>expect(screen.getByLabelText('选择 '+choice)).toBeChecked())
    fireEvent.click(screen.getByRole('button',{name:'确认行动选择'}))
    await waitFor(()=>expect(screen.getByRole('button',{name:'下一题'})).toBeEnabled())
    fireEvent.click(screen.getByRole('button',{name:'下一题'}))
    expect(await screen.findByText(selected+' branch only')).toBeInTheDocument()
    expect(screen.queryByText((selected==='left'?'right':'left')+' branch only')).toBeNull()
    fireEvent.click(screen.getByLabelText(selected+' option'))
    await waitFor(()=>expect(screen.getByLabelText(selected+' option')).toBeChecked())
    fireEvent.click(screen.getByRole('button',{name:'确认行动选择'}))
    await waitFor(()=>expect(screen.getByRole('button',{name:'提交测评'})).toBeEnabled())
    fireEvent.click(screen.getByRole('button',{name:'提交测评'}))
    await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1))
    const payload=submit.mock.calls[0]![1]
    expect(payload.responses.map((response:{sceneKey:string})=>response.sceneKey)).toEqual(['S1',selected])
    const events=payload.researchCapture.events as SituationalResearchEvent[]
    expect(events.filter(event=>event.type==='NODE_CONFIRMED').map(event=>event.nodeKey)).toEqual(['node',selected])
    expect(events.some(event=>event.nodeKey===(selected==='left'?'right':'left'))).toBe(false)
    if(host==='survey')await waitFor(()=>expect(onCompleted).toHaveBeenCalledTimes(1))
  })
})

// Native V1 is the same renderer, without manufactured staged capture.
describe('shared V1 text runner across hosts',()=>{
  it.each(['training','survey'] as const)('%s host submits V1 answers without inventing stage events',async host=>{
    vi.resetAllMocks()
    await finalDraftStore.delete('situational:ui-attempt')
    const source=startData(),reply={code:0,message:'ok',data:source}
    const submit=vi.fn().mockResolvedValue({code:0,message:'ok',data:completedData(source)})
    const onCompleted=vi.fn()
    if(host==='survey'){
      const client={start:vi.fn().mockResolvedValue(reply),resume:vi.fn().mockResolvedValue(reply),
        submit,result:vi.fn().mockResolvedValue(reply),loadAsset:vi.fn(),loadVideoSources:vi.fn()}
      render(<MemoryRouter><SituationalRunner host={{attemptId:'ui-attempt',parentAttemptId:'survey-parent',compositeItemId:'v1',client,onCompleted}}/></MemoryRouter>)
    }else{
      training.enabled=true
      vi.mocked(situationalApi.start).mockResolvedValue(reply)
      vi.mocked(situationalApi.submit).mockImplementation(submit)
      renderRunner()
    }
    await screen.findByText('第一段文字情境')
    expect(screen.queryByRole('button',{name:'确认行动选择'})).toBeNull()
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(()=>expect(screen.getByRole('slider')).not.toBeDisabled())
    fireEvent.change(screen.getByRole('slider'),{target:{value:'80'}})
    const next=screen.getByRole('button',{name:host==='training'?/确认本页/:/下一题/})
    await waitFor(()=>expect(next).toBeEnabled());fireEvent.click(next)
    await screen.findByText('第二段文字情境')
    fireEvent.click(screen.getByLabelText('第二个 A'))
    await waitFor(()=>expect(screen.getByRole('button',{name:'提交测评'})).toBeEnabled())
    expect(submit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'提交测评'}))
    await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1))
    const payload=submit.mock.calls[0]![1]
    expect(payload.responses.map(({sceneKey,channelKey,responseValue}:{sceneKey:string;channelKey:string;responseValue:unknown})=>({sceneKey,channelKey,responseValue}))).toEqual([
      {sceneKey:'S1',channelKey:'choice',responseValue:'A'},
      {sceneKey:'S1',channelKey:'continuous',responseValue:80},
      {sceneKey:'S2',channelKey:'choice',responseValue:'A'},
    ])
    expect(payload.responses.every((response:{answeredAt:unknown;responseTimeMs:unknown})=>typeof response.answeredAt==='string'&&typeof response.responseTimeMs==='number')).toBe(true)
    expect(payload.researchCapture).toBeUndefined()
    expect(payload).toMatchObject({attemptEpoch:1,definitionHash:'a'.repeat(64)})
    if(host==='survey')await waitFor(()=>expect(onCompleted).toHaveBeenCalledTimes(1))
  })
})

 it('keeps School instructions collapsible without changing a selected response or submitting',async()=>{
  const value=startData()
  const client:any={start:vi.fn(),resume:vi.fn().mockResolvedValue({code:0,data:value}),result:vi.fn(),submit:vi.fn(),loadAsset:vi.fn(),loadVideoSources:vi.fn()}
  const {container}=render(<MemoryRouter><SituationalRunner campus={{attemptId:'ui-attempt',parentAttemptId:'school-parent',compositeItemId:'school-slot',client,instructionsSummary:'作答说明',onCompleted:vi.fn()}}/></MemoryRouter>)
  const answer=await screen.findByRole('radio',{name:'选择 A'})
  fireEvent.click(answer)
  await waitFor(()=>expect(answer).toBeChecked())
  const details=container.querySelector('details.assessment-instructions')!
  expect(details).not.toHaveAttribute('open')
  fireEvent.click(screen.getByText('作答说明',{exact:true}))
  expect(details).toHaveAttribute('open')
  fireEvent.click(screen.getByText('作答说明',{exact:true}))
  expect(details).not.toHaveAttribute('open')
  expect(answer).toBeChecked()
  expect(client.submit).not.toHaveBeenCalled()
 })
