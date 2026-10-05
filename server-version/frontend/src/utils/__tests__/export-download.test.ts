import { afterEach, expect, it, vi } from 'vitest'
import { triggerExportDownload } from '../exportJobs'
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
it('connects the download anchor and keeps its URL alive until the browser consumes the request', () => {
  vi.useFakeTimers()
  const create = vi.fn(() => 'blob:download-test')
  const revoke = vi.fn()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }))
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function(this: HTMLAnchorElement) {
    expect(this.isConnected).toBe(true)
    expect(this.download).toBe('data.csv')
    expect(revoke).not.toHaveBeenCalled()
  })
  triggerExportDownload(new Blob(['score\n10']), 'data.csv')
  expect(click).toHaveBeenCalledTimes(1)
  expect(document.querySelector('a[download="data.csv"]')).toBeNull()
  expect(revoke).not.toHaveBeenCalled()
  vi.advanceTimersByTime(60000)
  expect(revoke).toHaveBeenCalledWith('blob:download-test')
})
it('rejects an empty artifact before claiming that a download was requested', () => {
  expect(() => triggerExportDownload(new Blob(), 'data.csv')).toThrow('导出文件为空')
})
