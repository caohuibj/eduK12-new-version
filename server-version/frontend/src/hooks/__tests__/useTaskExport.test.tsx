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

it.each([
  [503, '导出繁忙，请稍后重试'],
  [413, '导出超过条数或文件大小上限，请减少数据后重试'],
  [403, '导出权限已失效，请刷新后重试'],
  [503, '导出快照超时，请稍后重试'],
])('surfaces actionable JSON export errors (%s, %s) without downloading', async (status, message) => {
  mocks.fetch.mockReset(); mocks.download.mockReset()
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ code: -1, message }), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } }))
  const error = vi.fn(); const { result } = renderHook(() => useTaskExport(error))
  await act(async () => { await result.current.exportTask('a', '/api/assignments/a/export', '合成.xlsx') })
  expect(error).toHaveBeenCalledWith(message)
  expect(result.current.exporting.size).toBe(0)
  expect(mocks.download).not.toHaveBeenCalled()
})

it.each([
  ['not JSON', 'application/json'],
  ['<html>Bad gateway</html>', 'text/html'],
  [JSON.stringify({ message: '<img src=x onerror=alert(1)>' }), 'application/json'],
  [JSON.stringify({ message: 'unsafe\u0000message' }), 'application/json'],
  [JSON.stringify({ message: 123 }), 'application/json'],
  [JSON.stringify({ message: '   ' }), 'application/json'],
  ['null', 'application/json'],
  ['{}', 'application/json'],
])('falls back for invalid or unsafe error bodies: %s', async (body, contentType) => {
  mocks.fetch.mockReset(); mocks.download.mockReset()
  mocks.fetch.mockResolvedValue(new Response(body, { status: 503, headers: { 'Content-Type': contentType } }))
  const error = vi.fn(); const { result } = renderHook(() => useTaskExport(error))
  await act(async () => { await result.current.exportTask('a', '/api/assignments/a/export', '合成.xlsx') })
  expect(error).toHaveBeenCalledWith('导出失败')
  expect(mocks.download).not.toHaveBeenCalled()
})

it('bounds displayed messages even within a valid JSON envelope', async () => {
  mocks.fetch.mockReset(); mocks.download.mockReset()
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ message: '长'.repeat(400) }), { status: 413, headers: { 'Content-Type': 'application/json' } }))
  const error = vi.fn(); const { result } = renderHook(() => useTaskExport(error))
  await act(async () => { await result.current.exportTask('a', '/api/assignments/a/export', '合成.xlsx') })
  expect(error).toHaveBeenCalledWith('长'.repeat(300))
  expect(mocks.download).not.toHaveBeenCalled()
})

it('stops reading an oversized error body and releases its reader', async () => {
  mocks.fetch.mockReset(); mocks.download.mockReset()
  const reader = { read: vi.fn().mockResolvedValue({ done: false, value: new Uint8Array(8193) }), cancel: vi.fn().mockResolvedValue(undefined), releaseLock: vi.fn() }
  mocks.fetch.mockResolvedValue({ ok: false, headers: new Headers({ 'Content-Type': 'application/json' }), body: { getReader: () => reader } })
  const error = vi.fn(); const { result } = renderHook(() => useTaskExport(error))
  await act(async () => { await result.current.exportTask('a', '/api/assignments/a/export', '合成.xlsx') })
  expect(error).toHaveBeenCalledWith('导出失败')
  expect(reader.read).toHaveBeenCalledTimes(1)
  expect(reader.cancel).toHaveBeenCalledTimes(1)
  expect(reader.releaseLock).toHaveBeenCalledTimes(1)
  expect(mocks.download).not.toHaveBeenCalled()
})

it('uses the fallback on body-read failure and allows a successful retry', async () => {
  mocks.fetch.mockReset(); mocks.download.mockReset()
  const reader = { read: vi.fn().mockRejectedValue(new Error('private transport details')), releaseLock: vi.fn() }
  mocks.fetch.mockResolvedValueOnce({ ok: false, headers: new Headers({ 'Content-Type': 'application/json' }), body: { getReader: () => reader } })
  const error = vi.fn(); const { result } = renderHook(() => useTaskExport(error))
  await act(async () => { await result.current.exportTask('a', '/api/assignments/a/export', '合成.xlsx') })
  expect(error).toHaveBeenCalledWith('导出失败')
  expect(reader.releaseLock).toHaveBeenCalledTimes(1)
  expect(result.current.exporting.size).toBe(0)
  mocks.fetch.mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['retry']) })
  await act(async () => { await result.current.exportTask('a', '/api/assignments/a/export', '合成.xlsx') })
  expect(mocks.download).toHaveBeenCalledTimes(1)
})
