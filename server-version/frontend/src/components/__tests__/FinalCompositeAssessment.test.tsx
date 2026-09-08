import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DeviceInputProvenanceV1 } from '../../modules/scale/device-input-provenance'
import type { CompositeAttemptState, CompositeCurrentItem } from '../../modules/composite/types'
import FinalCompositeAssessment from '../FinalCompositeAssessment'
import { finalDraftStore } from '../../services/persistence/finalDraftStore'

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
  vi.clearAllMocks()
  mockCapture.mockReturnValue(provenance)
  mockResolve.mockImplementation(resolveProvenance)
  mockRetry.mockImplementation(async ({ operation }: { operation: () => Promise<unknown> }) => operation())
})

afterEach(async () => {
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
}

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
