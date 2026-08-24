import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import type { CognitivePackageAnalysisResult } from '../../modules/cognitive-analysis/cognitive-analysis.types'
import type { CompletionSnapshotExpectation } from '../../modules/composite/composite-analysis-snapshot.service'

/**
 * PR8 real PostgreSQL checks. The suite is opt-in so the normal unit-test
 * command never touches a developer database:
 *
 *   PR8_INTEGRATION_DATABASE_URL=postgresql://... npm run test:integration:pr8
 */
const DB_URL = process.env.PR8_INTEGRATION_DATABASE_URL
const suite = DB_URL ? describe : describe.skip

let prisma: PrismaClient
let persistOrGetPackageAnalysisSnapshot: typeof import('../../modules/composite/composite-analysis-snapshot.service')['persistOrGetPackageAnalysisSnapshot']
let readCompletionPackageAnalysisSnapshot: typeof import('../../modules/composite/composite-analysis-snapshot.service')['readCompletionPackageAnalysisSnapshot']
let userId: string
let assessmentId: string
let attemptId: string

const makeAnalysis = (): CognitivePackageAnalysisResult => ({
  packageKey: 'attention_stability_v1',
  packageVersion: '1.0.0',
  analysisProtocolKey: 'attention_stability_v1',
  analysisProtocolVersion: '1.0.0',
  profile: 'standard',
  analysisVersion: 'cognitive-evidence-domain-v1.0.0',
  reportSchemaVersion: 'cognitive-package-analysis-v1',
  qualitySummary: { interpretableModules: 0, excludedModules: [], warnings: [] },
  evidence: [],
  cognitiveDomains: [],
  crossSourceFindings: [],
  recommendations: [],
  limitations: [],
  provenance: {
    attemptId,
    assessmentId,
    packageKey: 'attention_stability_v1',
    packageVersion: '1.0.0',
    packageSnapshotVersion: '1',
    analysisProtocolKey: 'attention_stability_v1',
    analysisProtocolVersion: '1.0.0',
    analysisProtocolSnapshotVersion: '1',
    profile: 'standard',
    packageReportDefinitionVersion: 'report-package-v1',
    domainDefinitionVersion: '1.0.0',
    evidenceMappingVersion: '1.0.0',
    recommendationRuleVersion: '1.0.0',
  },
})

const expectation = (): CompletionSnapshotExpectation => ({
  attemptId,
  assessmentId,
  packageKey: 'attention_stability_v1',
  packageVersion: '1.0.0',
  profile: 'standard',
  packageSnapshotVersion: '1',
  analysisProtocolKey: 'attention_stability_v1',
  analysisProtocolVersion: '1.0.0',
  analysisProtocolSnapshotVersion: '1',
  packageReportDefinitionVersion: 'report-package-v1',
  domainDefinitionVersion: '1.0.0',
  evidenceMappingVersion: '1.0.0',
  recommendationRuleVersion: '1.0.0',
})

const persist = (input: {
  analysis: CognitivePackageAnalysisResult
  inputFingerprint: string
  generationReason: 'COMPLETION' | 'REANALYSIS'
  generatedBy?: string | null
}) => persistOrGetPackageAnalysisSnapshot(prisma as any, {
  attemptId,
  ...input,
})

