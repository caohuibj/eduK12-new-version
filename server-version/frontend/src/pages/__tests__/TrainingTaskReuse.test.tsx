import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../../api/client', () => ({ default: m, sessionFetch: vi.fn() }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'trainer', role: 'TEACHER' } }) }))
vi.mock('../../training/context', () => ({ isTrainingHost: () => true }))
vi.mock('../../components/RichTextEditor', () => ({ default: () => null }))
vi.mock('../../components/QuestionEditor', () => ({ default: () => null }))
vi.mock('../../components/MediaSelector', () => ({ default: () => null }))
vi.mock('../../components/CheckinTokenManager', () => ({ default: () => null }))
import AssignmentList from '../AssignmentList'
import CheckinList from '../CheckinList'
import type {Course} from '../../types'

const sourceCourse = { id: 'source', title: '以往课程', creatorId: 'trainer' }
const targetCourse = { id: 'target', title: '当前课程', creatorId: 'trainer' }
function ReuseRoute(){const location=useLocation();return <output data-testid="reuse-route">{location.pathname}{location.search}</output>}
function mount(kind:string,Page:typeof AssignmentList|typeof CheckinList){
  render(<MemoryRouter initialEntries={[`/${kind}?reuse=true&courseId=target`]}><ReuseRoute/><Routes>
    <Route path={'/'+kind} element={<Page/>}/>
    <Route path="/courses/:id/detail" element={<Page embeddedCourse={targetCourse as Course}/>}/>
  </Routes></MemoryRouter>)
}
const source = {
  id: 'old-task', title: '旧任务内容', courseId: 'source', course: sourceCourse,
  description: '课程任务介绍', content: '<p>教学正文</p>', tags: ['教学'],
  questions: [{ id: 'question', type: 'text', question: '如何应用？' }],
  videos: [], images: [{ url: '/uploads/example.jpg', name: '示例图片' }], documents: [],
  startTime: '2020-01-01', endTime: '2020-02-01', deadline: '2020-02-01',
  status: 'PUBLISHED', allowAnonymous: true, publicToken: 'old-token',
  submissions: [{ id: 'private-submission', answers: { question: 'private answer' } }],
  mySubmission: { id: 'private-submission' }, _count: { submissions: 30 }, allowViewOthers: false,
}
beforeEach(() => { vi.clearAllMocks(); m.post.mockResolvedValue({ code: 0, data: { id: 'new-task' } }) })
it.each([
  ['assignments', '练习', AssignmentList, '截止时间', '发布练习'],
  ['checkins', '打卡', CheckinList, '截止时间', '发布打卡'],
] as const)('reuses %s into a separate course only after reviewing and saving content', async (kind, label, Page, dateLabel, saveLabel) => {
  const original = structuredClone(source)
  m.get.mockImplementation(async (path: string) => {
    if (path === '/courses') return { code: 0, data: { list: [sourceCourse, targetCourse] } }
    if (path === `/${kind}/old-task?courseId=source`) return { code: 0, data: source }
    if (path.endsWith('/tags')) return { code: 0, data: { tags: [] } }
    return { code: 0, data: { list: path.includes('courseId=target') ? [] : [source], total: 1 } }
  })
  mount(kind,Page)
  await screen.findByRole('dialog', { name: '复用' + label })
  expect(screen.getByTestId('reuse-route')).toHaveTextContent('/courses/target/detail?section='+kind)
  fireEvent.click(await screen.findByRole('button', { name: '使用此内容' }))
  const title = await screen.findByLabelText(label + '标题 *')
  expect(title).toHaveValue(source.title)
  expect(screen.getByLabelText('选择课程 *')).toHaveValue('target')
  expect(screen.getByLabelText(dateLabel)).toHaveValue('')
  expect(m.post).not.toHaveBeenCalled()
  fireEvent.change(title, { target: { value: '新的课程任务' } })
  fireEvent.click(within(screen.getByRole('dialog', { name: kind === 'assignments' ? '发布练习' : '发布打卡' })).getByRole('button', { name: saveLabel }))
  await waitFor(() => expect(m.post).toHaveBeenCalledTimes(1))
  const [endpoint, body] = m.post.mock.calls[0]
  expect(endpoint).toBe('/' + kind)
  expect(body).toMatchObject({ courseId: 'target', title: '新的课程任务', description: source.description, content: source.content, images: source.images, tags: source.tags })
  if (kind === 'assignments') expect(body.questions).toEqual(source.questions)
  for (const field of ['id', 'startTime', 'deadline', 'endTime', 'status', 'submissions', 'mySubmission', '_count', 'allowAnonymous', 'publicToken']) expect(body[field]).toBeUndefined()
  expect(JSON.stringify(body)).not.toContain('private')
  expect(source).toEqual(original)
  expect(m.get.mock.calls.some(([path]) => path.includes('/submissions'))).toBe(false)
})

it.each([['assignments', AssignmentList], ['checkins', CheckinList]] as const)('rejects a mismatched %s source without pre-filling or creating a task', async (kind, Page) => {
  m.get.mockImplementation(async (path: string) => path === '/courses' ? { code: 0, data: { list: [targetCourse] } }
    : path === `/${kind}/old-task?courseId=source` ? { code: 0, data: { ...source, course: { ...sourceCourse, creatorId: 'other' } } }
      : { code: 0, data: { list: path.includes('courseId=target') ? [] : [source], total: 1, tags: [] } })
  mount(kind,Page)
  fireEvent.click(await screen.findByRole('button', { name: '使用此内容' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('无法复用此任务')
  expect(screen.queryByLabelText('选择课程 *')).toBeNull()
  expect(m.post).not.toHaveBeenCalled()
})
