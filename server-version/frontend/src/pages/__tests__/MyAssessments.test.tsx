import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MyAssessments from '../MyAssessments'

vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>({user:{role:'PARENT'}})}))
const mocks = vi.hoisted(() => ({ get: vi.fn(), start: vi.fn(), acceptConsent: vi.fn() }))
vi.mock('../../api/client', () => ({ default: { get: mocks.get } }))
vi.mock('../../api/runs', () => ({ runApi: { start: mocks.start, acceptConsent: mocks.acceptConsent } }))
const task = { taskId: 'run:e1', sourceType: 'ORGANIZATION_RUN', sourceId: 'run1', title: '课堂体验', state: 'ASSIGNED', resultAvailability: 'PENDING',
  runTask: { executionId: 'e1', runId: 'run1', organizationId: 'org1', status: 'ASSIGNED', consentRequired: true, consentPurpose: '课堂体验反馈', consentVisibility: '仅群体汇总', claimState: null } }
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue({ code: 0, data: { list: [task], pendingCount: 1, truncated: false } }) })
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
    mocks.get.mockResolvedValue({ code: 0, data: { list: [{ ...task, state: 'COMPLETED', resultAvailability: 'COMPLETION_ONLY' }, { ...task, taskId: 'run:e2' }], pendingCount: 1, truncated: false } })
    render(<MemoryRouter><MyAssessments /></MemoryRouter>)
    expect(await screen.findByText('已完成 1 / 2')).toBeInTheDocument()
    expect(screen.getByText(/不用于向你展示被评价者的个人得分或排名/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '我的报告' })).not.toBeInTheDocument()
  })
  it('does not retain stale tasks after an initial failed read', async () => {
    mocks.get.mockRejectedValue(new Error('权限已变化'))
    render(<MemoryRouter><MyAssessments /></MemoryRouter>)
    expect(await screen.findByText('权限已变化')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '开始测评' })).not.toBeInTheDocument()
  })
})
