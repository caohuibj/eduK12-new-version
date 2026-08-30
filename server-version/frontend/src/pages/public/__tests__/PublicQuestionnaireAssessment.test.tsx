import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

vi.mock('../../../api/publicCapabilityClient', () => ({
  createPublicCapabilityClient: vi.fn(() => mockClient),
}))

vi.mock('../../../utils/questionnaireResume', () => ({
  readQuestionnaireResumeToken: vi.fn(() => 'resume-capability'),
}))

import PublicQuestionnaireAssessment from '../PublicQuestionnaireAssessment'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub as typeof ResizeObserver

const formData = (required = false) => ({
  questionnaireAssessment: {
    id: 'questionnaire-assessment-1',
    status: 'IN_PROGRESS',
    progress: 0,
    currentIndex: 0,
  },
  currentFormItem: {
    id: 'form-item-1',
    type: 'text_input' as const,
    label: '补充说明',
    placeholder: null,
    required,
    position: 0,
    options: null,
  },
  currentScale: null,
  contentItems: [{ type: 'form' as const, position: 0, id: 'form-item-1', label: '补充说明', completed: false }],
  totalItems: 1,
  sessionId: 'session-1',
})

const response = <T,>(data: T) => ({ code: 0, message: 'ok', data })

const renderPage = () => render(
  <MemoryRouter initialEntries={['/public/questionnaire/token-1/assessment?sessionId=session-1']}>
    <Routes>
      <Route path="/public/questionnaire/:token/assessment" element={<PublicQuestionnaireAssessment />} />
      <Route path="/public/questionnaire/:token/result" element={<div>RESULT_PAGE</div>} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PublicQuestionnaireAssessment recovery and answer states', () => {
  it('does not submit an optional blank answer and requires an explicit skip', async () => {
    mockClient.get.mockResolvedValue(response(formData(false)))
    mockClient.post.mockResolvedValue(response(null))
    mockClient.patch.mockImplementation(async (_url: string, body: { answers: Array<{ checkpointSequence: number }> }) => (
      response({ acceptedSequences: body.answers.map((answer) => answer.checkpointSequence) })
    ))
    const user = userEvent.setup()

    renderPage()

    const submit = await screen.findByRole('button', { name: '提交并继续' })
    await user.click(submit)

    expect(await screen.findByRole('alert')).toHaveTextContent('请填写答案或选择跳过')
    expect(mockClient.post).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /跳\s*过/ }))
    await waitFor(() => expect(mockClient.patch).toHaveBeenCalledWith(
      '/assessments/session-1/form-answers/batch',
      expect.objectContaining({
        answers: [expect.objectContaining({ formItemId: 'form-item-1', action: 'skip', checkpointSequence: expect.any(Number) })],
      }),
    ))
  })

  it('keeps the current item and exposes retry when advancing cannot recover state', async () => {
    mockClient.get
      .mockResolvedValueOnce(response(formData(false)))
      .mockRejectedValueOnce(new Error('temporary network failure'))
    mockClient.post.mockResolvedValue(response(null))
    mockClient.patch.mockImplementation(async (_url: string, body: { answers: Array<{ checkpointSequence: number }> }) => (
      response({ acceptedSequences: body.answers.map((answer) => answer.checkpointSequence) })
    ))
    const user = userEvent.setup()

    renderPage()

    const input = await screen.findByRole('textbox')
    await user.type(input, '已填写')
    await user.click(screen.getByRole('button', { name: '提交并继续' }))

    expect(await screen.findByText('恢复失败，暂时不能继续作答。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重\s*试/ })).toBeInTheDocument()
    expect(screen.getByText('补充说明')).toBeInTheDocument()

    mockClient.get.mockResolvedValueOnce(response(formData(false)))
    await user.click(screen.getByRole('button', { name: /重\s*试/ }))
    await waitFor(() => expect(screen.queryByText('恢复失败，暂时不能继续作答。')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: '提交并继续' })).toBeEnabled()
  })
})
