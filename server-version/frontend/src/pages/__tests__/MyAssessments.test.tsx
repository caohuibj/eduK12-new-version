import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MyAssessments from '../MyAssessments'

vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>({user:{role:'PARENT'}})}))
const mocks = vi.hoisted(() => ({ get: vi.fn(), start: vi.fn(), acceptConsent: vi.fn(), training: false }))
vi.mock('../../api/client', () => ({ default: { get: mocks.get } }))
vi.mock('../../api/runs', () => ({ runApi: { start: mocks.start, acceptConsent: mocks.acceptConsent } }))
vi.mock('../../training/context', () => ({ isTrainingHost: () => mocks.training }))
const task = { taskId: 'run:e1', sourceType: 'ORGANIZATION_RUN', sourceId: 'run1', title: '课堂体验', state: 'ASSIGNED', resultAvailability: 'PENDING',
  runTask: { executionId: 'e1', runId: 'run1', organizationId: 'org1', status: 'ASSIGNED', consentRequired: true, consentPurpose: '课堂体验反馈', consentVisibility: '仅群体汇总', claimState: null } }
beforeEach(() => { vi.clearAllMocks(); mocks.training = false; mocks.get.mockResolvedValue({ code: 0, data: { list: [task], pendingCount: 1, truncated: false } }) })
describe('My Assessments', () => {
  it('requires consent before launching and preserves the assigned execution', async () => {
    render(<MemoryRouter><MyAssessments /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: '开始测评' }))
    expect(await screen.findByText('请先阅读并同意本次测评说明')).toBeInTheDocument()
    expect(mocks.start).not.toHaveBeenCalled()
    expect(screen.queryByRole('link',{name:'选择适合自己的测评'})).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox'))
    mocks.start.mockResolvedValue({ state: 'IN_PROGRESS' })
    fireEvent.click(screen.getByRole('button', { name: '开始测评' }))
    await waitFor(() => expect(mocks.acceptConsent).toHaveBeenCalledWith(task.runTask))
    expect(mocks.start).toHaveBeenCalledWith(task.runTask)
  })
  it('groups teacher executions by campaign and gives safe completion feedback without score links', async () => {
    mocks.get.mockResolvedValue({ code: 0, data: { list: [{ ...task, state: 'COMPLETED', resultAvailability: 'COMPLETION_ONLY', feedback: { title: '感谢你分享本次体验', message: '不向你展示被评价者的个人得分或排名' } }, { ...task, taskId: 'run:e2' }], pendingCount: 1, truncated: false } })
    render(<MemoryRouter><MyAssessments /></MemoryRouter>)
    expect(await screen.findByText('已完成 1 / 2')).toBeInTheDocument()
    expect(screen.getByText(/不向你展示被评价者的个人得分或排名/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '我的报告' })).not.toBeInTheDocument()
  })
  it('opens only the server-provided own feedback summary and hides stale metrics on failure', async () => {
    mocks.get.mockImplementation(async (url:string) => url === '/my-assessments' ? {code:0,data:{list:[{...task,state:'COMPLETED',summaryTarget:'/my-assessments/results/e1'}],pendingCount:0}} : url === '/my-assessments/results/e1' ? {code:0,data:{state:'READY',metrics:{score:4}}} : {code:0,data:{list:[]}})
    render(<MemoryRouter><MyAssessments /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button',{name:'查看本次反馈'}))
    expect(await screen.findByText('指标 1：4')).toBeInTheDocument()
    mocks.get.mockRejectedValue(new Error('报告权限已变化'))
    fireEvent.click(screen.getByRole('button',{name:'查看本次反馈'}))
    expect(await screen.findByText('报告权限已变化')).toBeInTheDocument()
    expect(screen.queryByText('指标 1：4')).not.toBeInTheDocument()
  })
  it('clears the previous subject and actions when refreshing authority fails', async () => {
    mocks.get.mockResolvedValue({ code: 0, data: { list: [{ ...task, subject: { role: 'STUDENT', displayName: 'A' } }], pendingCount: 1, truncated: false } })
    render(<MemoryRouter><MyAssessments /></MemoryRouter>)
    expect(await screen.findByText('测评对象：A')).toBeInTheDocument()
    mocks.get.mockRejectedValueOnce(new Error('权限已撤销'))
    fireEvent.click(screen.getByRole('button', { name: '刷新任务' }))
    expect(await screen.findByText('权限已撤销')).toBeInTheDocument()
    expect(screen.queryByText('测评对象：A')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '开始测评' })).not.toBeInTheDocument()
  })
  it('does not retain stale tasks after an initial failed read', async () => {
    mocks.get.mockRejectedValue(new Error('权限已变化'))
    render(<MemoryRouter><MyAssessments /></MemoryRouter>)
    expect(await screen.findByText('权限已变化')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '开始测评' })).not.toBeInTheDocument()
  })
})


