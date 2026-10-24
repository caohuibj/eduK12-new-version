import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionFetch } from '../../../api/client'
import { OnlineImageField, type AuthorImageAsset } from '../OnlineImageField'
import { AuthorPreviewMedia } from '../AuthorPreviewMedia'
import type { AssessmentImage } from '../../assessment-media/types'

vi.mock('../../../api/client', () => ({ sessionFetch: vi.fn() }))
const stored: AuthorImageAsset = { asset: { assetId: 'private-image', contentHash: 'a'.repeat(64), mimeType: 'image/png' }, name: 'classroom.png', sizeBytes: 10 }
const image: AssessmentImage = { asset: stored.asset, altText: '教室情境', caption: '课堂说明', rightsStatus: 'authorized', rightsNote: '作者持有的展示许可' }
const json = (data: unknown, ok = true) => ({ ok, json: async () => ({ code: ok ? 0 : 1, data, message: ok ? 'ok' : '无权访问' }) }) as Response
const blob = () => ({ ok: true, blob: async () => new Blob(['image'], { type: 'image/png' }) }) as Response
beforeEach(() => {
  vi.resetAllMocks()
  // These transport fixtures contain synthetic bytes; decoder behavior has its own hook contracts.
  vi.stubGlobal('Image', class { src = ''; decode = () => Promise.resolve() })
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:private-image')})
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()})
})
afterEach(() => vi.unstubAllGlobals())
function Editor({ initial }: { initial?: AssessmentImage }) {
  const [value, setValue] = useState(initial)
  return <><OnlineImageField image={value} onChange={setValue}/><output data-testid="image-value">{JSON.stringify(value)}</output></>
}
describe('private online author images', () => {
  it('rejects invalid type and oversized uploads before the API call', () => {
    render(<OnlineImageField onChange={vi.fn()}/>)
    const input = screen.getByLabelText('上传情境图片（不超过 2MB）')
    fireEvent.change(input, { target: { files: [new File(['x'], 'x.svg', { type: 'image/svg+xml' })] } })
    expect(screen.getByRole('alert')).toHaveTextContent('PNG/JPEG/WebP')
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'x.png', { type: 'image/png' })] } })
    expect(sessionFetch).not.toHaveBeenCalled()
  })
  it('uploads multipart, displays the private proxy image, and edits portable accessibility and rights', async () => {
    vi.mocked(sessionFetch).mockImplementation(async (_url, init) => init?.method === 'POST' ? json(stored) : blob())
    render(<Editor/>)
    const file = new File(['image'], 'classroom.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('上传情境图片（不超过 2MB）'), { target: { files: [file] } })
    expect(await screen.findByRole('img', { name: 'classroom' })).toHaveAttribute('src', 'blob:private-image')
    const upload = vi.mocked(sessionFetch).mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(upload[0]).toBe('/api/situational/authoring/media/images')
    expect((upload[1]!.body as FormData).get('image')).toBe(file)
    expect(sessionFetch).toHaveBeenCalledWith('/api/situational/authoring/media/images/private-image/content', { cache: 'no-store' })
    fireEvent.change(screen.getByLabelText('图片替代文字（必填）'), { target: { value: '学生举手' } })
    fireEvent.change(screen.getByLabelText('图片版权状态'), { target: { value: 'authorized' } })
    fireEvent.change(screen.getByLabelText('图片版权／授权凭据说明（必填）'), { target: { value: '已获课程展示授权' } })
    expect(JSON.parse(screen.getByTestId('image-value').textContent!)).toEqual({ asset: stored.asset, altText: '学生举手', rightsStatus: 'authorized', rightsNote: '已获课程展示授权' })
  })
  it('uses saved draft authorization for reviewer preview without upload controls', async () => {
    vi.mocked(sessionFetch).mockResolvedValue(blob())
    render(<OnlineImageField image={image} draftId="review-draft" readOnly onChange={vi.fn()}/>)
    expect(await screen.findByRole('img', { name: '教室情境' })).toBeInTheDocument()
    expect(sessionFetch).toHaveBeenCalledWith('/api/situational/authoring/drafts/review-draft/media/private-image/content', { cache: 'no-store' })
    expect(screen.queryByLabelText('上传情境图片（不超过 2MB）')).not.toBeInTheDocument()
    expect(screen.getByLabelText('图片版权状态')).toBeDisabled()
  })
  it('selects only listed private assets and initializes unverified rights', async () => {
    vi.mocked(sessionFetch).mockImplementation(async url => String(url).includes('/media/images?') ? json({ items: [stored], nextCursor: null }) : blob())
    render(<Editor/>)
    fireEvent.click(screen.getByRole('button', { name: '打开作者素材库' }))
    await screen.findByRole('option', { name: /classroom.png/ })
    fireEvent.change(screen.getByLabelText('从作者素材库选择'), { target: { value: stored.asset.assetId } })
    expect(await screen.findByRole('img', { name: 'classroom' })).toBeInTheDocument()
    expect(JSON.parse(screen.getByTestId('image-value').textContent!)).toMatchObject({ rightsStatus: 'unknown', rightsNote: '' })
  })
  it('ignores a late library response after closing and an upload after unmounting', async () => {
    let resolve!: (response: Response) => void
    vi.mocked(sessionFetch).mockImplementation(() => new Promise(done => { resolve = done }))
    const change = vi.fn(), view = render(<OnlineImageField onChange={change}/>)
    fireEvent.click(screen.getByRole('button', { name: '打开作者素材库' }))
    fireEvent.click(screen.getByRole('button', { name: '收起作者素材库' }))
    await act(async () => resolve(json({ items: [stored], nextCursor: null })))
    expect(screen.queryByRole('option', { name: /classroom.png/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('上传情境图片（不超过 2MB）'), { target: { files: [new File(['x'], 'x.png', { type: 'image/png' })] } })
    view.unmount()
    await act(async () => resolve(json(stored)))
    expect(change).not.toHaveBeenCalled()
  })
  it('keeps preview answers blocked after media failure and enables them after retry', async () => {
    vi.mocked(sessionFetch).mockResolvedValueOnce(json(null, false)).mockResolvedValueOnce(blob())
    render(<AuthorPreviewMedia draftId="draft" stimulus={{ type: 'IMAGE', text: '情境文字', ...image }}><button>预览作答</button></AuthorPreviewMedia>)
    expect(screen.getByText('情境文字')).toBeInTheDocument()
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: '预览作答' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '预览作答' })).toBeEnabled())
    expect(screen.getByRole('img', { name: '教室情境' })).toHaveAttribute('src', 'blob:private-image')
  })
  it('loads more private assets without dropping already loaded choices', async () => {
    const second = { ...stored, asset: { ...stored.asset, assetId: 'second-image' }, name: 'hallway.png' }
    vi.mocked(sessionFetch).mockImplementation(async url => {
      const request = new URLSearchParams(String(url).split('?')[1] || '')
      return request.has('cursor')
        ? json({ items: [stored, second], nextCursor: null })
        : json({ items: [stored], nextCursor: 'asset-cursor+/=' })
    })
    render(<OnlineImageField onChange={vi.fn()}/>)
    fireEvent.click(screen.getByRole('button', { name: '打开作者素材库' }))
    await screen.findByRole('option', { name: /classroom.png/ })
    fireEvent.click(screen.getByRole('button', { name: '加载更多素材' }))
    await screen.findByRole('option', { name: /hallway.png/ })
    expect(screen.getAllByRole('option', { name: /classroom.png/ })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: '加载更多素材' })).not.toBeInTheDocument()
    expect(new URLSearchParams(String(vi.mocked(sessionFetch).mock.calls[1]![0]).split('?')[1] || '').get('cursor')).toBe('asset-cursor+/=')
  })

})
