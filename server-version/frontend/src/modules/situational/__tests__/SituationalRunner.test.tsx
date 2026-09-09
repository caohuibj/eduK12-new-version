import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SituationalRunner from '../pages/SituationalRunner'
import { finalDraftStore } from '../../../services/persistence/finalDraftStore'
import { ensureSituationalDraft, situationalDraftKey } from '../draft'
import type { SituationalAttemptResponse } from '../types'
import { embeddedSituationalApi, situationalApi } from '../api'

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

  it('renders text, supports choice/continuous boundaries, navigation, and one final request', async () => {
    renderRunner()
    expect(await screen.findByText('第一段文字情境')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(() => expect(screen.getByLabelText('选择 A')).toBeChecked())
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '100')
    fireEvent.change(slider, { target: { value: '1' } })
    await waitFor(() => expect(slider).toHaveValue('1'))
    fireEvent.change(slider, { target: { value: '0' } })
    await waitFor(() => expect(slider).toHaveValue('0'))
    expect(screen.getByText('已完成 2 / 3 个必答通道')).toBeInTheDocument()
    fireEvent.change(slider, { target: { value: '100' } })
    await waitFor(() => expect(slider).toHaveValue('100'))
    await waitFor(() => expect(screen.getByRole('button', { name: /下一题/ })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: /下一题/ }))
    expect(await screen.findByText('第二段文字情境')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('第二个 A'))
    await waitFor(() => expect(screen.getByLabelText('第二个 A')).toBeChecked())
    fireEvent.click(screen.getByRole('button', { name: /提交测评/ }))
    await waitFor(() => expect(situationalApi.submit).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(situationalApi.submit).mock.calls[0]?.[1]
    expect(payload.responses).toHaveLength(3)
    expect(payload.responses.some((response) => response.responseValue === 100)).toBe(true)
    expect(JSON.stringify(payload)).not.toMatch(/score|contribution|percentile|quality/i)
  })

  it('renders IMAGE and ordered COMIC panels through the same runner', async () => {
    const visual = visualStartData()
    vi.mocked(situationalApi.start).mockResolvedValue({ code: 0, message: 'ok', data: visual })
    renderRunner()

    expect(await screen.findByAltText('界面中的静态图片')).toBeInTheDocument()
    expect(vi.mocked(situationalApi.loadAsset)).toHaveBeenCalledWith('ui-attempt', 'ui-image')
    fireEvent.click(screen.getByRole('button', { name: '情境 2，未完成' }))

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
    expect(screen.getByText('已完成 1 / 3 个必答通道')).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: `情境 ${sceneCount}，已完成` })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `情境 ${sceneCount}，已完成` }))
    expect(await screen.findByText(`第 ${sceneCount} 段文字情境`)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /提交测评/ }))
    await waitFor(() => expect(situationalApi.submit).toHaveBeenCalledTimes(1))
    expect(situationalApi.start).toHaveBeenCalledTimes(1)
    expect(vi.mocked(situationalApi.submit).mock.calls[0]?.[1].responses).toHaveLength(sceneCount)
  })
})
