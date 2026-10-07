import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  user: { id: 'officer-a' }, confirm: vi.fn(),
  api: { templates: vi.fn(), previewPublication: vi.fn(), publish: vi.fn(), consents: vi.fn(), grant: vi.fn() },
}))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }))
vi.mock('../../../api/parents', () => ({ parentsApi: state.api }))
vi.mock('../../../components/staff-ui/useStaffFeedback', () => ({ useStaffFeedback: () => ({ confirm: state.confirm, feedback: null }) }))
vi.mock('../ParentReportView', () => ({ default: ({ report }: { report: { title: string } }) => <p>{report.title}</p> }))
import ParentBatchPreparation from '../ParentBatchPreparation'

const rows = [{ id: 'a', title: '报告 A' }, { id: 'b', title: '报告 B' }]
const preview = (id: string) => ({ artifactId: id, projection: { title: 'PRIVATE_PREVIEW_' + id }, template: { key: 'approved', version: '1' }, previewHash: id.repeat(64), expectedVersion: 1, commandKey: crypto.randomUUID(), allowedActions: ['PUBLISH'] })
beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear(); state.user = { id: 'officer-a' }
  state.confirm.mockResolvedValue(true)
  state.api.templates.mockResolvedValue({ list: [{ key: 'approved', version: '1', title: '获批摘要' }] })
  state.api.previewPublication.mockImplementation(async id => preview(id))
  state.api.publish.mockResolvedValue({})
  state.api.consents.mockResolvedValue({ list: [] })
})
async function selectAll() {
  const user = userEvent.setup()
  for (const row of rows) { await user.click(screen.getByRole('checkbox', { name: row.title })); await waitFor(() => expect(screen.getByRole('checkbox', { name: row.title })).toBeChecked()) }
  await user.click(screen.getByRole('button', { name: '准备选中报告的预览' }))
  await screen.findByText('PRIVATE_PREVIEW_b')
  return user
}

describe('parent batch publication preserves individual authority', () => {
  it('requires each preview check and retries only failed records with the same command identity', async () => {
    state.api.publish.mockImplementation(async value => { if (value.artifactId === 'b') throw { message: '关系已撤回' }; return {} })
    render(<ParentBatchPreparation rows={rows} scope="org-a" />)
    const user = await selectAll()
    expect(screen.getByRole('button', { name: '发布已逐份核对的摘要' })).toBeDisabled()
    for (const checkbox of screen.getAllByRole('checkbox', { name: '已核对本份家长摘要的内容与受众' })) await user.click(checkbox)
    const stored = Object.values(sessionStorage).join('')
    expect(stored).not.toContain('PRIVATE_PREVIEW')
    await user.click(screen.getByRole('button', { name: '发布已逐份核对的摘要' }))
    await screen.findByText('关系已撤回')
    expect(screen.getByText('已发布，等待学生同意后逐份授权')).toBeInTheDocument()
    expect(state.api.publish).toHaveBeenCalledTimes(2)
    const identity = state.api.publish.mock.calls[1][0].commandKey
    state.api.publish.mockResolvedValue({})
    await user.click(screen.getByRole('button', { name: '发布已逐份核对的摘要' }))
    await waitFor(() => expect(state.api.publish).toHaveBeenCalledTimes(3))
    expect(state.api.publish.mock.calls[2][0]).toMatchObject({ artifactId: 'b', commandKey: identity })
    expect(state.api.grant).not.toHaveBeenCalled()
  })

  it('requires an explicit eligible consent for grants and preserves permission errors', async () => {
    const granted = { id: 'consent', relationshipId: 'relationship', parentName: '家长甲', commandKey: crypto.randomUUID(), allowedActions: ['GRANT'] }
    const denied = { ...granted, id: 'denied-consent', parentName: '家长乙', commandKey: crypto.randomUUID() }
    state.api.consents.mockResolvedValue({ list: [granted, denied] })
    state.api.grant.mockImplementation(async (_artifact, option) => { if (option.id === denied.id) throw { message: '学生已撤回本版本同意' }; return {} })
    render(<ParentBatchPreparation rows={rows.slice(0, 1)} scope="org-a" />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: '报告 A' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '刷新学生同意' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '刷新学生同意' }))
    await screen.findByRole('checkbox', { name: /接收家长：家长甲/ })
    expect(screen.getByRole('button', { name: '授权选中同意记录' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /接收家长：家长甲/ }))
    await user.click(screen.getByRole('checkbox', { name: /接收家长：家长乙/ }))
    await user.click(screen.getByRole('button', { name: '授权选中同意记录' }))
    await screen.findByText('学生已撤回本版本同意')
    expect(screen.getByText('已授权给 家长甲')).toBeInTheDocument()
    expect(state.api.grant).toHaveBeenCalledWith('a', granted)
    expect(state.api.publish).not.toHaveBeenCalled()
  })

  it('drops stale private previews after focus invalidates the current authority', async () => {
    let resolve!: (value: unknown) => void
    state.api.previewPublication.mockReturnValue(new Promise(value => { resolve = value }))
    render(<ParentBatchPreparation rows={rows.slice(0, 1)} scope="org-a" />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: '报告 A' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '准备选中报告的预览' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '准备选中报告的预览' }))
    fireEvent.focus(window)
    await act(async () => { resolve(preview('a')) })
    expect(screen.queryByText('PRIVATE_PREVIEW_a')).not.toBeInTheDocument()
    expect(state.api.publish).not.toHaveBeenCalled()
  })

  it('does not submit a confirmation captured before focus or organization changes', async () => {
    let confirm!: (value: boolean) => void
    state.confirm.mockReturnValue(new Promise(resolve => { confirm = resolve }))
    render(<ParentBatchPreparation rows={rows} scope="org-a" />)
    const user = await selectAll()
    await user.click(screen.getAllByRole('checkbox', { name: '已核对本份家长摘要的内容与受众' })[0])
    await user.click(screen.getByRole('button', { name: '发布已逐份核对的摘要' }))
    fireEvent.focus(window)
    await act(async () => confirm(true))
    expect(state.api.publish).not.toHaveBeenCalled()
  })

  it('clears selected content on principal changes and scopes persisted opaque metadata', async () => {
    const view = render(<ParentBatchPreparation rows={rows} scope="org-a" />)
    await selectAll()
    expect(sessionStorage.getItem('parent-batch:officer-a:a')).not.toBeNull()
    state.user = { id: 'officer-b' }
    view.rerender(<ParentBatchPreparation rows={rows} scope="org-a" />)
    expect(screen.queryByText('PRIVATE_PREVIEW_a')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '报告 A' })).not.toBeChecked()
    expect(sessionStorage.getItem('parent-batch:officer-b:a')).toBeNull()
  })
})
