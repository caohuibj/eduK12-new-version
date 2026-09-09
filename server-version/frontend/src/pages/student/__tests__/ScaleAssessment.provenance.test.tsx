import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import {
  createFinalDraftMeta,
  finalDraftStore,
} from '../../../services/persistence/finalDraftStore'
import type { DeviceInputProvenanceV1 } from '../../../modules/scale/device-input-provenance'

const { mockPost, mockCapture, mockResolve } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockCapture: vi.fn(),
  mockResolve: vi.fn(),
}))

vi.mock('../../../api/client', () => ({
  default: { post: mockPost },
}))

vi.mock('../../../modules/scale/device-input-provenance', async () => {
  const actual = await vi.importActual<typeof import('../../../modules/scale/device-input-provenance')>('../../../modules/scale/device-input-provenance')
  return { ...actual, resolveScaleDeviceInputProvenance: mockResolve }
})

import ScaleAssessment from '../ScaleAssessment'

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

const scale = {
  id: 'scale-1',
  name: '示例量表',
  instruction: null,
  estimatedTime: 5,
  definitionHash: 'scale-definition-hash',
  definition: {
    schemaVersion: 2 as const,
    respondentType: 'participant_self_report',
    display: { randomizeItems: false },
    items: [
      {
        itemCode: 'item-1',
        content: '第一题内容',
        type: 'single',
        required: true,
        sortOrder: 0,
        responseSetKey: 'set-1',
        randomizeOptions: false,
        options: [{ value: 'often', label: '选项 A' }],
      },
      {
        itemCode: 'item-2',
        content: '第二题内容',
        type: 'single',
        required: true,
        sortOrder: 1,
        responseSetKey: 'set-2',
        randomizeOptions: false,
        options: [{ value: 'never', label: '选项 B' }],
      },
    ],
  },
}

let assessmentForTest: Record<string, unknown>

const renderPage = (assessment: Record<string, unknown>) => {
  assessmentForTest = assessment
  const element = (
    <MemoryRouter initialEntries={['/student/scales/scale-1']}>
      <Routes>
        <Route path="/student/scales/:scaleId" element={<ScaleAssessment />} />
        <Route path="/student/scales/result/:assessmentId" element={<div>RESULT_PAGE</div>} />
      </Routes>
    </MemoryRouter>
  )
  return { ...render(element), element }
}

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

const makeAssessment = (id: string, serverValue?: DeviceInputProvenanceV1) => ({
  id,
  status: 'IN_PROGRESS',
  progress: 0,
  answers: [],
  deliveryMode: 'FINAL_ONLY' as const,
  attemptEpoch: 1,
  definitionHash: 'scale-definition-hash',
  contextSnapshotHash: null,
  ...(serverValue ? { deviceInputProvenance: serverValue } : {}),
})

beforeEach(() => {
  vi.clearAllMocks()
  mockCapture.mockReturnValue(provenance)
  mockResolve.mockImplementation(resolveProvenance)
  mockPost.mockImplementation((path: string) => (
    path === '/scales/scale-1/assessments'
      ? Promise.resolve({ code: 0, data: { assessment: assessmentForTest, scale } })
      : Promise.resolve({ code: 0 })
  ))
})

afterEach(async () => {
  await Promise.all([
    finalDraftStore.delete('scale:assessment-fresh'),
    finalDraftStore.delete('scale:assessment-draft'),
    finalDraftStore.delete('scale:assessment-server'),
  ])
})

const completeTwoItemFinalOnlyAttempt = async () => {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '选项 A' }))
  await screen.findByText('第二题内容')
  await user.click(screen.getByRole('button', { name: '选项 B' }))
  await user.click(screen.getByRole('button', { name: '完成测评' }))
  await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2))
}

describe('ScaleAssessment FINAL_ONLY provenance boundaries', () => {
  it('captures once across answers, navigation, rerender, and one final submit', async () => {
    const view = renderPage(makeAssessment('assessment-fresh'))
    expect(await screen.findByText('第一题内容')).toBeInTheDocument()
    expect(mockPost).toHaveBeenCalledTimes(1)

    await completeTwoItemFinalOnlyAttempt()
    view.rerender(view.element)

    expect(mockCapture).toHaveBeenCalledTimes(1)
    expect(mockPost).toHaveBeenCalledTimes(2)
    const finalBody = mockPost.mock.calls[1][1] as Record<string, any>
    expect(finalBody.deviceInputProvenance).toEqual(provenance)
    expect(finalBody.answers).toHaveLength(2)
    expect(finalBody.answers.every((answer: Record<string, unknown>) => !('deviceInputProvenance' in answer))).toBe(true)
  })

  it('restores draft provenance without a fresh browser capture', async () => {
    const draftKey = 'scale:assessment-draft'
    await finalDraftStore.ensure(createFinalDraftMeta({
      draftKey,
      instrument: 'scale',
      attemptId: 'assessment-draft',
      attemptEpoch: 1,
      definitionHash: 'scale-definition-hash',
      contextSnapshotHash: null,
      deliveryMode: 'final_only',
      submissionId: 'draft-submission-1',
    }))
    await finalDraftStore.setInstrumentMetadata(draftKey, { scaleDeviceInputProvenance: provenance })

    renderPage(makeAssessment('assessment-draft'))
    expect(await screen.findByText('第一题内容')).toBeInTheDocument()

    expect(mockCapture).not.toHaveBeenCalled()
    expect(mockResolve).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ scaleDeviceInputProvenance: provenance }),
    }))
  })

  it('restores valid server provenance without a fresh browser capture', async () => {
    renderPage(makeAssessment('assessment-server', provenance))
    expect(await screen.findByText('第一题内容')).toBeInTheDocument()

    expect(mockCapture).not.toHaveBeenCalled()
    expect(mockResolve).toHaveBeenCalledWith(expect.objectContaining({ serverValue: provenance }))
  })
})
