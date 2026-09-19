import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import OrganizationTasksPage from '../OrganizationTasksPage'
const api = vi.hoisted(() => ({ assignedTasks: vi.fn(), start: vi.fn(), acceptConsent: vi.fn() }))
vi.mock('../../../api/runs', () => ({ runApi: api }))
const task = { executionId: 'e1', organizationId: 'o1', runId: 'r1', runName: '学校测评', runStatus: 'PUBLISHED', status: 'ASSIGNED', claimState: null, resourceFamily: 'BUNDLE', resourceKey: 'test-only', resourceVersion: '1', consentRequired: true, consentPurpose: '观察评价', consentVisibility: 'PRIVATE_RESPONDENT' }
beforeEach(() => { vi.clearAllMocks(); api.assignedTasks.mockResolvedValue({ list: [task], truncated: false }); api.acceptConsent.mockResolvedValue({ accepted: true }) })
describe('assigned Organization tasks', () => {
  it('requires explicit consent before existing consent and START authorities', async () => {
    api.start.mockResolvedValue({ state: 'STARTED', runtimeBindingKind: 'COMPOSITE', runtimeBindingRef: 'attempt-1' })
    render(<MemoryRouter><OrganizationTasksPage /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: '开始任务' }))
    expect(api.start).not.toHaveBeenCalled()
    expect(api.acceptConsent).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: '开始任务' }))
    await waitFor(() => expect(api.acceptConsent).toHaveBeenCalledWith(task))
    expect(api.start).toHaveBeenCalledWith(task)
    expect(await screen.findByRole('link', { name: '进入测评' })).toHaveAttribute('href', '/relational/attempts/attempt-1?returnTo=%2Forganization-tasks')
  })
  it('recovers the same execution when START outcome is unknown', async () => {
    const unknown = { ...task, claimState: 'UNKNOWN' }
    api.assignedTasks.mockResolvedValue({ list: [unknown], truncated: false })
    api.start.mockResolvedValueOnce({ state: 'IN_PROGRESS', operationKey: 'same-operation' }).mockResolvedValueOnce({ state: 'STARTED', runtimeBindingKind: 'COMPOSITE', runtimeBindingRef: 'attempt-1' })
    render(<MemoryRouter><OrganizationTasksPage /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: '恢复同一任务' }))
    expect(await screen.findByText(/开始结果待确认/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '进入测评' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '恢复同一任务' }))
    expect(await screen.findByRole('link', { name: '进入测评' })).toBeInTheDocument()
    expect(api.start.mock.calls.map(call => call[0].executionId)).toEqual(['e1', 'e1'])
    expect(api.acceptConsent).not.toHaveBeenCalled()
  })
})
