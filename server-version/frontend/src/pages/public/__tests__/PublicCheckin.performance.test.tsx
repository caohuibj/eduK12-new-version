import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import PublicCheckin from '../PublicCheckin'
import * as sanitize from '../../../utils/sanitize'
import * as media from '../../../utils/mediaUtils'

vi.mock('antd', () => ({
  Image: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
  Upload: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
const data = (id: string) => ({ data: { sessionId: 'session', sessionCapability: 'capability', checkin: {
  id, title: id, content: `<p>Instructions ${id}</p><script>unsafe()</script>`, createdAt: '2026-01-01', allowViewOthers: false,
  images: [`https://example.com/${id}.png`], videos: [`https://example.com/${id}.mp4`], documents: [`https://example.com/${id}.pdf`],
} } })
function NextTask() { const navigate = useNavigate(); return <button onClick={() => navigate('/public/second')}>Next task</button> }
function mount() { return render(<MemoryRouter initialEntries={['/public/first']}><NextTask /><Routes><Route path="/public/:token" element={<PublicCheckin />} /></Routes></MemoryRouter>) }
beforeEach(() => {
  sessionStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => data(url.endsWith('second') ? 'second' : 'first') })))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('public check-in immutable presentation', () => {
  it('does no additional sanitization or external-media parsing during twenty input events', async () => {
    const sanitizer = vi.spyOn(sanitize, 'sanitizeHtml')
    const parser = vi.spyOn(media, 'isSafeExternalMediaUrl')
    mount(); await screen.findByText('Instructions first')
    await screen.findByAltText('参考图片 1')
    const sanitizeCount = sanitizer.mock.calls.length, parseCount = parser.mock.calls.length
    expect(parseCount).toBeGreaterThan(0)
    const input = screen.getByRole('textbox', { name: /打卡内容/ })
    for (let i = 1; i <= 20; i++) fireEvent.change(input, { target: { value: 'x'.repeat(i) } })
    expect(sanitizer).toHaveBeenCalledTimes(sanitizeCount)
    expect(parser).toHaveBeenCalledTimes(parseCount)
    expect(document.querySelector('script')).toBeNull()
  })
  it('refreshes instructions and media when the fetched task changes', async () => {
    const sanitizer = vi.spyOn(sanitize, 'sanitizeHtml')
    mount(); await screen.findByText('Instructions first')
    fireEvent.click(screen.getByText('Next task'))
    await screen.findByText('Instructions second')
    await waitFor(() => expect(screen.getByAltText('参考图片 1').getAttribute('src')).toBe('https://example.com/second.png'))
    expect(screen.queryByText('Instructions first')).toBeNull()
    expect(sanitizer.mock.calls.some(([html]) => html?.includes('Instructions second'))).toBe(true)
    expect(document.querySelector('video')?.getAttribute('src')).toBe('https://example.com/second.mp4')
  })
})
