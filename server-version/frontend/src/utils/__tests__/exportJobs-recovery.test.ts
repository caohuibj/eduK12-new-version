import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('../../api/client', () => ({ sessionFetch: mocks.fetch }))
import { getExportIntentKey, clearExportIntentKey, requestExportIntent, waitForExportArtifacts, assertExportDownload, ExportJobFailedError } from '../exportJobs'
beforeEach(() => { sessionStorage.clear(); mocks.fetch.mockReset() })
it('reuses the same intent after response loss but generates a fresh one after terminal conflict', async () => {
  const scope = 'cognitive:resource:summary'
  const key = getExportIntentKey(scope)
  await expect(requestExportIntent(scope, async () => { throw new TypeError('network') })).rejects.toThrow()
  expect(getExportIntentKey(scope)).toBe(key)
  await expect(requestExportIntent(scope, async supplied => { expect(supplied).toBe(key); throw { status: 409, retryable: false, message: 'changed projection' } })).rejects.toBeTruthy()
  expect(getExportIntentKey(scope)).not.toBe(key)
})
it.each([404, 410])('classifies terminal status %s for both durable assessment families', async status => {
  for (const family of ['cognitive', 'composite']) {
    const scope = `${family}:resource:summary`; const old = getExportIntentKey(scope)
    mocks.fetch.mockResolvedValue({ status, ok: false })
    try { await waitForExportArtifacts([{ id: 'artifact', format: 'csv', fileName: 'file.csv', downloadUrl: `/api/${family}/artifact` }]) }
    catch (error) { expect(error).toBeInstanceOf(ExportJobFailedError); clearExportIntentKey(scope) }
    expect(getExportIntentKey(scope)).not.toBe(old)
  }
})
it('keeps transient status failures recoverable and accepts a ready artifact', async () => {
  const artifacts = [{ id: 'artifact', format: 'csv', fileName: 'file.csv', downloadUrl: '/api/composite/artifact' }]
  const key = getExportIntentKey('composite:resource')
  mocks.fetch.mockResolvedValueOnce({ status: 503, ok: false })
  await expect(waitForExportArtifacts(artifacts)).rejects.not.toBeInstanceOf(ExportJobFailedError)
  expect(getExportIntentKey('composite:resource')).toBe(key)
  mocks.fetch.mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ code: 0, data: { status: 'READY', fileName: 'generated.csv' } }) })
  expect((await waitForExportArtifacts(artifacts))[0].fileName).toBe('generated.csv')
})
it('classifies expiry between READY polling and protected download as terminal', () => {
  expect(() => assertExportDownload({ status: 404, ok: false } as Response)).toThrow(ExportJobFailedError)
  expect(() => assertExportDownload({ status: 503, ok: false } as Response)).not.toThrow(ExportJobFailedError)
  expect(() => assertExportDownload({ status: 200, ok: true } as Response)).not.toThrow()
})
