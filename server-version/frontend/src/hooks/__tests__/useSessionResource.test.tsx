import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ user: { id: 'parent-a' } }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))
import { useSessionResource } from '../useSessionResource'
function Probe({
  load,
  resource = 'child',
}: {
  load: (signal: AbortSignal) => Promise<string>
  resource?: string
}) {
  const { data, error, loading } = useSessionResource(resource, load)
  return (
    <output>
      {loading ? 'loading' : error ? 'denied' : (data ?? 'empty')}
    </output>
  )
}
describe('session resource privacy fence', () => {
  beforeEach(() => {
    auth.user = { id: 'parent-a' }
  })
  it('ignores a late child response after account switches', async () => {
    let resolve: (s: string) => void = () => {}
    const load = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((r) => {
            resolve = r
          }),
      )
      .mockResolvedValue('parent-b child')
    const { rerender } = render(<Probe load={load} />)
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    auth.user = { id: 'parent-b' }
    rerender(<Probe load={load} />)
    await screen.findByText('parent-b child')
    await act(async () => resolve('parent-a private report'))
    expect(screen.queryByText('parent-a private report')).toBeNull()
  })
  it('clears a rendered report on focus and shows current denial', async () => {
    let reject: (s: Error) => void = () => {}
    const load = vi
      .fn()
      .mockResolvedValueOnce('private report')
      .mockImplementationOnce(
        () =>
          new Promise<string>((_r, j) => {
            reject = j
          }),
      )
    render(<Probe load={load} />)
    await screen.findByText('private report')
    fireEvent(window, new Event('focus'))
    expect(screen.queryByText('private report')).toBeNull()
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    await act(async () => reject(new Error('revoked')))
    await screen.findByText('denied')
    expect(screen.queryByText('private report')).toBeNull()
  })
  it('hides the previous child while loading a different exact resource', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce('child-one')
      .mockImplementationOnce(() => new Promise<string>(() => {}))
    const { rerender } = render(<Probe load={load} resource="one" />)
    await screen.findByText('child-one')
    rerender(<Probe load={load} resource="two" />)
    expect(screen.queryByText('child-one')).toBeNull()
    expect(screen.getByText('loading')).toBeTruthy()
  })
})
