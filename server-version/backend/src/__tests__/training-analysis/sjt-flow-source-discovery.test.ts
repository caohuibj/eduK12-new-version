import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
const globalRead = vi.hoisted(() => vi.fn(() => {throw new Error('SJT discovery used global database')}))
vi.mock('../../config/database', () => ({prisma: new Proxy({}, {get: () => globalRead})}))
import {listTrainingAnalysisSources} from '../../modules/training-analysis/source'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import * as security from '../../modules/assessment-runtime/security'
import * as scopeReader from '../../modules/composite/training-variant-scope'
import * as canonicalStorage from '../../modules/assessment-runtime/compact-assessment-storage'
import {createFrozenActiveSlotSet, encryptFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {createCanonicalUnitResultEnvelope, type CanonicalUnitResultCoreV1} from '../../modules/assessment-runtime/unit-result'
import {compileTrainingFlow, trainingFlowItemKey} from '../../modules/assessment-core/flow/training'
import {buildTrainingFlowUnits} from '../../modules/composite/training-flow-definition'
import {resolveTrainingFlowScope} from '../../modules/composite/training-flow-scope'
import {sourceAuthorityRow} from './source-authority-fixture'

const actor = {userId: 'teacher', role: 'TEACHER' as const}, publication = '2026-10-18T00:00:00.000Z'
beforeEach(() => {vi.clearAllMocks(); vi.stubEnv('DATA_ENCRYPTION_KEY', 'd'.repeat(64)); vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED', 'false')})
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllEnvs()})
async function fixture(count = 2) {
  const items = [0, 1].map(i => ({id: `sjt-${i}`, position: i, type: 'SITUATIONAL', required: true, situationalInstrumentKey: `sjt_${i}`, situationalInstrumentVersion: '1'}))
  const task: any = {id: 'task', name: 'SJT flow', createdBy: actor.userId, productKind: 'QUESTIONNAIRE', publishedAt: new Date(publication), items, formSections: [],
    trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null, trainingFlowDraft: null}
  const config = compileTrainingFlow({schemaVersion: 1, blocks: items.map((item, i) => ({blockKey: `sjt_${i}`, kind: 'INSTRUMENT', instrumentKey: trainingFlowItemKey(item.id)}))}, buildTrainingFlowUnits(task))
  task.trainingFlowFrozen = config; task.trainingFlowDigest = config.flowDigest
  const slots = createFrozenActiveSlotSet({schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots: items.map((item, i) => ({
    slotKey: `situational:${item.id}`, unitType: 'SITUATIONAL', required: true,
    sourceDefinitionIdentity: {key: item.situationalInstrumentKey, version: '1', hash: `${i + 1}`.repeat(64)},
    sourceBinding: {compositeItemId: item.id, compiledRuntimeHash: `${i + 3}`.repeat(64)},
    runtimeIdentity: {instrumentKey: item.situationalInstrumentKey, instrumentVersion: '1', definitionHash: `${i + 1}`.repeat(64),
      compiledRuntimeHash: `${i + 3}`.repeat(64), scorerKey: 'sjt', scoringVersion: '1', runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', frozenAt: publication},
  }))})
  const parents: any[] = [], accepted: any[] = [], discovery: any[] = []
  const db: any = {
    user: {findFirst: vi.fn(async () => ({id: actor.userId, role: actor.role, expiresAt: null}))},
    course: {findFirst: vi.fn(async () => ({id: 'course', creatorId: actor.userId}))}, relationalAssessmentAssignment: {findMany: vi.fn(async () => [])},
    compositeAssessment: {findMany: vi.fn(async () => [task])}, assessment: {findMany: vi.fn(async () => {throw new Error('SJT discovery read Scale children')})},
    assessmentUnitSnapshot: {findMany: vi.fn(async (query: any) => query.include ? discovery : accepted)},
    $queryRaw: vi.fn(async (parts: TemplateStringsArray) => {
      if (parts.join('').includes('FROM courses c JOIN users')) return [sourceAuthorityRow()]
      if (parts.join('').includes('assessment_run_executions')) return []
      throw new Error('Unexpected SJT discovery SQL')
    }),
  }
  for (let n = 0; n < count; n++) {
    const parent: any = {id: `parent-${n}`, compositeAssessmentId: task.id, deliveryCourseId: 'course', participantKey: `participant-${n}`, assignmentRef: null,
      runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', attemptEpoch: 1, status: 'IN_PROGRESS', contextSnapshotHash: null,
      trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null, trainingFlowPathEncrypted: null, trainingFlowPathHash: null,
      frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slots), frozenActiveSlotSetHash: slots.snapshotHash}
    const snapshot = {schemaVersion: 1, compositeId: task.id, publishedAt: publication, attemptId: parent.id, attemptEpoch: 1,
      flowDigest: config.flowDigest, unionDigest: config.unionDigest, slotSetHash: slots.snapshotHash}
    parent.trainingFlowSnapshotEncrypted = security.encryptUnifiedRuntimePayload(snapshot); parent.trainingFlowSnapshotHash = canonicalHash(snapshot)
    const rows = items.map((item, i) => {
      const slot = slots.slots[i], childId = `child-${n}-${i}`, submissionId = `submission-${n}-${i}`
      const core: CanonicalUnitResultCoreV1 = {schemaVersion: 1, unitType: 'SITUATIONAL', instrumentKey: item.situationalInstrumentKey, instrumentVersion: '1',
        sourceDefinitionHash: slot.sourceDefinitionIdentity.hash, compilerVersion: '1', compiledRuntimeHash: slot.sourceBinding.compiledRuntimeHash!, scorerKey: 'sjt', scorerVersion: '1',
        contextHash: null, quality: {status: 'interpretable', flags: []}, metrics: [{key: 'score', value: i, unit: 'score', quality: 'calculated'}], facts: [], references: [],
        scientificProvenance: {instrumentKey: item.situationalInstrumentKey, instrumentVersion: '1'}}
      const envelope = createCanonicalUnitResultEnvelope({core, completedAt: new Date(publication), persistenceProvenance: {sourceType: 'SITUATIONAL_ATTEMPT', sourceAttemptId: childId, sourceSubmissionId: submissionId}})
      return {id: `snapshot-${n}-${i}`, compositeAttemptId: parent.id, attemptEpoch: 1, slotKey: slot.slotKey, unitType: 'SITUATIONAL', terminalState: 'COMPLETED', payloadKind: 'UNIT_RESULT',
        sourceType: 'SITUATIONAL_ATTEMPT', sourceAttemptId: childId, sourceSubmissionId: submissionId, sourceDefinitionHash: core.sourceDefinitionHash,
        compiledRuntimeHash: core.compiledRuntimeHash, canonicalResultEncrypted: security.encryptUnifiedRuntimePayload(envelope), collectionFactsEncrypted: null, completedAt: new Date(publication)}
    })
    const proof = await resolveTrainingFlowScope(parent, task, {db, frozenSlots: slots, snapshotRows: rows, allowAdvance: true})
    parent.trainingFlowPathEncrypted = security.encryptUnifiedRuntimePayload(proof!.evidence); parent.trainingFlowPathHash = proof!.pathHash; parent.status = 'COMPLETED'
    parents.push(parent); accepted.push(...rows)
    // Prisma may materialize a distinct parent object for each relation row.
    discovery.push(...rows.map(row => ({...row, compositeAttempt: {...parent}})))
  }
  return {task, parents, accepted, discovery, db}
}

describe('SJT flow source discovery batches authenticated parent scopes', () => {
  it.each([1, 3])('uses two bounded snapshot calls for %s parents with two SJT rows each', async count => {
    const f = await fixture(count), decrypt = vi.spyOn(security, 'decryptUnifiedRuntimePayload'), resolver = vi.spyOn(scopeReader, 'resolveTrainingAttemptScope'), canonical = vi.spyOn(canonicalStorage, 'loadStoredCanonicalUnitResults')
    const result = await listTrainingAnalysisSources(f.db, actor, 'course')
    expect(result.list[0].metrics).toEqual(f.task.items.map((item: any) => ({itemId: item.id, metricKey: 'score', label: 'score'})))
    expect(f.db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(2)
    const [initial, batch] = f.db.assessmentUnitSnapshot.findMany.mock.calls.map(([query]: any) => query)
    expect(initial).toMatchObject({take: 6001, where: {unitType: 'SITUATIONAL'}})
    expect(batch).toMatchObject({take: 6001, where: {OR: f.parents.map(parent => ({compositeAttemptId: parent.id, attemptEpoch: 1}))}})
    expect(resolver).toHaveBeenCalledTimes(count); expect(canonical).not.toHaveBeenCalled()
    for (const parent of f.parents) {
      expect(decrypt.mock.calls.filter(([cipher]) => cipher === parent.trainingFlowPathEncrypted)).toHaveLength(1)
      expect(decrypt.mock.calls.filter(([cipher]) => cipher === parent.trainingFlowSnapshotEncrypted)).toHaveLength(1)
    }
    expect(f.db.assessment.findMany).not.toHaveBeenCalled(); expect(globalRead).not.toHaveBeenCalled()
  })
  it('keeps legacy scopes uncached and does not add a legacy snapshot batch', async () => {
    const f = await fixture()
    Object.assign(f.task, {trainingFlowDraft: null, trainingFlowFrozen: null, trainingFlowDigest: null})
    for (const row of f.discovery) Object.assign(row.compositeAttempt, {trainingFlowSnapshotEncrypted: null, trainingFlowSnapshotHash: null, trainingFlowPathEncrypted: null, trainingFlowPathHash: null})
    const resolver = vi.spyOn(scopeReader, 'resolveTrainingAttemptScope')
    await listTrainingAnalysisSources(f.db, actor, 'course')
    expect(f.db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1); expect(resolver).toHaveBeenCalledTimes(4)
  })
  it.each(['contextSnapshotHash', 'trainingFlowPathHash', 'trainingFlowSnapshotHash'])('rejects reuse after the same parent changes %s', async field => {
    const f = await fixture(1); f.discovery[1].compositeAttempt[field] = 'f'.repeat(64)
    await expect(listTrainingAnalysisSources(f.db, actor, 'course')).rejects.toMatchObject({statusCode: 403})
    expect(f.db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(2)
  })
  it('rejects a forged row-parent header before requesting a flow batch', async () => {
    const f = await fixture(); f.discovery[0].compositeAttemptId = 'outside-parent'
    await expect(listTrainingAnalysisSources(f.db, actor, 'course')).rejects.toMatchObject({statusCode: 409})
    expect(f.db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
  })
  it.each(['parent', 'epoch'])('rejects an accepted snapshot outside the batch %s binding', async mode => {
    const f = await fixture()
    if (mode === 'parent') f.accepted[0].compositeAttemptId = 'outside-parent'
    else f.accepted[0].attemptEpoch++
    await expect(listTrainingAnalysisSources(f.db, actor, 'course')).rejects.toMatchObject({statusCode: 409})
    expect(f.db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(2)
  })
  it('rejects publication changes rather than reusing a path from another publication', async () => {
    const f = await fixture(); f.task.publishedAt = new Date('2026-10-19T00:00:00.000Z')
    await expect(listTrainingAnalysisSources(f.db, actor, 'course')).rejects.toMatchObject({statusCode: 403})
  })
  it('rejects changed accepted evidence even when discovered SJT metric rows look valid', async () => {
    const f = await fixture(); f.accepted[0].sourceSubmissionId = 'forged'
    await expect(listTrainingAnalysisSources(f.db, actor, 'course')).rejects.toMatchObject({statusCode: 403})
  })
  it('rejects a valid-looking discovery envelope that differs from authenticated accepted evidence', async () => {
    const f = await fixture(), original = security.decryptUnifiedRuntimePayload<any>(f.discovery[0].canonicalResultEncrypted)
    const changed = createCanonicalUnitResultEnvelope({...original, core: {...original.core, metrics: [{key: 'forged_metric', value: 1, unit: 'score', quality: 'calculated'}]}})
    f.discovery[0].canonicalResultEncrypted = security.encryptUnifiedRuntimePayload(changed)
    await expect(listTrainingAnalysisSources(f.db, actor, 'course')).rejects.toMatchObject({statusCode: 409})
  })
  it.each(['discovery', 'flow-batch'])('rejects %s overflow instead of silently truncating evidence', async mode => {
    const f = await fixture()
    const overflow = Array(6001).fill(mode === 'discovery' ? f.discovery[0] : f.accepted[0])
    f.db.assessmentUnitSnapshot.findMany.mockImplementation(async (query: any) => query.include ? (mode === 'discovery' ? overflow : f.discovery) : overflow)
    await expect(listTrainingAnalysisSources(f.db, actor, 'course')).rejects.toMatchObject({statusCode: 400})
    expect(f.db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(mode === 'discovery' ? 1 : 2)
  })
  it('does not run discovery or flow queries after course authorization is denied', async () => {
    const f = await fixture(); f.db.$queryRaw.mockResolvedValue([])
    await expect(listTrainingAnalysisSources(f.db, actor, 'course')).rejects.toMatchObject({statusCode: 404})
    expect(f.db.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled()
  })
})
