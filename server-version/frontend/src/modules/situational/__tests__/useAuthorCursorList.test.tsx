import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionFetch } from '../../../api/client'
import { useAuthorCursorList } from '../useAuthorCursorList'

vi.mock('../../../api/client', () => ({ sessionFetch: vi.fn() }))
const key = (item: { id: string }) => item.id
const page = (items: Array<{ id: string }>, nextCursor: string | null = null): Response => ({ ok: true, json: async () => ({ code: 0, data: { items, nextCursor } }) }) as Response
function List({ path }: { path: string | null }) {
  const list = useAuthorCursorList(path, key, 30)
  return <><output data-testid="rows">{list.items.map(x => x.id).join(',')}</output><p>{list.error}</p>
    <button disabled={list.loading} onClick={() => void list.loadMore()}>More</button>
    <button onClick={() => void list.reload()}>Reload</button><button disabled={list.loading} onClick={() => void list.retry()}>Retry</button><output data-testid="cursor">{list.nextCursor}</output></>
}
beforeEach(() => vi.resetAllMocks())
describe('author cursor pagination', () => {
  it('passes opaque cursors unchanged, deduplicates rows, and retains prior pages on failure for an exact retry', async () => {
    const cursor = 'opaque+/=?cursor'
    vi.mocked(sessionFetch).mockResolvedValueOnce(page([{ id: 'one' }], cursor))
      .mockRejectedValueOnce(new Error('temporary page failure'))
      .mockResolvedValueOnce(page([{ id: 'one' }, { id: 'two' }]))
    render(<List path="/media/images"/>)
    await waitFor(() => expect(screen.getByTestId('rows')).toHaveTextContent('one'))
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    await screen.findByText('temporary page failure')
    expect(screen.getByTestId('rows')).toHaveTextContent(/^one$/)
    expect(screen.getByTestId('cursor')).toHaveTextContent(cursor)
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    await waitFor(() => expect(screen.getByTestId('rows')).toHaveTextContent(/^one,two$/))
    const requested = vi.mocked(sessionFetch).mock.calls.map(([url]) => new URL(String(url), 'https://example.test'))
    expect(requested[0]!.searchParams.get('pageSize')).toBe('30')
    expect(requested[1]!.searchParams.get('cursor')).toBe(cursor)
    expect(requested[2]!.href).toBe(requested[1]!.href)
    expect(screen.getByTestId('cursor')).toBeEmptyDOMElement()
  })
  it('does not append late pages into a different release, and closing clears pagination before reopening', async () => {
    let resolveLate!: (response: Response) => void
    vi.mocked(sessionFetch).mockResolvedValueOnce(page([{ id: 'old-head' }], 'old-cursor'))
      .mockImplementationOnce(() => new Promise(resolve => { resolveLate = resolve }))
      .mockResolvedValueOnce(page([{ id: 'new-head' }], 'new-cursor'))
      .mockResolvedValueOnce(page([{ id: 'new-head-reopened' }]))
    const view = render(<List path="/releases/old/grants"/>)
    await waitFor(() => expect(screen.getByTestId('rows')).toHaveTextContent('old-head'))
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    view.rerender(<List path="/releases/new/grants"/>)
    await waitFor(() => expect(screen.getByTestId('rows')).toHaveTextContent(/^new-head$/))
    await act(async () => resolveLate(page([{ id: 'old-tail' }])))
    expect(screen.getByTestId('rows')).toHaveTextContent(/^new-head$/)
    view.rerender(<List path={null}/>)
    expect(screen.getByTestId('rows')).toBeEmptyDOMElement()
    expect(screen.getByTestId('cursor')).toBeEmptyDOMElement()
    view.rerender(<List path="/releases/new/grants"/>)
    await waitFor(() => expect(screen.getByTestId('rows')).toHaveTextContent(/^new-head-reopened$/))
    expect(new URL(String(vi.mocked(sessionFetch).mock.calls[3]![0]), 'https://example.test').searchParams.has('cursor')).toBe(false)
  })
  it('retries a failed refresh from the first page even when an old next cursor remains visible', async () => {
    vi.mocked(sessionFetch).mockResolvedValueOnce(page([{ id: 'old-head' }], 'next-cursor'))
      .mockRejectedValueOnce(new Error('refresh failed')).mockResolvedValueOnce(page([{ id: 'fresh-head' }], 'new-cursor'))
    render(<List path="/releases"/>)
    await waitFor(() => expect(screen.getByTestId('rows')).toHaveTextContent('old-head'))
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    await screen.findByText('refresh failed')
    expect(screen.getByTestId('rows')).toHaveTextContent(/^old-head$/)
    expect(screen.getByTestId('cursor')).toHaveTextContent('next-cursor')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByTestId('rows')).toHaveTextContent(/^fresh-head$/))
    expect(vi.mocked(sessionFetch).mock.calls.map(([url]) => new URL(String(url), 'https://example.test').searchParams.has('cursor'))).toEqual([false, false, false])
  })

})
