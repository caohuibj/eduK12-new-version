import { TrainingLearnerNavigationBoundary } from './TrainingLearnerNavigationBoundary'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { learnerCourseContext, withLearnerCourse, useTrainingLearnerNavigation } from './learnerNavigation'

const mocks = vi.hoisted(() => ({ training: true, get: vi.fn(), getSession: vi.fn(), situationalResult: vi.fn() }))
vi.mock('./context', () => ({ isTrainingHost: () => mocks.training }))
vi.mock('../api/client', () => ({ default: { get: mocks.get }, sessionFetch: vi.fn() }))
vi.mock('../modules/cognitive/api', () => ({ cognitiveApi: { getSession: mocks.getSession }, publicCognitiveApi: vi.fn() }))
vi.mock('../modules/cognitive/registry', () => ({ resolveRunner: () => null }))
vi.mock('../modules/situational/api', () => ({ situationalApi: { result: mocks.situationalResult } }))
import ScaleResult from '../pages/student/ScaleResult'
import QuestionnaireResult from '../pages/student/QuestionnaireResult'
import CognitiveResult from '../modules/cognitive/pages/CognitiveResult'
import SituationalResult from '../modules/situational/pages/SituationalResult'

function Location() { const location = useLocation(); return <output aria-label="address">{location.pathname + location.search}</output> }
function Task({ parentAttemptId, courseId }: { parentAttemptId?: string; courseId?: string }) {
  const nav = useTrainingLearnerNavigation({ parentAttemptId, courseId })
  return <><button onClick={() => nav.navigate('/student/cognitive')}>{nav.backLabel}</button>
    <button onClick={() => nav.navigate('/student/cognitive/sessions/s-2?returnTo=%2Fstudent%2Fcomposite%2Fattempts%2Fp-1')}>进入单项</button>
    <button onClick={() => nav.navigate('/student/cognitive/sessions/s-2/result')}>提交完成</button>
    <button onClick={() => nav.navigate(-1)}>返回</button></>
}
function mount(path: string, page = <Task />, role: 'STUDENT' | 'TEACHER' = 'STUDENT') {
  return render(<MemoryRouter initialEntries={['/unrelated', path]}><TrainingLearnerNavigationBoundary role={role}>
    <Location /><Routes>
      <Route path="/student/courses/:courseId" element={<p>课程</p>} />
      <Route path="/student" element={<p>我的课程</p>} />
      <Route path="/student/cognitive/sessions/:sessionId/result" element={page} />
      <Route path="/student/scales/result/:assessmentId" element={page} />
      <Route path="/student/questionnaires/result/:assessmentId" element={page} />
      <Route path="/student/situational/attempts/:attemptId/result" element={page} />
      <Route path="*" element={page} />
    </Routes>
  </TrainingLearnerNavigationBoundary></MemoryRouter>)
}

beforeEach(() => { vi.clearAllMocks(); mocks.training = true; mocks.get.mockResolvedValue({ code: 404 }); mocks.getSession.mockResolvedValue({ code: 404 }); mocks.situationalResult.mockResolvedValue({ code: 404 }) })

