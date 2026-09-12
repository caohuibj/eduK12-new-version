import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createFinalDraftMeta,
  finalDraftStore,
} from '../../services/persistence/finalDraftStore'
import type { DeviceInputProvenanceV1 } from '../../modules/scale/device-input-provenance'
import FinalQuestionnaireAssessment, {
  type FinalQuestionnaireData,
} from '../FinalQuestionnaireAssessment'

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

const makeScaleData = (serverValue?: DeviceInputProvenanceV1): FinalQuestionnaireData => ({
  questionnaireAssessment: {
    id: 'questionnaire-assessment-1',
    status: 'IN_PROGRESS',
    progress: 0,
    currentIndex: 0,
    deliveryMode: 'FINAL_ONLY',
    attemptEpoch: 1,
  },
  questionnaire: { id: 'questionnaire-1', name: '示例问卷', instruction: null },
  contextSnapshotHash: null,
  currentFormSection: null,
  currentScale: {
    id: 'questionnaire-scale-1',
    name: '示例量表',
    instruction: null,
    scaleAssessmentId: 'scale-assessment-1',
    definitionHash: 'scale-definition-hash',
    ...(serverValue ? { deviceInputProvenance: serverValue } : {}),
    definition: {
      schemaVersion: 2,
      respondentType: 'participant_self_report',
      display: { randomizeItems: false },
      items: [{
        itemCode: 'item-1',
        content: '量表第一题',
        type: 'single',
        required: true,
        sortOrder: 0,
        responseSetKey: 'set-1',
        randomizeOptions: false,
        options: [{ value: 'often', label: '经常' }],
      }],
    },
  },
  totalItems: 1,
  contentItems: [{ type: 'scale', position: 0, id: 'questionnaire-scale-1', label: '示例量表', completed: false, index: 0 }],
  sessionId: 'questionnaire-session-1',
})

const makeFormData = (): FinalQuestionnaireData => ({
  ...makeScaleData(),
  currentFormSection: {
    id: 'form-section-1',
    title: '人口学信息',
    description: null,
    position: 0,
    contextSection: true,
    definitionHash: 'form-definition-hash',
    status: 'IN_PROGRESS',
    submittedAt: null,
    items: [{
      id: 'form-item-1',
      formItemId: 'form-item-1',
      type: 'fill_blank',
      label: '年级',
      placeholder: null,
      options: null,
      required: false,
      contextKey: null,
      value: null,
    }],
  },
  currentScale: null,
  contentItems: [{ type: 'form-section', position: 0, id: 'form-section-1', label: '人口学信息', completed: false, index: 0 }],
})

const response = { code: 0, message: 'ok', data: null }

