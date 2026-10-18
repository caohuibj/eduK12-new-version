import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ principal: vi.fn(), analyze: vi.fn(), revalidate: vi.fn(), save: vi.fn(),
  claim: vi.fn(), publish: vi.fn(), fail: vi.fn(), release: vi.fn(), artifacts: vi.fn(), rename: vi.fn(), stat: vi.fn(), rm: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { exportArtifact: { findMany: mocks.artifacts } } }))
vi.mock('../../modules/organization/principal', () => ({ loadCurrentPrincipal: mocks.principal }))
vi.mock('../../modules/training-analysis/service', () => ({ analyzeTrainingCourse: mocks.analyze, revalidateTrainingAnalysisManifest: mocks.revalidate }))
vi.mock('../../modules/training-analysis/export', async (original) => ({ ...await original<typeof import('../../modules/training-analysis/export')>(), saveTrainingAnalysisExport: mocks.save }))
vi.mock('../../modules/cognitive/assignment.service', () => ({ getAssignmentForTeacher: vi.fn() }))
vi.mock('../../modules/cognitive/export.service', () => ({ cognitiveExportService: {} }))
vi.mock('../../modules/composite/composite-export.service', () => ({ compositeExportService: {}, teacherRelationalExportVisibility: vi.fn() }))
vi.mock('../../modules/composite/composite.service', () => ({ getExportContext: vi.fn() }))
vi.mock('../../modules/composite/composite-export-projection', () => ({ resolveCompositeExportProjectionBinding: vi.fn(), projectCompositeExportData: vi.fn() }))
vi.mock('../../services/exportService', () => ({ getScaleExportData: vi.fn(), getQuestionnaireExportData: vi.fn(), writeExportDataFile: vi.fn() }))
vi.mock('../../services/exportJobService', () => ({ claimExportBatch: mocks.claim, publishExportBatch: mocks.publish,
  failExportBatchFinal: mocks.fail, releaseExportBatchAttempt: mocks.release, isFinalExportAttempt: () => true, reconcilePendingExportBatches: vi.fn() }))
vi.mock('fs/promises', () => ({ rename: mocks.rename, stat: mocks.stat, rm: mocks.rm }))
import { prepareAssessmentExport, revalidateAssessmentExport } from '../../services/assessmentExportWorker'
import { runExportBatch } from '../../workers/exportBatchTask'
import { claim, actor, tables, currentPrincipal, courseId } from './export-fixtures'

const job = { data: { batchId: claim().batchId }, id: `export-${claim().batchId}`, opts: { attempts: 1 }, attemptsMade: 0 }
describe('Training original export worker frozen manifest lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.principal.mockResolvedValue(currentPrincipal()); mocks.revalidate.mockResolvedValue(undefined)
    mocks.analyze.mockImplementation(async ({ expectedManifest }: any) => ({ manifest: expectedManifest, analysis: {}, tables: tables() }))
    mocks.claim.mockResolvedValue(claim()); mocks.publish.mockResolvedValue(true); mocks.fail.mockResolvedValue(true)
    mocks.artifacts.mockResolvedValue([{ id: 'artifact-id', storageKey: `training_analysis_${courseId.substring(0, 8)}_${claim().batchId}.csv`, format: 'csv' }])
    mocks.save.mockResolvedValue('/safe/generated.csv'); mocks.rename.mockResolvedValue(undefined); mocks.stat.mockResolvedValue({ size: 123 }); mocks.rm.mockResolvedValue(undefined)
  })
  it('reconstructs only the original selector and exact manifest, preserving cutoff across retries', async () => {
    const intent = claim(), prepared = await prepareAssessmentExport(intent)
    expect(mocks.analyze).toHaveBeenCalledWith({ actor, courseId, selector: intent.options.trainingAnalysis.selector, expectedManifest: intent.options.trainingAnalysis.manifest })
    expect(prepared.provenance).toMatchObject({ version: 2, trainingAnalysis: intent.options.trainingAnalysis })
    await prepared.save('csv')
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ options: intent.options.trainingAnalysis, tables: tables(), batchId: intent.batchId, generation: 1 }))
    const retry = await prepareAssessmentExport({ ...intent, generation: 2, createdAt: new Date('2026-10-19T00:00:00.000Z') })
    expect((retry.provenance as any).trainingAnalysis.manifest.sourceCutoff).toBe(intent.options.trainingAnalysis.manifest.sourceCutoff)
  })
  it('refuses a reconstruction whose selected sample or quality produces another manifest', async () => {
    mocks.analyze.mockResolvedValue({ manifest: { ...claim().options.trainingAnalysis.manifest, manifestHash: 'f'.repeat(64) }, tables: tables() })
    await expect(prepareAssessmentExport(claim())).rejects.toThrow(/manifest changed/)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('fails closed for revoked creator authority or missing durable manifest', async () => {
    mocks.principal.mockResolvedValue({ ...currentPrincipal(), isFrozen: true })
    await expect(prepareAssessmentExport(claim())).rejects.toThrow(/authority revoked/)
    mocks.principal.mockResolvedValue(currentPrincipal())
    await expect(revalidateAssessmentExport({ ...claim(), options: { anonymize: true, creatorRole: actor.role } })).rejects.toThrow()
    expect(mocks.analyze).not.toHaveBeenCalled()
  })
  it('publishes through the existing generation fence only after post-generation revalidation', async () => {
    const result = await runExportBatch(job)
    expect(result.status).toBe('READY')
    expect(mocks.revalidate).toHaveBeenCalledTimes(2)
    expect(mocks.revalidate.mock.invocationCallOrder[1]).toBeGreaterThan(mocks.save.mock.invocationCallOrder[0])
    expect(mocks.publish.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.revalidate.mock.invocationCallOrder[1])
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ batchId: claim().batchId, generation: 1,
      storageKeys: [expect.objectContaining({ artifactId: 'artifact-id', storageKey: expect.stringContaining('__generation_1.csv'),
        provenance: expect.objectContaining({ trainingAnalysis: claim().options.trainingAnalysis }) })] }))
  })
  it('rejects quality or permission changes during generation and removes every unpublished file', async () => {
    mocks.revalidate.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('TRAINING_ANALYSIS_STALE'))
    await expect(runExportBatch(job)).rejects.toThrow('TRAINING_ANALYSIS_STALE')
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(mocks.fail).toHaveBeenCalledWith(claim().batchId, 1)
    expect(mocks.rm).toHaveBeenCalledWith('/safe/generated.csv', { force: true })
    expect(mocks.rm.mock.calls.some(([file]) => String(file).endsWith('__generation_1.csv'))).toBe(true)
  })
  it('keeps original generation fencing and cleans a stale generation without publishing bytes', async () => {
    mocks.publish.mockResolvedValue(false)
    expect(await runExportBatch(job)).toMatchObject({ skipped: true, staleGeneration: 1 })
    expect(mocks.rm.mock.calls.some(([file]) => String(file).endsWith('__generation_1.csv'))).toBe(true)
    expect(mocks.fail).not.toHaveBeenCalled()
  })
})
