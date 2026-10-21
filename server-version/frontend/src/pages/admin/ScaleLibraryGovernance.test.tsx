import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ScaleLibraryGovernance from './ScaleLibraryGovernance'
const api = vi.hoisted(() => ({ catalog: vi.fn(), catalogDetail: vi.fn(), capabilities: vi.fn(), submissionDetail: vi.fn(), submissions: vi.fn(), entries: vi.fn(), review: vi.fn(), setStatus: vi.fn(), recipients: vi.fn(), grants: vi.fn(), grant: vi.fn(), revoke: vi.fn() }))
vi.mock('../../api/scaleLibraryGovernance', () => ({ governanceApi: () => api, submissionStatusLabel: { SUBMITTED: '待审核' } }))
const metadata = { title: '范围内量表', author: '作者', copyright: '自有', applicability: '研究', scoringDescription: '求和', reportDescription: '描述性' }
const application = { id: 'application', releaseId: 'release', metadata, version: 3, status: 'SUBMITTED', product: 'TRAINING', supportedEntrypoints: ['TRAINING', 'SURVEY'] }
const entry = { ...application, id: 'entry', status: 'ACTIVE' }
beforeEach(() => {
  vi.resetAllMocks(); api.submissions.mockResolvedValue({ list: [application] }); api.entries.mockResolvedValue({ list: [entry] }); api.setStatus.mockResolvedValue(entry)
  api.catalog.mockImplementation(async (page = 1) => ({ schemaVersion: 1, page, pageSize: 25, hasMore: false, list: (await api.entries()).list.map((row: typeof entry) => ({ catalogId: row.id, origin: 'AUTHORED', title: row.metadata.title, exactVersion: { origin: 'AUTHORED', entryId: row.id, releaseId: row.releaseId }, availability: { status: 'RESTRICTED', reasons: [] }, authored: row })) }))
  api.capabilities.mockResolvedValue({ systemAdmin: false, canReview: false, reviewGrants: [], distributionGrants: [{ grantId: 'distribute', product: 'TRAINING', releaseIds: ['release'] }] })
})
describe('Scale library system review versus entrance distribution', () => {
  it('does not mistake entrance distribution authority for review authority', async () => {
    render(<MemoryRouter><ScaleLibraryGovernance /></MemoryRouter>)
    await screen.findByText('范围内量表 · 待审核')
    expect(screen.queryByRole('button', { name: '批准精确版本入库' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '紧急停用（影响运行）' })).not.toBeInTheDocument()
    expect(api.review).not.toHaveBeenCalled()
  })
  it('limits distribution to compatible entrances and uses the scoped recipient API', async () => {
    const surveyEntry = { ...entry, supportedEntrypoints: ['SURVEY'], compatibilityReasons: { TRAINING: '当前Survey版本不兼容Training' } }
    api.entries.mockResolvedValue({ list: [surveyEntry] })
    api.capabilities.mockResolvedValue({ systemAdmin: false, canReview: false, reviewGrants: [], distributionGrants: [{ grantId: 'survey-distribution', product: 'SURVEY', releaseIds: ['release'] }] })
    api.grants.mockResolvedValue({ list: [] }); api.recipients.mockResolvedValue({ list: [{ id: 'researcher', username: 'verified-researcher' }], page: 1, hasMore: false }); api.grant.mockResolvedValue({ id: 'use-grant' })
    render(<MemoryRouter><ScaleLibraryGovernance /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: '查看 / 分配只读使用权限' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '读取可见授权对象' })).toBeEnabled())
    expect(screen.getByRole('option', { name: 'Training' })).toBeDisabled()
    expect(screen.getByText('TRAINING：当前Survey版本不兼容Training')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '读取可见授权对象' }))
    await screen.findByRole('option', { name: /verified-researcher/ })
    expect(api.recipients).toHaveBeenCalledWith('entry', 'SURVEY', 1, '', 'survey-distribution')
    fireEvent.change(screen.getByLabelText('授权对象'), { target: { value: 'researcher' } })
    fireEvent.click(screen.getByRole('button', { name: '授予所选账号只读使用' }))
    await waitFor(() => expect(api.grant).toHaveBeenCalledWith('entry', 'researcher', 'SURVEY', expect.any(String), 'survey-distribution'))
  })
  it('shows registry and authored records together, preserves standard identity and pages using hasMore', async () => {
    const standard = { catalogId: 'standard:key:1', origin: 'STANDARD_REGISTRY', title: '标准原版', instrumentClass: 'STANDARD', exactVersion: { origin: 'STANDARD_REGISTRY', instrumentKey: 'key', instrumentVersion: '1' }, availability: { status: 'RESTRICTED', reasons: [] }, authorization: { mechanism: 'INSTRUMENT_AUTHORIZATION', useGrantStatus: 'NOT_EVALUATED', requiresRuntimeCheck: true }, standard: { construct: { constructDefinition: '原版构念' }, rights: { status: 'APPROVED' }, evidence: { coverageText: '原科学记录' } } }
    api.catalog.mockImplementation(async (page: number) => ({ schemaVersion: 1, page, pageSize: 25, hasMore: page === 1, list: page === 1 ? [standard, { catalogId: 'custom', origin: 'AUTHORED', title: entry.metadata.title, exactVersion: { origin: 'AUTHORED', entryId: 'entry', releaseId: 'release' }, authored: entry }] : [{ ...standard, catalogId: 'standard:key:2', title: '后续目录记录', exactVersion: { origin: 'STANDARD_REGISTRY', instrumentKey: 'key', instrumentVersion: '2' } }] }))
    api.catalogDetail.mockResolvedValue({ entry: standard })
    render(<MemoryRouter><ScaleLibraryGovernance /></MemoryRouter>)
    await screen.findByText('标准原版 · 标准量表（只读）')
    expect(screen.getByText('范围内量表 · 自编描述性量表 · 已收录')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /开始测评|施测/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '查看标准精确版本详情' }))
    expect(await screen.findByRole('region', { name: '公共量表精确版本详情' })).toHaveTextContent('STANDARD_REGISTRY')
    expect(api.catalogDetail).toHaveBeenCalledWith(standard)
    fireEvent.click(screen.getByRole('button', { name: '目录下一页' }))
    await screen.findByText('后续目录记录 · 标准量表（只读）')
    expect(api.catalog).toHaveBeenCalledWith(2)
    expect(screen.getByRole('button', { name: '目录下一页' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '目录上一页' })).toBeEnabled()
  })
  it('requires inspecting frozen content before approval', async () => {
    api.capabilities.mockResolvedValue({ systemAdmin: true, canReview: true, reviewGrants: [], distributionGrants: [] })
    api.submissionDetail.mockResolvedValue({ ...application, snapshot: { definition: { items: ['frozen question'] } }, mediaManifest: { schemaVersion: 1, manifestHash: 'empty', releaseIds: ['release'], items: [] }, release: { releaseId: 'release', version: '1', contentHash: 'hash' }, dependencies: [] })
    render(<MemoryRouter><ScaleLibraryGovernance /></MemoryRouter>)
    const approve = await screen.findByRole('button', { name: '批准精确版本入库' })
    fireEvent.change(screen.getByLabelText('审核、下架或撤权说明'), { target: { value: '资料完整' } })
    expect(approve).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '读取精确版本审核内容' }))
    await waitFor(() => expect(approve).toBeEnabled())
    expect(screen.getByText(/frozen question/)).toBeInTheDocument()
  })
  it('requires reason and a distinct confirmation before emergency disable', async () => {
    api.capabilities.mockResolvedValue({ systemAdmin: true, canReview: true, reviewGrants: [], distributionGrants: [] })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<MemoryRouter><ScaleLibraryGovernance /></MemoryRouter>)
    const button = await screen.findByRole('button', { name: '紧急停用（影响运行）' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('审核、下架或撤权说明'), { target: { value: '内容风险' } })
    fireEvent.click(button)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('正在进行的任务或波次'))
    expect(api.setStatus).not.toHaveBeenCalled()
    confirm.mockReturnValue(true); fireEvent.click(button)
    await waitFor(() => expect(api.setStatus).toHaveBeenCalledWith(entry, 'EMERGENCY_DISABLED', '内容风险', undefined))
    confirm.mockRestore()
  })
})
