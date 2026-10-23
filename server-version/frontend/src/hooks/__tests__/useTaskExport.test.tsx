import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), download: vi.fn() }))
vi.mock('../../api/client', () => ({ sessionFetch: mocks.fetch }))
vi.mock('../../utils/exportJobs', () => ({ triggerExportDownload: mocks.download }))
import { useTaskExport } from '../useTaskExport'

it('shares rapid requests for the same task and permits a fresh export after completion', async () => {
  mocks.fetch.mockReset(); mocks.download.mockReset()
  let finish!: (response: { ok: boolean; blob: () => Promise<Blob> }) => void
  mocks.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const { result } = renderHook(() => useTaskExport(vi.fn()))
  let first!: Promise<void>
  act(() => { first = result.current.exportTask('a', '/api/assignments/a/export', '合成.xlsx'); void result.current.exportTask('a', '/api/assignments/a/export', '合成.xlsx') })
  expect(mocks.fetch).toHaveBeenCalledTimes(1)
  expect(result.current.exporting.has('a')).toBe(true)
  await act(async () => { finish({ ok: true, blob: async () => new Blob(['synthetic']) }); await first })
  expect(mocks.download).toHaveBeenCalledTimes(1)
  expect(result.current.exporting.size).toBe(0)
  mocks.fetch.mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['new export']) })
  await act(async () => { await result.current.exportTask('a', '/api/assignments/a/export', '合成.xlsx') })
  expect(mocks.fetch).toHaveBeenCalledTimes(2)
})

it('releases the pending task after failure so the user can retry', async () => {
  mocks.fetch.mockReset(); mocks.download.mockReset()
  mocks.fetch.mockResolvedValue({ ok: false })
  const error = vi.fn(); const { result } = renderHook(() => useTaskExport(error))
  await act(async () => { await result.current.exportTask('a', '/api/assignments/a/export', '合成.xlsx') })
  expect(error).toHaveBeenCalledWith('导出失败')
  expect(result.current.exporting.size).toBe(0)
  await act(async () => { await result.current.exportTask('a', '/api/assignments/a/export', '合成.xlsx') })
  expect(mocks.fetch).toHaveBeenCalledTimes(2)
  expect(mocks.download).not.toHaveBeenCalled()
})

it('finishes the requested download when the teacher navigates away', async () => {
  mocks.fetch.mockReset(); mocks.download.mockReset()
  let finish!: (response: { ok: boolean; blob: () => Promise<Blob> }) => void
  mocks.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const { result, unmount } = renderHook(() => useTaskExport(vi.fn()))
  let pending!: Promise<void>
  act(() => { pending = result.current.exportTask('a', '/api/assignments/a/export', '合成.xlsx') })
  unmount()
  await act(async () => { finish({ ok: true, blob: async () => new Blob(['synthetic']) }); await pending })
  expect(mocks.download).toHaveBeenCalledTimes(1)
})
