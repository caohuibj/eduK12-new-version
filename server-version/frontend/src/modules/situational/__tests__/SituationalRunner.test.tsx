import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SituationalRunner from '../pages/SituationalRunner'
import { finalDraftStore } from '../../../services/persistence/finalDraftStore'
import type { SituationalAttemptResponse } from '../types'
import { situationalApi } from '../api'

vi.mock('../api', () => ({
  situationalApi: {
    start: vi.fn(),
    submit: vi.fn(),
    result: vi.fn(),
  },
}))

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

describe('Situational text runner', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await finalDraftStore.delete('situational:ui-attempt')
    vi.mocked(situationalApi.start).mockResolvedValue({ code: 0, message: 'ok', data: startData() })
    vi.mocked(situationalApi.submit).mockResolvedValue({ code: 0, message: 'ok', data: { ...startData(), attempt: { ...startData().attempt, status: 'COMPLETED' } } })
  })

  it('renders text, supports choice/continuous boundaries, navigation, and one final request', async () => {
    render(<MemoryRouter initialEntries={['/student/situational/pilot']}><Routes><Route path="/student/situational/:instrumentKey" element={<SituationalRunner />} /></Routes></MemoryRouter>)
    expect(await screen.findByText('第一段文字情境')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('选择 A'))
    await waitFor(() => expect(screen.getByLabelText('选择 A')).toBeChecked())
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '100')
    fireEvent.change(slider, { target: { value: '100' } })
    await waitFor(() => expect(slider).toHaveValue('100'))
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
})

