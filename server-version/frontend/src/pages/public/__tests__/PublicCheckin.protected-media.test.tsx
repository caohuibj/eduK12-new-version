import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import PublicCheckin from '../PublicCheckin'
vi.mock('antd', () => ({ Image: (p: { src: string; alt: string }) => <img {...p} />, Upload: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
const signed = (id: string, exp = Math.floor(Date.now() / 1000) + 600) => `/api/public/assets/${id}/content?expires=${exp}&signature=${'a'.repeat(43)}`
const json = (data: unknown) => ({ ok: true, json: async () => ({ data }) })
const content = () => ({ ok: true, blob: async () => new Blob(['media']) })
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function Next() { const go = useNavigate(); return <button onClick={() => go('/public/second')}>Next</button> }
const mount = () => render(<MemoryRouter initialEntries={['/public/first']}><Next /><Routes><Route path="/public/:token" element={<PublicCheckin />} /></Routes></MemoryRouter>)
let videoUrl: string, documentUrl: string, videoId: string, imageUrl: string
let fetchMock: ReturnType<typeof vi.fn>
let handler: (url: string) => unknown
const calls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/public/assets/'))
const load = async () => fireEvent.click(await screen.findByRole('button', { name: '加载视频 Video' }))
const ready = () => waitFor(() => expect(document.querySelector('video')).not.toBeNull())
beforeEach(() => {
  sessionStorage.clear(); videoUrl = signed('video'); documentUrl = signed('doc'); videoId = 'video'; imageUrl = 'https://example.com/image.png'
  handler = () => content()
  fetchMock = vi.fn(async (url: string, _options?: RequestInit) => {
    if (!url.startsWith('/api/checkins/public/')) return handler(url)
    const id = url.endsWith('second') ? 'second' : 'first'
    return json({ sessionId: `session-${id}`, sessionCapability: `cap-${id}`, checkin: { id, title: id, content: '<p>Instructions</p>', createdAt: '2026-01-01', allowViewOthers: false,
      images: [imageUrl], videos: [{ assetId: videoId, url: videoUrl, title: 'Video' }], documents: [{ assetId: 'doc', url: documentUrl, title: 'Document' }] } })
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:media'); static revokeObjectURL = vi.fn() })
  vi.spyOn(window, 'open').mockReturnValue(null)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('protected public media explicit activation', () => {
  it('makes zero video/document requests before activation, including typing and scroll', async () => {
    mount(); await screen.findByRole('button', { name: '加载视频 Video' })
    for (let i = 0; i < 20; i++) fireEvent.change(screen.getByRole('textbox'), { target: { value: `answer ${i}` } })
    fireEvent.scroll(window)
    expect(calls()).toHaveLength(0); expect(document.querySelector('video')).toBeNull(); expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(screen.getByAltText('参考图片 1').getAttribute('src')).toBe(imageUrl)
  })
  it('joins duplicate activation and waits for the whole blob before showing video', async () => {
    const body = deferred<Blob>(); handler = () => ({ ok: true, blob: () => body.promise })
    mount(); const button = await screen.findByRole('button', { name: '加载视频 Video' }); act(() => { button.click(); button.click() })
    await screen.findByRole('status'); expect(calls()).toHaveLength(1); expect(calls()[0][0]).toBe(videoUrl)
    expect(calls()[0][1]).toMatchObject({ headers: { 'X-Checkin-Token': 'first' } }); expect(document.querySelector('video')).toBeNull()
    await act(async () => body.resolve(new Blob(['video'])))
    expect(document.querySelector('video')?.getAttribute('src')).toBe('blob:media'); expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })
  it('prepares documents without popups and opens only on a second direct click', async () => {
    mount(); fireEvent.click(await screen.findByRole('button', { name: '准备文档 Document' })); const open = await screen.findByRole('button', { name: '在线查看 Document' })
    expect(window.open).not.toHaveBeenCalled(); expect(calls()).toHaveLength(1); fireEvent.click(open)
    expect(window.open).toHaveBeenCalledWith('blob:media', '_blank', 'noopener,noreferrer'); expect(calls()).toHaveLength(1)
  })
  it('renews only the expired asset and preserves the upload session', async () => {
    videoUrl = signed('video', 1); const fresh = signed('video'); handler = url => url.endsWith('/url') ? json({ assetId: 'video', url: fresh }) : content()
    mount(); await load(); await ready()
    expect(calls().map(c => c[0])).toEqual(['/api/public/assets/video/url', fresh])
    for (const [, opts] of calls()) expect(opts.headers).toEqual({ 'X-Checkin-Token': 'first' })
    expect(fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/checkins/public/'))).toHaveLength(1)
    expect(sessionStorage.getItem('checkin_session_first')).toBe('session-first'); expect(sessionStorage.getItem('checkin_session_capability_first')).toBe('cap-first')
  })
  it.each([401, 403, 404])('reports failure %s without automatic retries, then allows explicit retry', async status => {
    handler = () => ({ ok: false, status }); mount(); await load(); await screen.findByRole('alert')
    expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(calls()).toHaveLength(1)
    handler = () => content(); fireEvent.click(screen.getByRole('button', { name: '重试加载 Video' })); await ready(); expect(calls()).toHaveLength(2)
  })
  it.each(['wrong-id', 'wrong-path', 'external', 'expired', 'bad-signature'])('rejects invalid renewal %s without fetching its content', async kind => {
    videoUrl = signed('video', 1)
    handler = () => json({ assetId: kind === 'wrong-id' ? 'other' : 'video', url: kind === 'external' ? `https://example.com${signed('video')}` : kind === 'expired' ? signed('video', 1) : kind === 'bad-signature' ? '/api/public/assets/video/content?expires=9999999999&signature=bad' : kind === 'wrong-path' ? signed('other') : signed('video') })
    mount(); await load(); await screen.findByRole('alert'); expect(calls()).toHaveLength(1); expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
  it('rejects source id/path mismatch before a protected request', async () => {
    videoId = 'other'; mount(); await load(); await screen.findByRole('alert'); expect(calls()).toHaveLength(0)
  })
  it('cancels an in-flight body, ignores late completion, and retries', async () => {
    const body = deferred<Blob>(); handler = () => ({ ok: true, blob: () => body.promise })
    mount(); await load(); await screen.findByRole('status'); const signal = calls()[0][1].signal as AbortSignal
    fireEvent.click(screen.getByRole('button', { name: '取消加载 Video' })); expect(signal.aborted).toBe(true)
    await act(async () => body.resolve(new Blob(['old']))); expect(URL.createObjectURL).not.toHaveBeenCalled()
    handler = () => content(); await load(); await ready()
  })
  it('aborts on unmount even when fetch ignores abort and resolves late', async () => {
    const request = deferred<ReturnType<typeof content>>(); handler = () => request.promise
    const view = mount(); await load(); const signal = calls()[0][1].signal as AbortSignal; view.unmount(); expect(signal.aborted).toBe(true)
    const lateResponse = { ok: true, blob: vi.fn(async () => new Blob(['late'])) }
    await act(async () => request.resolve(lateResponse)); expect(lateResponse.blob).not.toHaveBeenCalled(); expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
  it('isolates new token/source at the same list index from a late old body', async () => {
    const body = deferred<Blob>(); handler = () => ({ ok: true, blob: () => body.promise }); mount(); await load()
    const signal = calls()[0][1].signal as AbortSignal; videoId = 'replacement'; videoUrl = signed('replacement')
    fireEvent.click(screen.getByText('Next')); await screen.findByText('second'); expect(signal.aborted).toBe(true)
    await act(async () => body.resolve(new Blob(['old']))); expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(document.querySelector('video')).toBeNull()
    handler = () => content(); await load(); await ready(); expect(calls()[1][1].headers).toEqual({ 'X-Checkin-Token': 'second' })
  })
  it('releases the ready blob exactly once on unmount', async () => {
    const view = mount(); await load(); await ready(); view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:media')
  })
  it('keeps protected images eager and external video/document native', async () => {
    imageUrl = signed('image'); videoUrl = 'https://example.com/video.mp4'; documentUrl = 'https://example.com/document.pdf'
    mount(); await screen.findByRole('button', { name: '在线查看 Document' }); await waitFor(() => expect(screen.getByAltText('参考图片 1').getAttribute('src')).toBe('blob:media'))
    expect(calls().map(c => c[0])).toEqual([imageUrl]); expect(document.querySelector('video')?.getAttribute('src')).toBe(videoUrl)
    fireEvent.click(screen.getByRole('button', { name: '在线查看 Document' })); expect(window.open).toHaveBeenCalledWith(documentUrl, '_blank', 'noopener,noreferrer')
  })
  it('cancels renewal without fetching content or creating a blob after its late response', async () => {
    videoUrl = signed('video', 1)
    const renewal = deferred<ReturnType<typeof json>>(); handler = () => renewal.promise
    mount(); await load(); const signal = calls()[0][1].signal as AbortSignal
    fireEvent.click(screen.getByRole('button', { name: '取消加载 Video' })); expect(signal.aborted).toBe(true)
    await act(async () => renewal.resolve(json({ assetId: 'video', url: signed('video') })))
    expect(calls()).toHaveLength(1); expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '加载视频 Video' })).toBeTruthy()
  })
  it('does not fetch content when renewal authorization fails', async () => {
    videoUrl = signed('video', 1); handler = () => ({ ok: false, status: 401 })
    mount(); await load(); await screen.findByRole('alert')
    expect(calls().map(c => c[0])).toEqual(['/api/public/assets/video/url']); expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
  it('releases ready content on task replacement and requires fresh activation', async () => {
    mount(); await load(); await ready(); fireEvent.click(screen.getByText('Next')); await screen.findByText('second')
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:media')
    expect(document.querySelector('video')).toBeNull(); expect(calls()).toHaveLength(1)
    expect(screen.getByRole('button', { name: '加载视频 Video' })).toBeTruthy()
  })
  it('handles an absolute same-origin protected source without a native unauthenticated src', async () => {
    videoUrl = window.location.origin + signed('video')
    mount(); await screen.findByRole('button', { name: '加载视频 Video' }); expect(calls()).toHaveLength(0)
    expect(document.querySelector('video')).toBeNull(); await load(); await ready()
    expect(calls()[0][0]).toBe(new URL(videoUrl).pathname + new URL(videoUrl).search)
    expect(calls()[0][1].headers).toEqual({ 'X-Checkin-Token': 'first' })
  })

})
