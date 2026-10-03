import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pdf = vi.hoisted(() => ({ getDocument: vi.fn(), destroy: vi.fn().mockResolvedValue(undefined), render: vi.fn() }))
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: pdf.getDocument }))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/local-worker.mjs' }))
import PdfViewer from '../PdfViewer'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
  pdf.render.mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() })
  pdf.getDocument.mockReturnValue({ destroy: pdf.destroy, promise: Promise.resolve({ numPages: 1,
    getPage: vi.fn().mockResolvedValue({ getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale }), render: pdf.render }) }) })
})

describe('authorized PDF preview', () => {
  it('renders an authorized URL locally and makes zoom change the displayed page size', async () => {
    const user = userEvent.setup()
    const { container, unmount } = render(<PdfViewer isOpen onClose={vi.fn()} url="/api/assets/synthetic/content" title="合成文档" />)
    const canvas = await screen.findByLabelText('合成文档，第 1 页')
    await waitFor(() => expect(pdf.render).toHaveBeenCalled())
    expect(container.querySelector('iframe')).toBeNull()
    expect(pdf.getDocument).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/assets/synthetic/content' }))
    const initialWidth = parseFloat(canvas.style.width)
    await user.click(screen.getByRole('button', { name: '放大文档' }))
    expect(parseFloat(canvas.style.width)).toBeGreaterThan(initialWidth)
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
    unmount()
    expect(pdf.destroy).toHaveBeenCalledTimes(1)
  })
  it('shows a recoverable loading failure and retries without weakening access or download policy', async () => {
    pdf.getDocument.mockReturnValueOnce({ destroy: pdf.destroy, promise: Promise.reject(new Error('403')) })
    const user = userEvent.setup()
    render(<PdfViewer isOpen onClose={vi.fn()} url="/api/assets/synthetic/content" allowDownload={false} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('文档加载失败')
    expect(screen.queryByRole('link', { name: '下载文档' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试加载文档' }))
    expect(await screen.findByLabelText('PDF 文档，第 1 页')).toBeInTheDocument()
    expect(pdf.getDocument).toHaveBeenCalledTimes(2)
  })
})
