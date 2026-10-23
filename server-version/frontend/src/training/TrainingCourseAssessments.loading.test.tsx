import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ loaded: vi.fn(), attempts: vi.fn() }))
vi.mock('../modules/composite/api', () => ({ compositeApi: { attempts: mocks.attempts } }))
vi.mock('./TrainingCatalogTags', () => ({ default: () => null }))
vi.mock('../pages/questionnaire/AssessmentDataExport', () => {
  mocks.loaded()
  return { default: ({ actorId, course, onClose }: { actorId: string; course: { id: string }; onClose: () => void }) =>
    <div role="dialog">{actorId}:{course.id}<button onClick={onClose}>关闭</button></div> }
})
import TrainingCourseAssessments from './TrainingCourseAssessments'

it('does not load export code until requested and reuses the module when reopened', async () => {
  render(<MemoryRouter><TrainingCourseAssessments course={{ id: 'course-1', title: '课程' }} actorId="teacher-1"
    rows={[{ id: 'assessment-1', key: 'assessment-1', kind: 'QUESTIONNAIRE', typeLabel: '组合测评', name: '测评', description: null,
      status: 'PUBLISHED', unitCount: 1, unitLabel: '单元', manageHref: '/questionnaire-products/assessment-1' }]}
    loading={false} error={null} onRetry={vi.fn()} /></MemoryRouter>)
  expect(mocks.loaded).not.toHaveBeenCalled()
  expect(mocks.attempts).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '导出本课程数据' }))
  expect(await screen.findByRole('dialog')).toHaveTextContent('teacher-1:course-1')
  expect(mocks.loaded).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  fireEvent.click(screen.getByRole('button', { name: '导出本课程数据' }))
  await screen.findByRole('dialog')
  expect(mocks.loaded).toHaveBeenCalledTimes(1)
})
