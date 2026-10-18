import { beforeEach, describe, expect, it, vi } from 'vitest'
const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../client', () => ({ default: client }))
import { trainingAnalysisApi, type TrainingAnalysisManifest, type TrainingAnalysisSelector } from '../trainingAnalysis'

const selector: TrainingAnalysisSelector = { schemaVersion: 1, courseId: 'course/1', mode: 'PAIRWISE', waves: [] }
const manifest: TrainingAnalysisManifest = { schemaVersion: 1, manifestHash: 'hash', sourceCutoff: '2026-10-18T00:00:00.000Z', definitionHash: 'definition', sourceHash: 'source', qualityHash: 'quality', authorityHash: 'authority', sourceCount: 0, observationCount: 0 }
beforeEach(() => {
  vi.clearAllMocks()
  client.get.mockResolvedValue({ code: 0, data: { list: [], total: 0 } })
  client.post.mockResolvedValue({ code: 0, data: {} })
})
describe('trainingAnalysisApi current-course contract', () => {
  it('encodes the course scope and uses the dedicated discovery route', async () => {
    await trainingAnalysisApi.sources('course/1')
    expect(client.get).toHaveBeenCalledWith('/courses/course%2F1/training-analysis/sources')
  })
  it('does not disguise malformed discovery as an empty authorized list', async () => {
    client.get.mockResolvedValue({ code: 0, data: { total: 0 } })
    await expect(trainingAnalysisApi.sources('course/1')).rejects.toThrow('来源响应不完整')
  })
  it('preserves HTTP permission errors instead of converting them to empty lists', async () => {
    const denied = { status: 403, message: '无权限' }
    client.get.mockRejectedValue(denied)
    await expect(trainingAnalysisApi.sources('course/1')).rejects.toBe(denied)
  })
  it('submits the explicit selector for analysis', async () => {
    await trainingAnalysisApi.analyze('course/1', selector)
    expect(client.post).toHaveBeenCalledWith('/courses/course%2F1/training-analysis', { selector })
  })
  it('uses the full frozen manifest for quality pagination', async () => {
    await trainingAnalysisApi.qualityPage('course/1', selector, manifest, 2)
    expect(client.post).toHaveBeenCalledWith('/courses/course%2F1/training-analysis/quality/list', { selector, manifest, page: 2 })
  })
  it('carries the exact quality CAS scope and audit reason', async () => {
    const input = { selector, attemptId: 'attempt', attemptEpoch: 3, sourceHash: 'hash', expectedRevision: 2, verdict: 'EXCLUDE' as const, reason: '人工核验异常' }
    await trainingAnalysisApi.updateQuality('course/1', input)
    expect(client.post).toHaveBeenCalledWith('/courses/course%2F1/training-analysis/quality', input)
  })
  it('exports through the server queue with full manifest and durable request key', async () => {
    const input = { selector, manifest, layout: 'dictionary' as const, format: 'zip' as const, requestKey: 'durable-request-key' }
    await trainingAnalysisApi.exportData('course/1', input)
    expect(client.post).toHaveBeenCalledWith('/courses/course%2F1/training-analysis/exports', input)
  })
  it('rejects a failed API envelope instead of showing a successful analysis', async () => {
    client.post.mockResolvedValue({ code: 'TRAINING_ANALYSIS_STALE', message: '来源已变化', data: null })
    await expect(trainingAnalysisApi.analyze('course/1', selector)).rejects.toThrow('来源已变化')
  })
})
