import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CompositeAttemptState, CompositeCurrentItem } from '../../modules/composite/types'
import { finalDraftStore } from '../../services/persistence/finalDraftStore'
import FinalCompositeAssessment from '../FinalCompositeAssessment'

const { mockRetry } = vi.hoisted(() => ({ mockRetry: vi.fn() }))

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
    mockRetry.mockImplementation(async ({ operation }: { operation: () => Promise<unknown> }) => operation())
  })

  afterEach(async () => {
    await finalDraftStore.delete('composite-form-section:composite-attempt-form-player:composite-form-choice-section')
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
})