suite('PR8 package analysis snapshot PostgreSQL integration', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    const snapshotService = await import('../../modules/composite/composite-analysis-snapshot.service')
    persistOrGetPackageAnalysisSnapshot = snapshotService.persistOrGetPackageAnalysisSnapshot
    readCompletionPackageAnalysisSnapshot = snapshotService.readCompletionPackageAnalysisSnapshot
    prisma = new PrismaClient()

    const suffix = Date.now().toString(36)
    const user = await prisma.user.create({
      data: { username: `pr8snapshot${suffix}`, passwordHash: 'test-only', role: 'ADMIN' },
    })
    userId = user.id
    const assessment = await prisma.compositeAssessment.create({
      data: {
        code: `PR8-${suffix}`,
        name: 'PR8 snapshot integration fixture',
        createdBy: userId,
      },
    })
    assessmentId = assessment.id
    const attempt = await prisma.compositeAssessmentAttempt.create({
      data: {
        compositeAssessmentId: assessmentId,
        userId,
        participantKey: `pr8-participant-${suffix}`,
      },
    })
    attemptId = attempt.id
  })

  beforeEach(async () => {
    await prisma.compositeAnalysisSnapshot.deleteMany({ where: { attemptId } })
    await prisma.compositeAssessmentAttempt.update({
      where: { id: attemptId },
      data: { status: 'IN_PROGRESS', progress: 0, completedItems: 0, completedAt: null },
    })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.compositeAnalysisSnapshot.deleteMany({ where: { attemptId } }).catch(() => undefined)
    if (attemptId) await prisma.compositeAssessmentAttempt.delete({ where: { id: attemptId } }).catch(() => undefined)
    if (assessmentId) await prisma.compositeAssessment.delete({ where: { id: assessmentId } }).catch(() => undefined)
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
    await prisma.$disconnect()
  })

  it('enforces the unique tuple and preserves immutable attribution', async () => {
    const analysis = makeAnalysis()
    const first = await persist({
      analysis,
      inputFingerprint: 'a'.repeat(64),
      generationReason: 'COMPLETION',
    })
    const retry = await persist({
      analysis,
      inputFingerprint: 'a'.repeat(64),
      generationReason: 'REANALYSIS',
      generatedBy: userId,
    })
    const changedInput = await persist({
      analysis,
      inputFingerprint: 'b'.repeat(64),
      generationReason: 'REANALYSIS',
      generatedBy: userId,
    })

    expect(first).toMatchObject({ created: true, row: { generationReason: 'COMPLETION' } })
    expect(retry).toMatchObject({ created: false, row: { id: first.row.id, generationReason: 'COMPLETION', generatedBy: null } })
    expect(changedInput).toMatchObject({ created: true, row: { generationReason: 'REANALYSIS', generatedBy: userId } })
    expect(await prisma.compositeAnalysisSnapshot.count({ where: { attemptId } })).toBe(2)
  })

  it('rolls back the snapshot when the enclosing completion transaction fails', async () => {
    const before = await prisma.compositeAnalysisSnapshot.count({ where: { attemptId } })
    await expect(prisma.$transaction(async (tx) => {
      await persistOrGetPackageAnalysisSnapshot(tx as any, {
        attemptId,
        analysis: makeAnalysis(),
        inputFingerprint: 'c'.repeat(64),
        generationReason: 'COMPLETION',
      })
      await tx.compositeAssessmentAttempt.update({
        where: { id: attemptId },
        data: { status: 'COMPLETED', progress: 100, completedItems: 1 },
      })
      throw new Error('forced PR8 transaction rollback')
    })).rejects.toThrow('forced PR8 transaction rollback')

    expect(await prisma.compositeAnalysisSnapshot.count({ where: { attemptId } })).toBe(before)
    expect((await prisma.compositeAssessmentAttempt.findUnique({ where: { id: attemptId } }))?.status)
      .toBe('IN_PROGRESS')
  })

  it('serializes two real transactions on the Attempt and creates one row', async () => {
    const results = await Promise.all([1, 2].map(() => prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "composite_assessment_attempts" WHERE "id" = ${attemptId} FOR UPDATE`
      return persistOrGetPackageAnalysisSnapshot(tx as any, {
        attemptId,
        analysis: makeAnalysis(),
        inputFingerprint: 'd'.repeat(64),
        generationReason: 'COMPLETION',
      })
    })))

    expect(results.filter((result) => result.created)).toHaveLength(1)
    expect(results.filter((result) => !result.created)).toHaveLength(1)
    expect(await prisma.compositeAnalysisSnapshot.count({ where: { attemptId } })).toBe(1)
  })

  it('reads the encrypted completion payload with exact Attempt provenance', async () => {
    const analysis = makeAnalysis()
    const persisted = await persist({
      analysis,
      inputFingerprint: 'e'.repeat(64),
      generationReason: 'COMPLETION',
    })
    const snapshot = await readCompletionPackageAnalysisSnapshot(
      prisma as any,
      attemptId,
      expectation(),
    )

    expect(snapshot?.id).toBe(persisted.row.id)
    expect(snapshot?.payload).toEqual(analysis)
    expect(snapshot).not.toHaveProperty('payloadEncrypted')
  })
})
