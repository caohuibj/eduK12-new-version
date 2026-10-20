import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
const globalRead = vi.hoisted(() => vi.fn(() => {throw new Error('Discovery used global database')}))
vi.mock('../../config/database', () => ({prisma: new Proxy({}, {get: () => globalRead})}))
import {listTrainingAnalysisSources, TRAINING_ANALYSIS_SOURCE_LIMIT} from '../../modules/training-analysis/source'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import * as security from '../../modules/assessment-runtime/security'
import * as canonicalStorage from '../../modules/assessment-runtime/compact-assessment-storage'
import {createFrozenActiveSlotSet, encryptFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {createFrozenScaleRuntimeSnapshot, type VersionedFrozenScaleRuntimeSnapshot} from '../../modules/assessment-runtime/runtime-snapshot'
import {createFrozenScaleRuntimeSnapshotV2FromV1} from '../../modules/assessment-runtime/runtime-snapshot-v2'
import {createSharedScaleRuntimeStore, type SharedScaleArtifactRecord} from '../../modules/assessment-runtime/shared-scale-runtime'
import {getScaleInstrumentSource} from '../../modules/scale/onboarding/instrument-registry'
import {compileScalePolicy} from '../../modules/scale/policy/compile'
import {DISCLOSURE_PRESETS} from '../../modules/scale/policy/disclosure'
import {buildScaleResult} from '../../modules/scale/scale-result'
import {compileTrainingFlow, trainingFlowItemKey} from '../../modules/assessment-core/flow/training'
import {buildTrainingFlowUnits} from '../../modules/composite/training-flow-definition'
import {resolveTrainingFlowScope} from '../../modules/composite/training-flow-scope'
import {createCanonicalUnitResultEnvelope, projectScaleCanonicalUnitResult} from '../../modules/assessment-runtime/unit-result'
import {sourceAuthorityRow} from './source-authority-fixture'

const actor = {userId: 'teacher', role: 'TEACHER' as const}, publication = '2026-10-18T00:00:00.000Z'
beforeEach(() => {vi.clearAllMocks(); vi.stubEnv('DATA_ENCRYPTION_KEY', 'c'.repeat(64)); vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED', 'false')})
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllEnvs()})
function runtime(options: {v?: 1 | 2; numeric?: boolean; key?: string; definition?: any; time?: string} = {}) {
  const source = structuredClone(getScaleInstrumentSource('adexi_v1', '2.0.0')!)
  const v1 = createFrozenScaleRuntimeSnapshot({instrumentKey: options.key ?? source.identity.instrumentKey,
    instrumentVersion: source.identity.instrumentVersion, definition: options.definition ?? source.executable!.definition, frozenAt: new Date(options.time ?? publication)})
  return options.v === 1 ? v1 : createFrozenScaleRuntimeSnapshotV2FromV1(v1, compileScalePolicy({...source,
    disclosure: {...source.disclosure!, audiences: {teacher: options.numeric === false ? DISCLOSURE_PRESETS.EDUCATIONAL_ONLY() : DISCLOSURE_PRESETS.SCORES(), researcher: DISCLOSURE_PRESETS.FULL_REPORT()}}}))
}
const expected = (r: VersionedFrozenScaleRuntimeSnapshot, itemId = 'scale-item') => r.definition.scoring.scores.map(score => ({itemId, metricKey: score.key, label: score.label}))
function fixture(r: VersionedFrozenScaleRuntimeSnapshot = runtime(), instrumentClass = 'STANDARD') {
  const item: any = {id: 'scale-item', type: 'SCALE', position: 0, required: true, scaleId: 'scale',
    scale: {id: 'scale', code: 'EDITABLE-IDENTITY-IGNORED', instrumentVersion: '999', instrumentClass}}
  Object.defineProperty(item.scale, 'definition', {get: () => {throw new Error('Editable definition must not be read')}})
  const task: any = {id: 'task', name: 'Task', createdBy: 'teacher', productKind: 'QUESTIONNAIRE', publishedAt: new Date(publication), items: [item], formSections: [],
    trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null, trainingFlowDraft: null, trainingFlowFrozen: null, trainingFlowDigest: null}
  const parent: any = {id: 'parent', compositeAssessmentId: task.id, participantKey: 'participant', deliveryCourseId: 'course', assignmentRef: null, respondentType: 'SELF',
    status: 'COMPLETED', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, contextSnapshotHash: null,
    trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null, trainingFlowSnapshotEncrypted: null, trainingFlowSnapshotHash: null, trainingFlowPathEncrypted: null, trainingFlowPathHash: null}
  const child: any = {id: 'child', compositeAttemptId: parent.id, compositeAttempt: parent, compositeItemId: item.id, scaleId: item.scaleId,
    status: 'COMPLETED', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, submissionId: 'submit', submissionPayloadHash: 'a'.repeat(64),
    runtimeSnapshotEncrypted: security.encryptUnifiedRuntimePayload(r), compiledRuntimeHash: r.compiledRuntime.compiledRuntimeHash}
  for (const field of ['result', 'answers', 'rawAnswersEncrypted']) Object.defineProperty(child, field, {get: () => {throw new Error(`Discovery read ${field}`)}})
  const rows = [child], artifacts = new Map<string, SharedScaleArtifactRecord>()
  const db: any = {
    authorityRow: sourceAuthorityRow(),
    user: {findFirst: vi.fn(async () => ({id: actor.userId, role: actor.role, expiresAt: null}))},
    course: {findFirst: vi.fn(async () => ({id: 'course', creatorId: actor.userId}))},
    relationalAssessmentAssignment: {findMany: vi.fn(async () => [])}, compositeAssessment: {findMany: vi.fn(async () => [task])},
    assessment: {findMany: vi.fn(async () => rows)}, assessmentUnitSnapshot: {findMany: vi.fn(async () => [])},
    $queryRaw: vi.fn(async (parts: TemplateStringsArray) => {
      const sql = parts.join('')
      if (sql.includes('FROM courses c JOIN users')) return db.authorityRow ? [db.authorityRow] : []
      if (sql.includes('assessment_run_executions')) return []
      if (sql.includes('assessment_runtime_artifacts')) return [...artifacts.values()]
      throw new Error(`Unexpected discovery SQL: ${sql}`)
    }),
  }
  const bindSlots = (p = parent, rs: Array<{item: any; runtime: VersionedFrozenScaleRuntimeSnapshot}> = [{item, runtime: r}]) => {
    const slots = createFrozenActiveSlotSet({schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: p.attemptEpoch, slots: rs.map(({item: i, runtime: value}) => ({
      slotKey: `scale:${i.id}`, unitType: 'SCALE', required: true,
      sourceDefinitionIdentity: {key: value.instrumentKey, version: value.instrumentVersion, hash: value.sourceDefinitionHash},
      sourceBinding: {compositeItemId: i.id, compiledRuntimeHash: value.compiledRuntime.compiledRuntimeHash},
    }))})
    p.frozenActiveSlotSetEncrypted = encryptFrozenActiveSlotSet(slots); p.frozenActiveSlotSetHash = slots.snapshotHash
    return slots
  }
  bindSlots()
  const add = (value = r, id = `parent-${rows.length}`) => {
    const p = {...parent, id, participantKey: id}; bindSlots(p, [{item, runtime: value}])
    const c = {...child, id: `child-${id}`, compositeAttemptId: id, compositeAttempt: p, runtimeSnapshotEncrypted: security.encryptUnifiedRuntimePayload(value), compiledRuntimeHash: value.compiledRuntime.compiledRuntimeHash}
    rows.push(c); return c
  }
  const share = async (value = r) => createSharedScaleRuntimeStore({find: async key => artifacts.get(key) ?? null,
    insert: async row => {artifacts.set(row.artifactHash, row); return true}}).save(value)
  return {r, item, task, parent, child, rows, artifacts, db, bindSlots, add, share}
}
async function flowFixture() {
  const f = fixture(), second = {...f.item, id: 'scale-second', position: 1}
  f.task.items.push(second)
  f.rows.push({...f.child, id: 'child-second', compositeItemId: second.id, submissionId: 'submit-second'})
  const slots = f.bindSlots(f.parent, f.task.items.map((item: any) => ({item, runtime: f.r})))
  const config = compileTrainingFlow({schemaVersion: 1, blocks: f.task.items.map((item: any) => ({blockKey: item.id, kind: 'INSTRUMENT', instrumentKey: trainingFlowItemKey(item.id)}))}, buildTrainingFlowUnits(f.task))
  f.task.trainingFlowFrozen = config; f.task.trainingFlowDigest = config.flowDigest
  const snapshot = {schemaVersion: 1, compositeId: f.task.id, publishedAt: publication, attemptId: f.parent.id, attemptEpoch: 1, flowDigest: config.flowDigest, unionDigest: config.unionDigest, slotSetHash: slots.snapshotHash}
  f.parent.trainingFlowSnapshotEncrypted = security.encryptUnifiedRuntimePayload(snapshot); f.parent.trainingFlowSnapshotHash = canonicalHash(snapshot)
  const source = getScaleInstrumentSource('adexi_v1', '2.0.0')!
  const result = buildScaleResult({scaleId: 'scale', instrumentKey: f.r.instrumentKey, name: 'Scale', instrumentVersion: f.r.instrumentVersion,
    definition: f.r.definition, answers: source.executable!.goldenCases[0].answers, referenceSets: []})
  const snapshots = f.rows.map(child => {
    const envelope = createCanonicalUnitResultEnvelope({core: projectScaleCanonicalUnitResult({result, runtime: f.r.compiledRuntime, contextHash: null}), completedAt: new Date(publication),
      persistenceProvenance: {sourceType: 'ASSESSMENT', sourceAttemptId: child.id, sourceSubmissionId: child.submissionId}})
    return {id: `snapshot-${child.id}`, compositeAttemptId: f.parent.id, attemptEpoch: 1, slotKey: `scale:${child.compositeItemId}`, unitType: 'SCALE', terminalState: 'COMPLETED',
      payloadKind: 'UNIT_RESULT', sourceType: 'ASSESSMENT', sourceAttemptId: child.id, sourceSubmissionId: child.submissionId,
      sourceDefinitionHash: f.r.sourceDefinitionHash, compiledRuntimeHash: f.r.compiledRuntime.compiledRuntimeHash,
      canonicalResultEncrypted: security.encryptUnifiedRuntimePayload(envelope), collectionFactsEncrypted: null, completedAt: new Date(publication)}
  })
  f.parent.status = 'IN_PROGRESS'
  const proof = await resolveTrainingFlowScope(f.parent, f.task, {db: f.db, frozenSlots: slots, snapshotRows: snapshots, allowAdvance: true})
  f.parent.trainingFlowPathEncrypted = security.encryptUnifiedRuntimePayload(proof!.evidence); f.parent.trainingFlowPathHash = proof!.pathHash; f.parent.status = 'COMPLETED'
  f.db.assessmentUnitSnapshot.findMany.mockResolvedValue(snapshots)
  return {...f, snapshots}
}

describe('Training Scale source discovery uses frozen runtime dictionaries', () => {
  it.each([1, 2] as const)('advertises the exact V%s scoring.scores dictionary without reading editable definitions or results', async v => {
    const f = fixture(runtime({v})), result = await listTrainingAnalysisSources(f.db, actor, 'course')
    expect(result.list[0].metrics).toEqual(expected(f.r)); expect(result.list).toHaveLength(1)
    const query = f.db.assessment.findMany.mock.calls[0][0]
    expect(query.take).toBe(6001); expect(query.where.compositeAttempt.is).toMatchObject({deliveryCourseId: 'course', compositeAssessmentId: {in: ['task']}, AND: [{OR: [{assignmentRef: null}, {assignmentRef: {in: []}}]}]})
    expect(query.select).not.toHaveProperty('result'); expect(query.select).not.toHaveProperty('answers')
    expect(query.select.compositeAttempt.select).not.toHaveProperty('contextSnapshotEncrypted')
    expect(f.db.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled(); expect(f.db.$queryRaw).toHaveBeenCalledTimes(2); expect(globalRead).not.toHaveBeenCalled()
  })
  it.each([1, 2] as const)('batch-loads shared V%s artifacts once and deduplicates exact reference/inline ciphertext reads', async v => {
    const f = fixture(runtime({v})); f.child.runtimeSnapshotEncrypted = await f.share()
    const second = f.add(); second.runtimeSnapshotEncrypted = f.child.runtimeSnapshotEncrypted
    const third = f.add(); third.runtimeSnapshotEncrypted = security.encryptUnifiedRuntimePayload(security.decryptUnifiedRuntimePayload(f.child.runtimeSnapshotEncrypted))
    const decrypt = vi.spyOn(security, 'decryptUnifiedRuntimePayload')
    const result = await listTrainingAnalysisSources(f.db, actor, 'course')
    expect(result.list[0].metrics).toEqual(expected(f.r)); expect(f.db.assessment.findMany).toHaveBeenCalledTimes(1)
    expect(f.db.$queryRaw.mock.calls.filter(([parts]: any) => parts.join('').includes('assessment_runtime_artifacts'))).toHaveLength(1)
    expect(decrypt.mock.calls.filter(([cipher]) => cipher === f.child.runtimeSnapshotEncrypted)).toHaveLength(1)
    expect(decrypt.mock.calls.filter(([cipher]) => cipher === [...f.artifacts.values()][0].payloadEncrypted)).toHaveLength(1)
    expect(f.db.$queryRaw.mock.calls.some(([parts]: any) => /assessment_result_facts|raw_answers/.test(parts.join('')))).toBe(false)
  })
  it('decrypts one repeated inline runtime once across multiple parents', async () => {
    const f = fixture(); f.add().runtimeSnapshotEncrypted = f.child.runtimeSnapshotEncrypted
    const decrypt = vi.spyOn(security, 'decryptUnifiedRuntimePayload')
    await listTrainingAnalysisSources(f.db, actor, 'course')
    expect(decrypt.mock.calls.filter(([cipher]) => cipher === f.child.runtimeSnapshotEncrypted)).toHaveLength(1)
  })
  it.each(['TEACHER', 'ADMIN'] as const)('keeps %s at teacher numericScores disclosure despite researcher access', async role => {
    const f = fixture(runtime({numeric: false}))
    expect((await listTrainingAnalysisSources(f.db, {...actor, role}, 'course')).list).toEqual([])
  })
  it.each(['STANDARD', 'CUSTOM_DESCRIPTIVE'])('uses explicit V1 %s policy without guessing an unknown instrument class', async instrumentClass => {
    const f = fixture(runtime({v: 1, key: 'unknown_training_scale'}), instrumentClass)
    const result = await listTrainingAnalysisSources(f.db, actor, 'course')
    expect(result.list).toHaveLength(instrumentClass === 'CUSTOM_DESCRIPTIVE' ? 1 : 0)
  })
  it.each(['actor', 'course', 'task', 'governed'])('does not read Scale children after %s authority exclusion', async mode => {
    const f = fixture()
    if (mode === 'actor' || mode === 'course') f.db.authorityRow = null
    if (mode === 'task') f.db.compositeAssessment.findMany.mockResolvedValue([])
    if (mode === 'governed') f.db.$queryRaw.mockImplementation(async (parts:TemplateStringsArray)=>parts.join('').includes('FROM courses c JOIN users')?[f.db.authorityRow]:[{id:'task'}])
    if (mode === 'actor' || mode === 'course') await expect(listTrainingAnalysisSources(f.db, actor, 'course')).rejects.toMatchObject({statusCode: 404})
    else expect((await listTrainingAnalysisSources(f.db, actor, 'course')).list).toEqual([])
    expect(f.db.assessment.findMany).not.toHaveBeenCalled()
  })
  it.each(['absent', 'older epoch'])('does not use a live-definition fallback for %s frozen children', async mode => {
    const f = fixture(); if (mode === 'absent') f.rows.length = 0; else f.child.attemptEpoch = 0
    expect((await listTrainingAnalysisSources(f.db, actor, 'course')).list).toEqual([])
  })
  it.each(['cipher', 'unknown-version', 'snapshot-hash', 'compiled-hash', 'scale-id', 'parent-id', 'course', 'unassigned-item'])('fails closed for damaged or mismatched %s', async mode => {
    const f = fixture()
    if (mode === 'cipher') f.child.runtimeSnapshotEncrypted = 'POISON'
    if (mode === 'unknown-version') f.child.runtimeSnapshotEncrypted = security.encryptUnifiedRuntimePayload({...f.r, schemaVersion: 999})
    if (mode === 'snapshot-hash') f.child.runtimeSnapshotEncrypted = security.encryptUnifiedRuntimePayload({...f.r, snapshotHash: '0'.repeat(64)})
    if (mode === 'compiled-hash') f.child.compiledRuntimeHash = '0'.repeat(64)
    if (mode === 'scale-id') f.child.scaleId = 'wrong-scale'
    if (mode === 'parent-id') f.child.compositeAttemptId = 'wrong-parent'
    if (mode === 'course') f.parent.deliveryCourseId = 'wrong-course'
    if (mode === 'unassigned-item') f.child.compositeItemId = 'unknown-item'
    await expect(listTrainingAnalysisSources(f.db, actor, 'course')).rejects.toMatchObject({statusCode: 409})
  })
  it.each(['missing', 'corrupt', 'duplicate', 'wrong-reference-hash'])('rejects a %s shared runtime artifact', async mode => {
    const f = fixture(); f.child.runtimeSnapshotEncrypted = await f.share()
    if (mode === 'missing') f.artifacts.clear()
    if (mode === 'corrupt') [...f.artifacts.values()][0].payloadEncrypted = 'POISON'
    if (mode === 'duplicate') f.db.$queryRaw.mockImplementation(async (parts: TemplateStringsArray) => parts.join('').includes('assessment_runtime_artifacts') ? [...f.artifacts.values(), ...f.artifacts.values()]
      : parts.join('').includes('FROM courses c JOIN users') ? [f.db.authorityRow] : [])
    if (mode === 'wrong-reference-hash') f.child.runtimeSnapshotEncrypted = security.encryptUnifiedRuntimePayload({...security.decryptUnifiedRuntimePayload<any>(f.child.runtimeSnapshotEncrypted), snapshotHash: '0'.repeat(64)})
    await expect(listTrainingAnalysisSources(f.db, actor, 'course')).rejects.toMatchObject({statusCode: 409})
  })
  it('keeps all exact V1/V2 versions and timestamp variants without choosing latest or first', async () => {
    const f = fixture(runtime({v: 1})); f.add(runtime({v: 2})); f.add(runtime({v: 2, time: '2026-10-19T00:00:00.000Z'}))
    expect((await listTrainingAnalysisSources(f.db, actor, 'course')).list[0].metrics).toEqual(expected(f.r))
  })
  it.each(['label', 'scoring'])('rejects conflicting frozen %s under an indistinguishable item/metric selector', async mode => {
    const f = fixture(runtime({v: 1})), definition = structuredClone(f.r.definition)
    if (mode === 'label') definition.scoring.scores[0].label += ' changed'
    else definition.scoring.scoringVersion += '-changed'
    f.add(runtime({v: 1, definition}))
    await expect(listTrainingAnalysisSources(f.db, actor, 'course')).rejects.toMatchObject({statusCode: 409})
  })
  it('unions distinct legitimate frozen metric keys and does not promote a hidden dictionary', async () => {
    const one = (index: number) => {
      const definition = structuredClone(getScaleInstrumentSource('adexi_v1', '2.0.0')!.executable!.definition), score = definition.scoring.scores[index]
      definition.scoring.scores = [score]; definition.report.primaryScoreKeys = [score.key]; definition.report.scoreOrder = [score.key]
      definition.report.interpretations = []; definition.referencePolicy = {type: 'none'}
      return runtime({v: 1, definition})
    }
    const a = one(0), b = one(1), f = fixture(a); f.add(b); f.add(runtime({numeric: false}))
    expect((await listTrainingAnalysisSources(f.db, actor, 'course')).list[0].metrics).toEqual([...expected(a), ...expected(b)])
  })
  it('rejects child-query overflow before decrypting any runtime', async () => {
    const f = fixture(); f.db.assessment.findMany.mockResolvedValue(Array(TRAINING_ANALYSIS_SOURCE_LIMIT + 1).fill(f.child))
    const decrypt = vi.spyOn(security, 'decryptUnifiedRuntimePayload')
    await expect(listTrainingAnalysisSources(f.db, actor, 'course')).rejects.toMatchObject({statusCode: 400})
    expect(decrypt).not.toHaveBeenCalled()
  })
  it('reuses one authenticated flow scope and one bounded snapshot batch for two children without expanding result facts', async () => {
    const f = await flowFixture(), canonical = vi.spyOn(canonicalStorage, 'loadStoredCanonicalUnitResults'), decrypt = vi.spyOn(security, 'decryptUnifiedRuntimePayload')
    const result = await listTrainingAnalysisSources(f.db, actor, 'course')
    expect(result.list[0].metrics).toEqual([...expected(f.r), ...expected(f.r, 'scale-second')])
    expect(f.db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
    expect(f.db.assessmentUnitSnapshot.findMany.mock.calls[0][0]).toMatchObject({take: 6001, where: {OR: [{compositeAttemptId: 'parent', attemptEpoch: 1}]}})
    expect(canonical).not.toHaveBeenCalled()
    expect(decrypt.mock.calls.filter(([cipher]) => f.snapshots.some(row => row.canonicalResultEncrypted === cipher))).toHaveLength(0)
    expect(decrypt.mock.calls.filter(([cipher]) => cipher === f.parent.trainingFlowPathEncrypted)).toHaveLength(1)
  })
  it('rejects a completed child that is not the accepted flow submission', async () => {
    const f = await flowFixture(); f.child.submissionId = 'unaccepted-submission'
    await expect(listTrainingAnalysisSources(f.db, actor, 'course')).rejects.toMatchObject({statusCode: 409})
  })
  it('rejects flow-snapshot overflow without truncating accepted evidence', async () => {
    const f = await flowFixture(); f.db.assessmentUnitSnapshot.findMany.mockResolvedValue(Array(6001).fill(f.snapshots[0]))
    await expect(listTrainingAnalysisSources(f.db, actor, 'course')).rejects.toMatchObject({statusCode: 400})
  })
  it.each(['path-hash', 'snapshot-binding'])('rejects flow %s tampering before runtime discovery', async mode => {
    const f = await flowFixture()
    if (mode === 'path-hash') f.parent.trainingFlowPathHash = '0'.repeat(64)
    else f.snapshots[0].sourceSubmissionId = 'forged'
    await expect(listTrainingAnalysisSources(f.db, actor, 'course')).rejects.toMatchObject({statusCode: 403})
  })
})
