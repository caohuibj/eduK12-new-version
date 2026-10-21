import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TrainingScaleLibrarySubmission } from './TrainingScaleLibrarySubmission'
const api = vi.hoisted(() => ({ source: vi.fn(), submissions: vi.fn(), submit: vi.fn(), withdraw: vi.fn() }))
vi.mock('../../api/scaleLibraryGovernance', () => ({ governanceApi: () => api, submissionStatusLabel: { SUBMITTED: '待审核', WITHDRAWN: '已撤回', RETURNED: '已退回', APPROVED: '已批准入库' } }))
const metadata = { title: '自编量表', author: '作者来源', copyright: '自有版权', applicability: '研究用途', scoringDescription: '求和', reportDescription: '描述性' }
const source = { sourceId: 's', product: 'TRAINING', releases: [{ releaseId: 'release-v1', version: '1', title: '自编量表', eligible: true, mediaManifest: { schemaVersion: 1, manifestHash: 'empty-manifest', items: [], releaseIds: ['release-v1'] } }], defaults: metadata }
const open = async () => {
  fireEvent.click(screen.getByRole('button', { name: '申请进入共用库 / 查看申请状态' }))
  await waitFor(() => expect(api.source).toHaveBeenCalledWith('s'))
  fireEvent.click(await screen.findByRole('button', { name: '申请进入共用库', exact: true }))
  await screen.findByRole('option', { name: '自编量表 · v1' })
}
beforeEach(() => { vi.resetAllMocks(); api.source.mockResolvedValue(source); api.submissions.mockResolvedValue({ list: [] }); api.submit.mockResolvedValue({ id: 'application' }) })
describe('Training exact-version library submission', () => {
  it('is separate from private publication and sends only the selected immutable release with reused metadata', async () => {
    render(<TrainingScaleLibrarySubmission sourceId="s" />)
    expect(api.source).not.toHaveBeenCalled()
    await open()
    fireEvent.change(screen.getByLabelText('已发布版本'), { target: { value: 'release-v1' } })
    expect(screen.getByLabelText('版权与授权依据（沿用已有资料）')).toHaveAttribute('readonly')
    fireEvent.click(screen.getByRole('button', { name: '提交入库申请' }))
    await waitFor(() => expect(api.submit).toHaveBeenCalledWith('release-v1', metadata, expect.any(String), undefined))
    expect(screen.getByText(/批准不代表全员可用/)).toBeInTheDocument()
  })
  it('displays return reasons and blocks duplicate pending exact versions', async () => {
    api.submissions.mockResolvedValue({ list: [{ id: 'a', releaseId: 'release-v1', metadata, status: 'SUBMITTED' }, { id: 'b', releaseId: 'old', metadata, status: 'RETURNED', reason: '请补版权依据' }] })
    render(<TrainingScaleLibrarySubmission sourceId="s" />); await open()
    fireEvent.change(screen.getByLabelText('已发布版本'), { target: { value: 'release-v1' } })
    expect(screen.getByRole('button', { name: '提交入库申请' })).toBeDisabled()
    expect(screen.getByText('审核 / 撤回说明：请补版权依据')).toBeInTheDocument()
    expect(api.submit).not.toHaveBeenCalled()
  })
  it('requires explicit consent bound to a nonempty frozen media manifest', async () => {
    api.source.mockResolvedValue({ ...source, releases: [{ ...source.releases[0], mediaManifest: { schemaVersion: 1, manifestHash: 'media-manifest', releaseIds: ['release-v1'], items: [{ assetId: 'image', mimeType: 'image/png', contentHash: 'frozen-image-hash', sizeBytes: 120, assetVersion: '1', usages: ['item'], rights: 'AUTHOR_SHARED_FOR_BOUND_SCALE', dependencyReleaseIds: [] }] } }] })
    render(<TrainingScaleLibrarySubmission sourceId="s" />); await open()
    fireEvent.change(screen.getByLabelText('已发布版本'), { target: { value: 'release-v1' } })
    const submit = screen.getByRole('button', { name: '提交入库申请' })
    expect(submit).toBeDisabled()
    expect(screen.getByText('内容摘要：frozen-image-hash')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /确认我有权/ }))
    fireEvent.click(submit)
    await waitFor(() => expect(api.submit).toHaveBeenCalledWith('release-v1', metadata, expect.any(String), { manifestHash: 'media-manifest', shareWithAuthorizedUsers: true }))
  })
  it('fails closed when status cannot be loaded', async () => {
    api.source.mockRejectedValue(new Error('权限已撤销'))
    render(<TrainingScaleLibrarySubmission sourceId="s" />)
    fireEvent.click(screen.getByRole('button', { name: '申请进入共用库 / 查看申请状态' }))
    fireEvent.click(await screen.findByRole('button', { name: '申请进入共用库', exact: true }))
    expect(await screen.findByRole('alert')).toHaveTextContent('权限已撤销')
    expect(screen.getByRole('button', { name: '提交入库申请' })).toBeDisabled()
  })
})