it('shows an unsatisfied course submission as saved with its report, not a launch', async () => {
  mocks.get.mockResolvedValue({ code: 0, data: { list: [{ taskId: 'course:q', sourceType: 'COURSE', title: '课程问卷', state: 'SUBMITTED_NOT_SATISFIED', launchTarget: null, reportTarget: '/student/composite/attempts/a/report', resultAvailability: 'REPORT' }], pendingCount: 0, truncated: false } })
  render(<MemoryRouter><MyAssessments /></MemoryRouter>)
  expect(await screen.findByText('已交卷，任务未达成')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '我的报告' })).toHaveAttribute('href', '/student/composite/attempts/a/report')
  expect(screen.queryByRole('link', { name: '进入测评' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '开始测评' })).not.toBeInTheDocument()
})

describe('Training course report wording', () => {
  it.each(['COMPLETED', 'SUBMITTED_NOT_SATISFIED'])('keeps %s receipts and server links without implying feedback is already open', async state => {
    mocks.training = true
    const reportTarget = '/student/composite/attempts/a/report'
    mocks.get.mockImplementation(async (url: string) => {
      if (url === '/my-assessments') return { code: 0, data: { list: [{ taskId: 'course:q', sourceType: 'COURSE', sourceId: 'q', title: '课程问卷', state, launchTarget: null, reportTarget, resultAvailability: 'REPORT' }], pendingCount: 0, truncated: false } }
      if (url === '/my-assessments/catalog') return { code: 0, data: { list: [] } }
      throw new Error('unexpected additional request')
    })
    render(<MemoryRouter><MyAssessments /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: '查看测评状态/报告' })).toHaveAttribute('href', reportTarget)
    expect(screen.getByText(/待完成测评：0。开始、继续作答，查看测评状态与可用反馈/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '我的报告' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '进入测评' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '开始测评' })).not.toBeInTheDocument()
    if (state === 'SUBMITTED_NOT_SATISFIED') {
      expect(screen.getByText('已交卷，任务未达成')).toBeInTheDocument()
      expect(screen.getByText('本次作答已保存并计入次数，可查看测评状态与反馈开放情况。')).toBeInTheDocument()
    } else {
      expect(screen.getByText('已完成')).toBeInTheDocument()
      expect(screen.getByText('你已完成本次测评')).toBeInTheDocument()
    }
    expect(mocks.get.mock.calls.map(([url]) => url)).toEqual(['/my-assessments', '/my-assessments/catalog'])
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it.each([
    [false, 'COURSE', 'COMPLETED'],
    [false, 'COURSE', 'SUBMITTED_NOT_SATISFIED'],
    [true, 'ORGANIZATION_RUN', 'COMPLETED'],
    [true, 'SELF_SERVICE', 'COMPLETED'],
  ] as const)('preserves existing report wording outside Training course tasks (%s, %s, %s)', async (training, sourceType, state) => {
    mocks.training = training
    const reportTarget = '/existing-authorized-report'
    mocks.get.mockImplementation(async (url: string) => url === '/my-assessments'
      ? { code: 0, data: { list: [{ taskId: 'existing', sourceType, sourceId: 'q', title: '既有测评', state, launchTarget: null, reportTarget, resultAvailability: 'REPORT' }], pendingCount: 0, truncated: false } }
      : { code: 0, data: { list: [] } })
    render(<MemoryRouter><MyAssessments /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: '我的报告' })).toHaveAttribute('href', reportTarget)
    expect(screen.queryByRole('link', { name: '查看测评状态/报告' })).not.toBeInTheDocument()
    if (state === 'SUBMITTED_NOT_SATISFIED') expect(screen.getByText('本次作答已保存并计入次数，可查看本次报告。')).toBeInTheDocument()
    if (!training) expect(screen.getByText(/开始、继续作答和查看自己的报告/)).toBeInTheDocument()
    expect(mocks.get.mock.calls.map(([url]) => url)).toEqual(['/my-assessments', '/my-assessments/catalog'])
  })
})
