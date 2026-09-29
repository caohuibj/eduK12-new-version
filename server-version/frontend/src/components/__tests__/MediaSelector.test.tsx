import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MediaSelector from '../MediaSelector'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../../api/client', () => ({ default: { get }, ensureCsrfToken: vi.fn(), sessionAxios: { post } }))

describe('MediaSelector', () => {
  beforeEach(() => { get.mockReset(); post.mockReset(); get.mockResolvedValue({ code: 0, data: { list: [] } }) })

  it('selects a library record with the keyboard and preserves its asset identity', async () => {
    get.mockResolvedValue({ code: 0, data: { list: [{ id: 'video-1', title: 'Sample video', fileSize: 1024, processedAssetId: 'asset-1', url: '/clip.mp4' }] } })
    const user = userEvent.setup()
    const onSelect = vi.fn(), onClose = vi.fn()
    render(<MediaSelector isOpen onClose={onClose} onSelect={onSelect} type="video" />)
    const record = await screen.findByRole('button', { name: /Sample video/ })
    record.focus()
    await user.keyboard(' ')
    expect(record).toHaveAttribute('aria-pressed', 'true')
    screen.getByRole('button', { name: '选择' }).focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'video-1', assetId: 'asset-1', url: '/clip.mp4' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('announces upload progress and errors without changing the upload request contract', async () => {
    let reject!: (reason: Error) => void
    post.mockImplementation((_url, _body, options) => {
      options.onUploadProgress({ loaded: 5, total: 10 })
      return new Promise((_, no) => { reject = no })
    })
    const user = userEvent.setup()
    const { container } = render(<MediaSelector isOpen onClose={vi.fn()} onSelect={vi.fn()} type="video" />)
    await user.click(screen.getByRole('button', { name: '上传' }))
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [new File(['clip'], 'clip.mp4', { type: 'video/mp4' })] } })
    const uploadButtons = screen.getAllByRole('button', { name: '上传' })
    await user.click(uploadButtons[uploadButtons.length - 1])
    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
    expect(post).toHaveBeenCalledWith('/videos/upload', expect.any(FormData), expect.objectContaining({ withCredentials: true }))
    await act(async () => reject(new Error('Upload failed')))
    expect(await screen.findByRole('alert')).toHaveTextContent('Upload failed')
    expect(screen.getByRole('button', { name: '取消' })).toBeEnabled()
  })

  it.each(['video', 'image', 'document'] as const)('distinguishes %s failure, retry, empty and filtered empty', async type => {
    get.mockRejectedValueOnce(new Error('Connection failed'))
    const user = userEvent.setup()
    render(<MediaSelector isOpen onClose={vi.fn()} onSelect={vi.fn()} type={type} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection failed')
    expect(screen.queryByText(/^暂无/)).toBeNull()
    expect(screen.getByRole('button', { name: '选择' })).toBeDisabled()
    await user.click(screen.getByText('重试'))
    expect(await screen.findByText(/^暂无/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('搜索素材'), 'unmatched')
    expect(screen.getByText(/^没有符合搜索条件/)).toBeInTheDocument()
  })

  it('opens the picker exactly once for Enter and Space on reselect without clearing the selected file', async () => {
    const user = userEvent.setup()
    const { container } = render(<MediaSelector isOpen onClose={vi.fn()} onSelect={vi.fn()} type="video" />)
    await user.click(screen.getByRole('button', { name: '上传' }))
    const input = container.querySelector<HTMLInputElement>('input[type=file]')!
    fireEvent.change(input, { target: { files: [new File(['clip'], 'long-video.mp4', { type: 'video/mp4' })] } })
    const click = vi.spyOn(input, 'click').mockImplementation(() => {})
    const reselect = screen.getByRole('button', { name: '重新选择' })
    expect(reselect.parentElement?.closest('button,[role=button]')).toBeNull()
    reselect.focus()
    await user.keyboard('{Enter}')
    expect(click).toHaveBeenCalledTimes(1)
    await user.keyboard(' ')
    expect(click).toHaveBeenCalledTimes(2)
    expect(screen.getByText('long-video.mp4')).toBeInTheDocument()
  })

  it.each([
    ['https://www.bilibili.com/video/BVtest', 'bilibili'],
    ['https://www.youtube.com/watch?v=test', 'youtube'],
    ['https://example.com/video.mp4', 'external'],
  ])('accepts supported HTTPS links: %s', async (url, source) => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<MediaSelector isOpen onClose={vi.fn()} onSelect={onSelect} type="video" />)
    await user.click(screen.getByText('外部链接'))
    await user.type(screen.getByLabelText('HTTPS 视频链接'), url)
    await user.click(screen.getByRole('button', { name: '添加' }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ url, source }))
  })

  it('rejects embedded HTML and keeps selection disabled after an API error response', async () => {
    get.mockResolvedValue({ code: 1, message: 'Unavailable' })
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<MediaSelector isOpen onClose={vi.fn()} onSelect={onSelect} type="video" />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unavailable'))
    await user.click(screen.getByText('外部链接'))
    await user.type(screen.getByLabelText('HTTPS 视频链接'), '<iframe src="https://example.com"></iframe>')
    await user.click(screen.getByRole('button', { name: '添加' }))
    expect(screen.getByText(/请输入有效的 HTTPS/)).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })
})
