import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AssessmentWorkbench from './AssessmentWorkbench'
const { get, host } = vi.hoisted(() => ({ get: vi.fn(), host: { training: true } }))
vi.mock('../../api/client', () => ({ default: { get } }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'trainer' } }) }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => ({ organizations: [], active: null, activeLoading: false }) }))
vi.mock('../../training/context', () => ({ isTrainingHost: () => host.training }))
beforeEach(() => { get.mockReset(); host.training = true })
describe('training results course context beyond the resource catalog page', () => {
 it.each([['trainer', true], ['other-trainer', false]])('verifies the exact course owner %s before offering the option', async (owner, allowed) => {
  get.mockImplementation(async (url: string) => {
   if (url === '/questionnaire-products/resources') return { code: 0, data: { courses: [{ id: 'first-page', title: '目录中的课程' }] } }
   if (url === '/courses/later-course') return { code: 0, data: { id: 'later-course', title: '第101门课程', creatorId: owner, isLibrary: false } }
   return { code: 0, data: { course: { id: 'later-course', title: '第101门课程' }, list: [], quality: [], pageSize: 20, total: 0 } }
  })
  render(<MemoryRouter initialEntries={['/assessment-workbench?courseId=later-course']}><AssessmentWorkbench /></MemoryRouter>)
  await waitFor(() => expect(get).toHaveBeenCalledWith('/courses/later-course'))
  if (allowed) expect(await screen.findByRole('option', { name: '第101门课程' })).toBeInTheDocument()
  else expect(screen.queryByRole('option', { name: '第101门课程' })).not.toBeInTheDocument()
  expect(screen.queryByText('群体概览与纵向变化')).not.toBeInTheDocument()
 })
})

describe('Training unified assessment results', () => {
 const overview = {
  course: { id: 'course', title: '测试课程' }, page: 1, pageSize: 20, total: 1,
  countMeaning: '已交卷次数为分母；不去重为人数。', qualityHasMore: true,
  list: [{ id: 'assessment', name: '综合学习测评', status: 'PUBLISHED', productKind: 'QUESTIONNAIRE', attempts: { COMPLETED: 7, IN_PROGRESS: 2 } }],
  quality: [{ id: 'cognitive-attempt', participant: '合成学员', title: '独立认知记录', status: 'COMPLETED', qualityState: 'interpretable', finishedAt: null, reportHref: '/cognitive/report' }],
 }
 const mockOverview = () => get.mockImplementation(async (url: string) => ({ code: 0, data: url === '/questionnaire-products/resources' ? { courses: [{ id: 'course', title: '测试课程' }] } : overview }))

 it('keeps report links and count meaning, without a separate cognitive panel or cognitive-only pages', async () => {
  mockOverview()
  render(<MemoryRouter initialEntries={['/assessment-workbench?courseId=course&view=summary']}><AssessmentWorkbench /></MemoryRouter>)
  expect(await screen.findByText('综合学习测评')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '认知任务完成与质量' })).not.toBeInTheDocument()
  expect(screen.queryByText('独立认知记录')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: '查看作答与获授权报告' })).toHaveAttribute('href', '/composite-assessments/assessment/results?courseId=course&returnTo=%2Fassessment-workbench%3FcourseId%3Dcourse%26view%3Dsummary')
  expect(screen.getByText(overview.countMeaning)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
 })

 it('guides course selection before loading an overview', async () => {
  mockOverview()
  render(<MemoryRouter><AssessmentWorkbench /></MemoryRouter>)
  await screen.findByRole('option', { name: '测试课程' })
  expect(screen.getByRole('heading', { name: '从一门课程开始' })).toBeInTheDocument()
  expect(get).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: '刷新课程概览' })).toBeDisabled()
 })

 it('retains the separate cognitive quality view outside Training', async () => {
  host.training = false
  mockOverview()
  render(<MemoryRouter initialEntries={['/assessment-workbench?courseId=course']}><AssessmentWorkbench /></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: '认知任务完成与质量' })).toBeInTheDocument()
  expect(screen.getByText('合成学员 · 独立认知记录')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '下一页' })).not.toBeDisabled()
 })
})
