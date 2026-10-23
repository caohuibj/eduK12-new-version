import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CognitiveFrontendRegistryEntry } from '../../registry'
import { deferredCognitiveRunner } from '../deferred-runner'
import { useRunnerPreparation } from '../useRunnerPreparation'

const readyEntry = (prepareRunner: () => Promise<void>) => ({ prepareRunner }) as CognitiveFrontendRegistryEntry
const Probe = ({ entry }: { entry: CognitiveFrontendRegistryEntry }) => {
  const code = useRunnerPreparation(entry)
  return <><button disabled={!code.ready}>开始</button>{code.error && <p role="alert">{code.error}</p>}<button onClick={code.retry}>重试</button></>
}

describe('exact cognitive runner preparation', () => {
  it('loads once for concurrent preparations, retains exact implementation and retries failures', async () => {
    const Task = () => null, load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(Task)
    const Runner = deferredCognitiveRunner(load)
    expect(load).not.toHaveBeenCalled()
    await expect(Runner.prepare()).rejects.toThrow('offline')
    const [a, b] = await Promise.all([Runner.prepare(), Runner.prepare()])
    expect(a).toBe(Task); expect(b).toBe(Task)
    expect(await Runner.prepare()).toBe(Task)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('never enables start before code is ready and ignores an obsolete frozen entry', async () => {
    let release!: () => void
    const first = readyEntry(() => new Promise<void>(resolve => { release = resolve }))
    const next = readyEntry(() => Promise.reject(new Error('offline')))
    const view = render(<Probe entry={first} />)
    expect(screen.getByText('开始')).toBeDisabled()
    await waitFor(() => expect(release).toBeTypeOf('function'))
    view.rerender(<Probe entry={next} />)
    await act(async () => release())
    expect(await screen.findByRole('alert')).toHaveTextContent('加载失败')
    expect(screen.getByText('开始')).toBeDisabled()
    const ready = readyEntry(() => Promise.resolve())
    view.rerender(<Probe entry={ready} />)
    await waitFor(() => expect(screen.getByText('开始')).toBeEnabled())
  })
})
