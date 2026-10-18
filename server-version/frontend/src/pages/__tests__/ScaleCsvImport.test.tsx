import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const api = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('../../api/client', () => ({ default: api }))
import ScaleCsvImport from '../ScaleCsvImport'
const content = 'item_code,prompt,reverse,score_keys,response_set_key\nQ2,Question,true,total,default'
const preview = { digest: 'a'.repeat(64), previewToken: 'b'.repeat(64), previewExpiresAt: 1792282200000, expectedUpdatedAt: '2026-10-18T00:00:00.000Z', count: 1, totalItems: 2, responseSetKey: 'default', responseSet: { options: [{ value: 'yes', label: 'Yes', score: 1 }] }, scores: [{ key: 'total', label: 'Total', aggregation: 'sum' }], items: [{ itemCode: 'Q2', content: 'Question', reverse: true, scoreKeys: ['total'] }] }
const props = () => ({ id: 'scale', revision: preview.expectedUpdatedAt, disabled: false, onImported: vi.fn(), onBusy: vi.fn() })
beforeEach(() => vi.clearAllMocks())
describe('Scale CSV import confirmation', () => {
  it('requires preview and sends the exact content, digest and revision on confirmation', async () => {
    api.post.mockResolvedValueOnce({ code: 0, data: preview }).mockResolvedValueOnce({ code: 0, data: { id: 'scale', importedCount: 1 } })
    const p = props(), user = userEvent.setup(); render(<ScaleCsvImport {...p} />)
    expect(screen.queryByRole('button', { name: '确认导入并保存' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('CSV 内容'), { target: { value: content } })
    await user.click(screen.getByRole('button', { name: '预检导入' }))
    expect(await screen.findByText(/反向计分/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认导入并保存' }))
    await screen.findByText(/已导入并保存 1 道题/)
    expect(api.post).toHaveBeenNthCalledWith(2, '/scales/scale/import/confirm', { content, expectedUpdatedAt: preview.expectedUpdatedAt, digest: preview.digest, previewToken: preview.previewToken, previewExpiresAt: preview.previewExpiresAt })
    expect(p.onImported).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('CSV 内容')).toHaveValue(content)
  })
  it('invalidates confirmation when content or revision changes', async () => {
    api.post.mockResolvedValue({ code: 0, data: preview }); const p = props(), user = userEvent.setup(); const view = render(<ScaleCsvImport {...p} />)
    fireEvent.change(screen.getByLabelText('CSV 内容'), { target: { value: content } }); await user.click(screen.getByRole('button', { name: '预检导入' }))
    await screen.findByRole('button', { name: '确认导入并保存' })
    fireEvent.change(screen.getByLabelText('CSV 内容'), { target: { value: content + '\n' } })
    expect(screen.queryByRole('button', { name: '确认导入并保存' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '预检导入' })); await screen.findByRole('button', { name: '确认导入并保存' })
    view.rerender(<ScaleCsvImport {...p} revision="2026-10-18T00:00:01.000Z" />)
    expect(screen.queryByRole('button', { name: '确认导入并保存' })).not.toBeInTheDocument()
  })
  it('retains input and clears confirmation on a conflict; never retries automatically', async () => {
    api.post.mockResolvedValueOnce({ code: 0, data: preview }).mockRejectedValueOnce(Object.assign(new Error('版本已变化'), { status: 409 }))
    const p = props(), onFailure = vi.fn(), user = userEvent.setup(); render(<ScaleCsvImport {...p} onFailure={onFailure} />)
    fireEvent.change(screen.getByLabelText('CSV 内容'), { target: { value: content } }); await user.click(screen.getByRole('button', { name: '预检导入' })); await user.click(await screen.findByRole('button', { name: '确认导入并保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('版本已变化')
    expect(screen.getByLabelText('CSV 内容')).toHaveValue(content)
    expect(api.post).toHaveBeenCalledTimes(2); expect(p.onImported).not.toHaveBeenCalled(); expect(onFailure).toHaveBeenCalledOnce()
  })
  it('serializes double clicks and ignores late responses after unmount', async () => {
    let resolve!: (value: unknown) => void; api.post.mockImplementation(() => new Promise(r => { resolve = r }))
    const p = props(); const view = render(<ScaleCsvImport {...p} />)
    fireEvent.change(screen.getByLabelText('CSV 内容'), { target: { value: content } }); const button = screen.getByRole('button', { name: '预检导入' }); fireEvent.click(button); fireEvent.click(button)
    expect(api.post).toHaveBeenCalledOnce(); view.unmount(); resolve({ code: 0, data: preview })
    await waitFor(() => expect(p.onBusy).toHaveBeenLastCalledWith(false)); expect(p.onImported).not.toHaveBeenCalled()
  })
})