describe('Training learner course navigation', () => {
  it.each(['/student/cognitive', '/student/cognitive/history', '/student/situational', '/student/situational/history', '/student/scales', '/student/questionnaires', '/student/assignments', '/student/checkins', '/scale-library', '/scale-library/tool/v1'])('replaces old discovery URL %s without mounting it', async path => {
    const Hidden = vi.fn(() => <p>自由选测</p>)
    mount(path, <Hidden />)
    expect(await screen.findByLabelText('address')).toHaveTextContent(/^\/student$/)
    expect(Hidden).not.toHaveBeenCalled()
  })

  it('returns an old list link to its explicit course and section', async () => {
    mount('/student/cognitive?courseId=course-b&courseSection=assessments')
    expect(await screen.findByLabelText('address')).toHaveTextContent('/student/courses/course-b?section=assessments')
  })

  it('keeps course context through a child, completion, refresh and return', () => {
    const view = mount('/student/composite/attempts/p-1?courseId=course-b&courseSection=assessments')
    fireEvent.click(screen.getByRole('button', { name: '进入单项' }))
    expect(screen.getByLabelText('address')).toHaveTextContent('/student/cognitive/sessions/s-2?returnTo=%2Fstudent%2Fcomposite%2Fattempts%2Fp-1&courseId=course-b&courseSection=assessments')
    fireEvent.click(screen.getByRole('button', { name: '提交完成' }))
    const completedAddress = screen.getByLabelText('address').textContent!
    view.unmount()
    mount(completedAddress)
    fireEvent.click(screen.getByRole('button', { name: '返回当前课程' }))
    expect(screen.getByLabelText('address')).toHaveTextContent('/student/courses/course-b?section=assessments')
  })

  it('uses the authorized parent and its course rather than a conflicting navigation hint', () => {
    mount('/student/cognitive/sessions/s-1?courseId=wrong&returnTo=%2Fstudent%2Fcomposite%2Fattempts%2Fwrong', <Task parentAttemptId="parent-real" courseId="course-real" />)
    fireEvent.click(screen.getByRole('button', { name: '继续整份测评' }))
    expect(screen.getByLabelText('address')).toHaveTextContent('/student/composite/attempts/parent-real?courseId=course-real&courseSection=assessments')
  })

  it('returns a submission opened in a new tab to its task course and check-in section', () => {
    mount('/student/checkins/task?courseId=other', <Task courseId="course-real" />)
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(screen.getByLabelText('address')).toHaveTextContent('/student/courses/course-real?section=checkins')
  })

  it.each(['course-a', 'course-b'])('returns to the exact source %s without a shared last-course state', courseId => {
    mount(`/student/scales/task?courseId=${courseId}`)
    fireEvent.click(screen.getByRole('button', { name: '返回当前课程' }))
    expect(screen.getByLabelText('address')).toHaveTextContent(`/student/courses/${courseId}?section=assessments`)
  })

  it('uses My Courses when a historical link has no course context', () => {
    mount('/student/scales/result/old')
    fireEvent.click(screen.getByRole('button', { name: '返回我的课程' }))
    expect(screen.getByLabelText('address')).toHaveTextContent(/^\/student$/)
  })

  it.each(['TEACHER', 'other-host'])('leaves shared navigation unchanged for %s', async mode => {
    mocks.training = mode !== 'other-host'
    mount('/scale-library', <p>原有量表库</p>, mode === 'TEACHER' ? 'TEACHER' : 'STUDENT')
    expect(screen.getByText('原有量表库')).toBeInTheDocument()
    expect(screen.getByLabelText('address')).toHaveTextContent('/scale-library')
  })

  it.each(['/my-assessments', '/organizations/org-1', '/relational/attempts/assigned', '/public/composite/attempts/old', '/student/scales/assigned', '/student/questionnaires/assigned', '/student/cognitive/assignments/assigned', '/student/composite/attempts/assigned', '/student/composite/situational/assigned', '/student/cognitive/sessions/old/result', '/student/scales/result/old', '/student/questionnaires/result/old'])('keeps authorized task/report deep link %s', path => {
    mount(path, <p>原有授权页面</p>)
    expect(screen.getByText('原有授权页面')).toBeInTheDocument()
    expect(screen.getByLabelText('address')).toHaveTextContent(path)
  })

  it.each([
    ['/student/scales/result/missing?courseId=c1', <ScaleResult />],
    ['/student/questionnaires/result/missing?courseId=c1', <QuestionnaireResult />],
    ['/student/cognitive/sessions/missing/result?courseId=c1', <CognitiveResult />],
    ['/student/situational/attempts/missing/result?courseId=c1', <SituationalResult />],
  ] as const)('returns an unavailable report to its course: %s', async (path, page) => {
    mount(path, page)
    fireEvent.click(await screen.findByRole('button', { name: '返回当前课程' }))
    expect(screen.getByLabelText('address')).toHaveTextContent('/student/courses/c1?section=assessments')
  })

  it('keeps deferred cognitive feedback closed and returns to the server-confirmed parent', async () => {
    mocks.getSession.mockResolvedValue({ code: 0, data: { status: 'COMPLETED', feedbackDeferred: true, trainingPersistence: { attemptId: 'parent-real', courseId: 'course-real' } } })
    mount('/student/cognitive/sessions/s-1/result', <CognitiveResult />)
    expect(await screen.findByText('单项已提交，反馈暂未开放')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '继续整份测评' }))
    expect(screen.getByLabelText('address')).toHaveTextContent('/student/composite/attempts/parent-real?courseId=course-real&courseSection=assessments')
    expect(mocks.getSession).toHaveBeenCalledTimes(1)
  })

  it('keeps deferred situational feedback closed without rereading it or linking to free discovery', async () => {
    mocks.situationalResult.mockResolvedValue({ code: 0, data: { feedbackDeferred: true, attempt: { compositeAttemptId: 'parent-real', status: 'COMPLETED' }, trainingPersistence: { courseId: 'course-real' } } })
    mount('/student/situational/attempts/old/result', <SituationalResult />)
    expect(await screen.findByRole('link', { name: '继续整份测评' })).toHaveAttribute('href', '/student/composite/attempts/parent-real?courseId=course-real&courseSection=assessments')
    expect(screen.queryByRole('link', { name: '返回题包' })).toBeNull()
    expect(mocks.situationalResult).toHaveBeenCalledTimes(1)
  })

  it('ignores a late incomplete situational report after leaving for another course', async () => {
    let resolveResult!: (value: unknown) => void
    const pending = new Promise(resolve => { resolveResult = resolve })
    mocks.situationalResult.mockReturnValueOnce(pending)
    mount('/student/situational/attempts/old/result', <>
      <Link to="/student/courses/new-course?section=checkins">Leave report</Link>
      <SituationalResult />
    </>)
    fireEvent.click(screen.getByRole('link', { name: 'Leave report' }))
    await act(async () => {
      resolveResult({ code: 0, data: { attempt: { compositeAttemptId: 'old-parent', status: 'IN_PROGRESS', instrumentKey: 'pilot' }, trainingPersistence: { courseId: 'old-course' } } })
      await pending
    })
    expect(screen.getByLabelText('address')).toHaveTextContent('/student/courses/new-course?section=checkins')
  })

  it('clears deferred feedback and its old parent when switching to an unavailable situational report', async () => {
    mocks.situationalResult.mockResolvedValueOnce({ code: 0, data: { feedbackDeferred: true, attempt: { compositeAttemptId: 'old-parent', status: 'COMPLETED' }, trainingPersistence: { courseId: 'old-course' } } })
      .mockResolvedValueOnce({ code: 404, message: 'Not found' })
    mount('/student/situational/attempts/old/result', <>
      <Link to="/student/situational/attempts/missing/result?courseId=new-course">Next report</Link>
      <SituationalResult />
    </>)
    expect(await screen.findByRole('link', { name: '继续整份测评' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Next report' }))
    expect(await screen.findByText('报告暂时无法打开')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '继续整份测评' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '返回当前课程' }))
    expect(screen.getByLabelText('address')).toHaveTextContent('/student/courses/new-course?section=assessments')
  })

  it('returns an incomplete situational result to its existing parent instead of a new standalone instrument', async () => {
    mocks.situationalResult.mockResolvedValue({ code: 0, data: { attempt: { compositeAttemptId: 'parent-real', status: 'IN_PROGRESS', instrumentKey: 'free-instrument' }, trainingPersistence: { courseId: 'course-real' } } })
    mount('/student/situational/attempts/old/result', <SituationalResult />)
    await waitFor(() => expect(screen.getByLabelText('address')).toHaveTextContent('/student/composite/attempts/parent-real?courseId=course-real&courseSection=assessments'))
  })
})

it('accepts only course navigation hints and preserves unrelated target query data', () => {
  expect(learnerCourseContext('?courseId=bad%2Fpath')).toBeNull()
  expect(learnerCourseContext('?returnTo=https%3A%2F%2Foutside.example')).toBeNull()
  expect(learnerCourseContext('?returnTo=%2Fdashboard')).toBeNull()
  expect(learnerCourseContext('?returnTo=%2Fstudent%2Fcourses%2Fc1%3Fsection%3Dcheckins')).toEqual({ courseId: 'c1', section: 'checkins' })
  expect(withLearnerCourse('/student/composite/attempts/p?recovery=expired#notice', { courseId: 'c1', section: 'assessments' })).toBe('/student/composite/attempts/p?recovery=expired&courseId=c1&courseSection=assessments#notice')
  expect(withLearnerCourse('//outside.example', { courseId: 'c1', section: 'assessments' })).toBe('//outside.example')
})
