import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ findBatch: vi.fn(), createBatch: vi.fn(), createArtifact: vi.fn(), findArtifacts: vi.fn(), add: vi.fn(), transaction: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { $transaction: mocks.transaction,
  exportBatch: { findUnique: mocks.findBatch }, exportArtifact: { findMany: mocks.findArtifacts } } }))
vi.mock('../../config/queue', () => ({ exportQueue: { getJob: vi.fn().mockResolvedValue(null), add: mocks.add } }))
import { enqueueExportJob, formatsForRequest, exportArtifactUrl } from '../../services/exportJobService'
import { courseId, actor, exportOptions } from './export-fixtures'
import { trainingManifestHash } from '../../modules/training-analysis/manifest'

const request = () => ({ resourceType: 'TRAINING_ANALYSIS' as const, resourceId: courseId,
  createdBy: actor.id, authorityTokenVersion: 1, anonymized: true, format: 'zip', recordCount: 2, requestKey: randomUUID(),
  options: { anonymize: true, creatorRole: actor.role, trainingAnalysis: exportOptions() } })

describe('Training analysis durable original ExportBatch intent', () => {
  let batches: any[], artifacts: any[]
  beforeEach(() => {
    vi.clearAllMocks(); batches = []; artifacts = []
    mocks.findBatch.mockImplementation(async ({ where }: any) => where.id ? batches.find(row => row.id === where.id) : batches.find(row => row.createdBy === where.createdBy_requestKey.createdBy && row.requestKey === where.createdBy_requestKey.requestKey))
    mocks.createBatch.mockImplementation(async ({ data }: any) => { const row = { ...data, status: 'PROCESSING', fieldCount: null }; batches.push(row); return row })
    mocks.createArtifact.mockImplementation(async ({ data }: any) => { const row = { ...data, id: randomUUID() }; artifacts.push(row); return row })
    mocks.findArtifacts.mockImplementation(async ({ where }: any) => artifacts.filter(row => row.batchId === where.batchId))
    mocks.transaction.mockImplementation(async (callback: any) => callback({ exportBatch: { create: mocks.createBatch }, exportArtifact: { create: mocks.createArtifact } }))
    mocks.add.mockResolvedValue({})
  })
  it('persists the exact frozen manifest in both intent and artifact, then queues the original batch ID', async () => {
    const input = request(), result = await enqueueExportJob(input)
    expect(batches[0].resourceType).toBe('TRAINING_ANALYSIS')
    expect(batches[0].resourceId).toBe(courseId)
    expect(batches[0].options.trainingAnalysis).toEqual(input.options.trainingAnalysis)
    expect(artifacts[0].provenance).toMatchObject({ version: 2, resourceType: 'TRAINING_ANALYSIS', trainingAnalysis: input.options.trainingAnalysis })
    expect(mocks.add).toHaveBeenCalledWith({ batchId: result.batchId }, { jobId: `export-${result.batchId}` })
    expect(result.artifacts[0].downloadUrl).toBe(`/api/courses/${courseId}/training-analysis/export/artifacts/${artifacts[0].id}`)
    expect(JSON.stringify(result)).not.toContain('sourceHashes')
  })
  it('preserves an authenticated historical non-UUID creator without identity normalization', async () => {
    const input = request(); input.createdBy = 'legacy-authenticated-teacher'
    const {manifestHash: _old, ...unsigned} = input.options.trainingAnalysis.manifest
    unsigned.actor = {...unsigned.actor, id: input.createdBy}
    input.options.trainingAnalysis.manifest = {...unsigned, manifestHash: trainingManifestHash(unsigned)}
    await enqueueExportJob(input)
    expect(batches[0].createdBy).toBe(input.createdBy)
    expect(artifacts[0].provenance.trainingAnalysis.manifest.actor.id).toBe(input.createdBy)
    await expect(enqueueExportJob({...input, requestKey:randomUUID(), createdBy:' '+input.createdBy})).rejects.toThrow('Training export identity changed')
  })
  it.each(['', 'x'.repeat(201)])('rejects an empty or oversized internal creator identity before persistence', async id => {
    const input = request(); input.createdBy = id
    const {manifestHash: _old, ...unsigned} = input.options.trainingAnalysis.manifest
    unsigned.actor = {...unsigned.actor, id}
    input.options.trainingAnalysis.manifest = {...unsigned, manifestHash: trainingManifestHash(unsigned)}
    await expect(enqueueExportJob(input)).rejects.toThrow()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('replays identical intent without recreating files and rejects reusing its key for changed table', async () => {
    const input = request(), first = await enqueueExportJob(input), replay = await enqueueExportJob(input)
    expect(replay.batchId).toBe(first.batchId); expect(replay.replayed).toBe(true)
    expect(mocks.createBatch).toHaveBeenCalledOnce(); expect(mocks.createArtifact).toHaveBeenCalledOnce()
    input.options.trainingAnalysis.table = 'wide'
    await expect(enqueueExportJob(input)).rejects.toThrow(/不同参数/)
  })
  it('rejects missing, mutated, cross-course, cross-creator, or nonanonymous provenance before persistence', async () => {
    const missing = request(); delete (missing.options as any).trainingAnalysis
    const altered = request(); altered.options.trainingAnalysis.manifest.qualityHash = 'f'.repeat(64)
    const wrongCourse = { ...request(), resourceId: randomUUID() }
    const wrongCreator = { ...request(), createdBy: randomUUID() }
    const nonanonymous = { ...request(), anonymized: false }
    for (const input of [missing, altered, wrongCourse, wrongCreator, nonanonymous]) await expect(enqueueExportJob(input)).rejects.toThrow()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('allows only CSV/ZIP and never routes Training to legacy scale/questionnaire exports', () => {
    expect(formatsForRequest('TRAINING_ANALYSIS', 'CSV')).toEqual(['csv'])
    expect(formatsForRequest('TRAINING_ANALYSIS', 'zip')).toEqual(['zip'])
    for (const format of ['sav', 'sps', 'spss', 'xlsx']) expect(() => formatsForRequest('TRAINING_ANALYSIS', format)).toThrow()
    expect(exportArtifactUrl('TRAINING_ANALYSIS', courseId, 'artifact')).toBe(`/api/courses/${courseId}/training-analysis/export/artifacts/artifact`)
  })
})