const renderAssessment = (data: FinalQuestionnaireData, publicMode = false) => {
  const post = vi.fn().mockResolvedValue(response)
  const onReload = vi.fn().mockResolvedValue(undefined)
  render(
    <FinalQuestionnaireAssessment
      data={data}
      publicMode={publicMode}
      post={post}
      onReload={onReload}
      onExit={vi.fn()}
      onCompleted={vi.fn()}
    />,
  )
  return { post, onReload }
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

beforeEach(() => {
  vi.clearAllMocks()
  mockCapture.mockReturnValue(provenance)
  mockResolve.mockImplementation(resolveProvenance)
  mockRetry.mockImplementation(async ({ operation }: { operation: () => Promise<unknown> }) => operation())
})

afterEach(async () => {
  await finalDraftStore.delete('questionnaire-form-section:questionnaire-assessment-1:form-section-1')
  await finalDraftStore.delete('questionnaire-scale:scale-assessment-1')
})

describe('FinalQuestionnaireAssessment Scale provenance placement', () => {
  it('keeps Scale provenance out of form-section submit payloads', async () => {
    const user = userEvent.setup()
    const { post } = renderAssessment(makeFormData())

    await user.click(await screen.findByRole('button', { name: '提交整个区段' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))

    const [path, body] = post.mock.calls[0] as [string, Record<string, unknown>]
    expect(path).toBe('/questionnaires/assessments/questionnaire-assessment-1/form-sections/form-section-1/submit')
    expect(body).not.toHaveProperty('deviceInputProvenance')
  })

  it('sends one top-level provenance object on authenticated Scale final submit', async () => {
    const user = userEvent.setup()
    const { post } = renderAssessment(makeScaleData())

    await user.click(await screen.findByRole('button', { name: '经常' }))
    await user.click(screen.getByRole('button', { name: '提交整份量表' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))

    const [path, body] = post.mock.calls[0] as [string, Record<string, any>]
    expect(path).toBe('/questionnaires/assessments/questionnaire-assessment-1/scales/scale-assessment-1/submit')
    expect(body.deviceInputProvenance).toEqual(provenance)
    expect(body.answers[0]).not.toHaveProperty('deviceInputProvenance')
    expect(body.answers.filter((answer: Record<string, unknown>) => 'deviceInputProvenance' in answer)).toHaveLength(0)
  })

  it('uses the same top-level provenance contract on public Scale final submit', async () => {
    const user = userEvent.setup()
    const { post } = renderAssessment(makeScaleData(), true)

    await user.click(await screen.findByRole('button', { name: '经常' }))
    await user.click(screen.getByRole('button', { name: '提交整份量表' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))

    const [path, body] = post.mock.calls[0] as [string, Record<string, any>]
    expect(path).toBe('/assessments/questionnaire-session-1/scale/scale-assessment-1/submit')
    expect(body.deviceInputProvenance).toEqual(provenance)
    expect(body.answers[0]).not.toHaveProperty('deviceInputProvenance')
  })

  it('captures once when the current Scale has no server provenance', async () => {
    const user = userEvent.setup()
    const { post } = renderAssessment(makeScaleData())

    await user.click(await screen.findByRole('button', { name: '经常' }))
    await user.click(screen.getByRole('button', { name: '提交整份量表' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))

    expect(mockCapture).toHaveBeenCalledTimes(1)
    expect((post.mock.calls[0][1] as Record<string, any>).deviceInputProvenance.capturedAt).toBe(provenance.capturedAt)
  })

  it('restores draft provenance without fresh capture and preserves capturedAt', async () => {
    const draftKey = 'questionnaire-scale:scale-assessment-1'
    await finalDraftStore.ensure(createFinalDraftMeta({
      draftKey,
      instrument: 'scale',
      attemptId: 'scale-assessment-1',
      attemptEpoch: 1,
      definitionHash: 'scale-definition-hash',
      contextSnapshotHash: null,
      deliveryMode: 'final_only',
      submissionId: 'draft-submission-1',
    }))
    await finalDraftStore.setInstrumentMetadata(draftKey, { scaleDeviceInputProvenance: provenance })

    const user = userEvent.setup()
    const { post } = renderAssessment(makeScaleData())
    await user.click(await screen.findByRole('button', { name: '经常' }))
    await user.click(screen.getByRole('button', { name: '提交整份量表' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))

    expect(mockCapture).not.toHaveBeenCalled()
    expect((post.mock.calls[0][1] as Record<string, any>).deviceInputProvenance).toEqual(provenance)
  })

  it('replays the identical sealed Scale body after an ambiguous submit failure', async () => {
    const user = userEvent.setup()
    const { post } = renderAssessment(makeScaleData())
    post
      .mockResolvedValueOnce({ code: 500, message: 'response lost', data: null })
      .mockResolvedValueOnce(response)

    await user.click(await screen.findByRole('button', { name: '经常' }))
    await user.click(screen.getByRole('button', { name: '提交整份量表' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('response lost'))

    const firstBody = structuredClone(post.mock.calls[0][1])
    const sealedMeta = await finalDraftStore.get('questionnaire-scale:scale-assessment-1')
    expect(sealedMeta?.status).toBe('RETRY_PENDING')
    expect(sealedMeta?.sealedSubmission?.payload).toEqual(firstBody)

    await user.click(screen.getByRole('button', { name: '提交整份量表' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    expect(post.mock.calls[1][1]).toEqual(firstBody)
  })
})
