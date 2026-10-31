import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import QuestionnaireAssessment from '../QuestionnaireAssessment'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: mocks }))
vi.mock('../../../components/FinalQuestionnaireAssessment', () => ({
  default: ({ data }: any) => <div>作答入口 {data.questionnaireAssessment.id}</div>,
}))
beforeEach(() => vi.clearAllMocks())
it.each(['active-with-completed', 'completed', 'unstarted'])('opens only the target questionnaire with unchanged %s dispatch', async state => {
  mocks.get.mockResolvedValue({ code: 0, data: { list: [{ id: 'target', inProgress: state === 'active-with-completed',
    completed: state !== 'unstarted', assessmentId: state === 'unstarted' ? null : 'done' }] } })
  const attempt = state === 'active-with-completed' ? 'active' : 'new'
  mocks.post.mockResolvedValue({ code: 0, data: {
    questionnaireAssessment: { id: attempt, status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', attemptEpoch: 1, currentIndex: 0 },
    currentFormItem: null, currentScale: null, currentFormSection: null, contentItems: [], totalItems: 1,
  } })
  render(<MemoryRouter initialEntries={['/student/questionnaires/target/assessment']}><Routes>
    <Route path="/student/questionnaires/:questionnaireId/assessment" element={<QuestionnaireAssessment />} />
    <Route path="/student/questionnaires/result/:assessmentId" element={<div>已完成报告入口</div>} />
  </Routes></MemoryRouter>)
  if (state === 'completed') {
    await screen.findByText('已完成报告入口')
    expect(mocks.post).not.toHaveBeenCalled()
  } else {
    await screen.findByText(`作答入口 ${attempt}`)
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/questionnaires/target/assessments')
  }
  await waitFor(() => expect(mocks.get).toHaveBeenCalledExactlyOnceWith('/questionnaires/available', { params: { questionnaireId: 'target' } }))
})
