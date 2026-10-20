import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { trainingManifestHash, type TrainingAnalysisManifestV1 } from '../../modules/training-analysis/manifest'
import type { TrainingAnalysisExportOptions } from '../../modules/training-analysis/export'

export const courseId = '10000000-0000-4000-8000-000000000001'
export const actor = { id: '20000000-0000-4000-8000-000000000001', role: 'TEACHER' as const }
export const selector = { schemaVersion: 1 as const, courseId, mode: 'PAIRWISE' as const,
  waves: [1, 2].map(n => ({ waveKey: `wave${n}`, taskId: `30000000-0000-4000-8000-00000000000${n}`,
    publication: '2026-10-01T00:00:00.000Z', configDigest: null, variantKey: null,
    metrics: [{ metricKey: 'numeric', itemId: `40000000-0000-4000-8000-00000000000${n}` }] })) }
export const manifest = (): TrainingAnalysisManifestV1 => {
  const sources = selector.waves.map((wave, index) => ({ waveKey: wave.waveKey, taskId: wave.taskId,
    attemptId: `50000000-0000-4000-8000-00000000000${index + 1}`, attemptEpoch: 1,
    sourceHash: canonicalHash({ immutable: index }), sourceHashes: { result: canonicalHash(index) },
    status: 'COMPLETED', taskSatisfaction: 'SATISFIED' }))
  const unsigned: Omit<TrainingAnalysisManifestV1, 'manifestHash'> = { schemaVersion: 1, kind: 'TRAINING_ANALYSIS',
    courseId, actor, selector, definitionHash: canonicalHash(selector), sourceHash: canonicalHash(sources),
    authorityHash: canonicalHash({ role: actor.role }), qualityHash: canonicalHash([]),
    sourceCutoff: '2026-10-18T00:00:00.000Z', sources, dictionary: [], observationCount: 2 }
  return { ...unsigned, manifestHash: trainingManifestHash(unsigned) }
}
export const exportOptions = (): TrainingAnalysisExportOptions => ({ version: 1, selector, manifest: manifest(), table: 'long' })
export const tables = () => ({
  long: { columns: ['participant', 'value', 'reason'], rows: [{ participant: '=HYPERLINK("unsafe")', value: 1, reason: null }] },
  wide: { columns: ['participant', 'wave1', 'wave2'], rows: [{ participant: 'P1', wave1: 1, wave2: 2 }] },
  dictionary: { columns: ['column', 'meaning'], rows: [{ column: 'wave1', meaning: 'Frozen numeric value' }] },
})
export const claim = () => ({ batchId: '60000000-0000-4000-8000-000000000001', generation: 1,
  resourceType: 'TRAINING_ANALYSIS' as const, resourceId: courseId, createdBy: actor.id,
  createdAt: new Date('2026-10-18T01:00:00.000Z'), artifactIds: ['artifact-id'],
  options: { anonymize: true, authorityTokenVersion: 1, creatorRole: actor.role, trainingAnalysis: exportOptions() } })
export const currentPrincipal = () => ({ userId: actor.id, role: actor.role, username: 'teacher',
  accountDomain: 'TRAINING' as const, platformRole: 'STANDARD' as const, tokenVersion: 1,
  isActive: true, isFrozen: false, expiresAt: null, teacherApproved: true, mustChangePassword: false })
