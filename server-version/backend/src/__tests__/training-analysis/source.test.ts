import {beforeEach, describe, expect, it, vi} from 'vitest'
const globalRead = vi.hoisted(() => vi.fn(() => {throw new Error('Global database used inside source transaction')}))
vi.mock('../../config/database', () => ({prisma: new Proxy({}, {get: () => globalRead})}))
import {loadTrainingAnalysisSources, listTrainingAnalysisSources} from '../../modules/training-analysis/source'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {createFrozenActiveSlotSet, encryptFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {mapCompositeSection} from '../../modules/assessment-runtime/form-section-definition'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {compileWeightedVariants, createWeightedVariantAllocation} from '../../modules/assessment-core/weighted-variants'
import {buildTrainingVariantUnion} from '../../modules/composite/training-variant-scope'
import {buildScaleResult} from '../../modules/scale/scale-result'
import {getScaleInstrumentSource} from '../../modules/scale/onboarding/instrument-registry'
import {createFrozenScaleRuntimeSnapshot} from '../../modules/assessment-runtime/runtime-snapshot'
import {createFrozenScaleRuntimeSnapshotV2FromV1} from '../../modules/assessment-runtime/runtime-snapshot-v2'
import {compileScalePolicy} from '../../modules/scale/policy/compile'
import {encryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
import {DISCLOSURE_PRESETS} from '../../modules/scale/policy/disclosure'
import {createCanonicalUnitResultEnvelope, projectScaleCanonicalUnitResult} from '../../modules/assessment-runtime/unit-result'
import type {TrainingAnalysisRequestV1} from '../../modules/training-analysis/types'

beforeEach(() => {vi.clearAllMocks(); vi.stubEnv('DATA_ENCRYPTION_KEY', 'b'.repeat(64))})
const actor = {userId: 'teacher', role: 'TEACHER' as const}
const publication = '2026-10-18T00:00:00.000Z'
const item = (id = 'number') => ({id, type: 'FORM', formType: 'number', formLabel: 'Original number', required: false, position: 0,
  formSectionId: `section-${id}`, formSectionPosition: 0, formOptions: null, formPolicy: null, contextKey: null,
  formDefinition: {itemKey: `stable_${id}`, type: 'NUMBER', prompt: 'Original number', required: false, options: [], rows: []}})
const request = (): TrainingAnalysisRequestV1 => ({schemaVersion: 1, courseId: 'course', mode: 'PAIRWISE', waves: [{waveKey: 'w1', taskId: 'task', publication, configDigest: null, variantKey: null, metrics: [{itemId: 'number', metricKey: 'stable_number'}]}]})
function fixture(n = 2) {
  const field = item(), section = {id: field.formSectionId, title: 'Form', position: 0, contextSection: false, items: [field]}
  const task: any = {id: 'task', name: 'Task', createdBy: 'teacher', productKind: 'QUESTIONNAIRE', publishedAt: new Date(publication),
    trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null, items: [field], formSections: [section]}
  const slots = createFrozenActiveSlotSet({schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots: [{slotKey: `form-section:${section.id}`, unitType: 'FORM_SECTION', required: true,
    sourceDefinitionIdentity: {key: section.id, version: '2', hash: canonicalHash(mapCompositeSection(section))}, sourceBinding: {sectionId: section.id}}]})
  const parents: any[] = Array.from({length: n}, (_, i) => ({id: `attempt-${i}`, compositeAssessmentId: 'task', userId: `user-${i}`, participantKey: `user-${i}`, deliveryCourseId: 'course', assignmentRef: null,
    status: 'COMPLETED', startedAt: new Date(publication), deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
    respondentType: 'SELF', taskSatisfaction: i ? 'NOT_SATISFIED' : 'SATISFIED', completedAt: new Date(publication),
    frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slots), frozenActiveSlotSetHash: slots.snapshotHash}))
  const snapshots: any[] = parents.map((parent, i) => ({compositeAttemptId: parent.id, attemptEpoch: 1, slotKey: `form-section:${section.id}`, unitType: 'FORM_SECTION', terminalState: 'COMPLETED', payloadKind: 'COLLECTION_FACTS', sourceType: 'COMPOSITE_FORM_SECTION', sourceAttemptId: `section-attempt-${i}`, sourceSubmissionId: `section-submit-${i}`,
    sourceDefinitionHash: canonicalHash(mapCompositeSection(section)), collectionFactsEncrypted: encryptUnifiedRuntimePayload({schemaVersion: 2, sectionKey: section.id, items: [{key: field.id, label: field.formLabel, value: i}]}), completedAt: new Date(publication)}))
  const matches = (row: any, condition: any): boolean => Object.entries(condition).every(([key, value]: any) => key === 'AND' ? value.every((part: any) => matches(row, part)) : key === 'OR' ? value.some((part: any) => matches(row, part)) : value && typeof value === 'object' ? ('in' in value ? value.in.includes(row[key]) : 'lte' in value ? row[key] && new Date(row[key]) <= value.lte : false) : row[key] === value)
  const db: any = {
    user: {findFirst: vi.fn(async () => ({id: 'teacher', role: 'TEACHER', isActive: true, isFrozen: false, expiresAt: null, teacherApproved: true, accountDomain: 'TRAINING', mustChangePassword: false, tokenVersion: 0}))},
    course: {findFirst: vi.fn(async () => ({id: 'course', creatorId: 'teacher', courseType: 'TRAINING_COURSE', isLibrary: false}))},
    relationalAssessmentAssignment: {findMany: vi.fn(async () => [])},
    compositeAssessment: {findMany: vi.fn(async () => [task]), findUnique: vi.fn(async () => ({...task, attempts: parents}))},
    compositeAssessmentAttempt: {findMany: vi.fn(async ({where}: any) => parents.filter(row => matches(row, where)))},
    assessment: {findMany: vi.fn(async () => [])},
    assessmentUnitSnapshot: {findMany: vi.fn(async ({where}: any) => snapshots.filter(row => where.OR.some((condition: any) => condition.compositeAttemptId === row.compositeAttemptId && condition.attemptEpoch === row.attemptEpoch && condition.slotKey.in.includes(row.slotKey))))},
    $queryRaw: vi.fn(async () => []),
  }
  return {db, task, parents, snapshots, section, field}
}
function scaleFixture(numericScores = true) {
  const f = fixture(1), source = getScaleInstrumentSource('adexi_v1', '2.0.0')!, executable = source.executable!, golden = executable.goldenCases[0]
  const result = buildScaleResult({scaleId: 'scale', instrumentKey: source.identity.instrumentKey, name: 'Scale', instrumentVersion: source.identity.instrumentVersion,
    definition: executable.definition, answers: golden.answers, referenceSets: []})
  const runtime = createFrozenScaleRuntimeSnapshotV2FromV1(createFrozenScaleRuntimeSnapshot({instrumentKey: source.identity.instrumentKey, instrumentVersion: source.identity.instrumentVersion,
    definition: executable.definition, frozenAt: new Date(publication)}), compileScalePolicy({...source, disclosure: {...source.disclosure!, audiences: {teacher: numericScores ? DISCLOSURE_PRESETS.SCORES() : DISCLOSURE_PRESETS.EDUCATIONAL_ONLY(), researcher: DISCLOSURE_PRESETS.FULL_REPORT()}}}))
  const scale: any = {id: 'scale-item', type: 'SCALE', position: 1, required: true, scaleId: 'scale', scale: {id: 'scale', code: runtime.instrumentKey, instrumentVersion: runtime.instrumentVersion, instrumentClass: 'STANDARD'}}
  f.task.items.push(scale)
  const slots = createFrozenActiveSlotSet({schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots: [
    {slotKey: 'scale:scale-item', unitType: 'SCALE', required: true, sourceDefinitionIdentity: {key: runtime.instrumentKey, version: runtime.instrumentVersion, hash: runtime.sourceDefinitionHash}, sourceBinding: {compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash}},
    {slotKey: `form-section:${f.section.id}`, unitType: 'FORM_SECTION', required: true, sourceDefinitionIdentity: {key: f.section.id, version: '2', hash: canonicalHash(mapCompositeSection(f.section))}, sourceBinding: {sectionId: f.section.id}},
  ]})
  f.parents[0].frozenActiveSlotSetEncrypted = encryptFrozenActiveSlotSet(slots); f.parents[0].frozenActiveSlotSetHash = slots.snapshotHash
  const envelope = createCanonicalUnitResultEnvelope({core: projectScaleCanonicalUnitResult({result, runtime: runtime.compiledRuntime, contextHash: null}), completedAt: publication,
    persistenceProvenance: {sourceType: 'ASSESSMENT', sourceAttemptId: 'scale-attempt', sourceSubmissionId: 'scale-submit'}})
  f.snapshots[0].collectionFactsEncrypted = 'UNREQUESTED-FORM-POISON'
  f.snapshots.push({compositeAttemptId: f.parents[0].id, attemptEpoch: 1, slotKey: 'scale:scale-item', unitType: 'SCALE', terminalState: 'COMPLETED', payloadKind: 'UNIT_RESULT', sourceType: 'ASSESSMENT',
    sourceAttemptId: 'scale-attempt', sourceSubmissionId: 'scale-submit', sourceDefinitionHash: runtime.sourceDefinitionHash, compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash,
    canonicalResultEncrypted: encryptUnifiedRuntimePayload(envelope), collectionFactsEncrypted: null, completedAt: new Date(publication)})
  const child = {id: 'scale-attempt', compositeAttemptId: f.parents[0].id, compositeItemId: 'scale-item', scaleId: 'scale', status: 'COMPLETED', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1',
    attemptEpoch: 1, submissionId: 'scale-submit', submissionPayloadHash: 'a'.repeat(64), result, runtimeSnapshotEncrypted: encryptUnifiedRuntimePayload(runtime), compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash}
  f.db.assessment.findMany.mockResolvedValue([child])
  const selector = request(); selector.waves[0].metrics = [{itemId: 'scale-item', metricKey: result.scores[0].key}]
  return {...f, child, result, runtime, envelope, selector}
}
describe('authorized Training numeric source adapter', () => {
  it('retains historical course participants without current membership and uses the passed transaction for frozen facts', async () => {
    const f = fixture(), result = await loadTrainingAnalysisSources(f.db, actor, request())
    expect(result.source.observations.map(row => row.value)).toEqual([0, 1])
    expect(result.source.observations.map(row => row.taskSatisfied)).toEqual([true, false])
    expect(result.manifest.attempts).toHaveLength(2)
    expect(JSON.stringify(f.db.compositeAssessmentAttempt.findMany.mock.calls)).not.toContain('CourseStudent')
    expect(f.db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(2)
    expect(globalRead).not.toHaveBeenCalled()
  })
  it.each(['course', 'task', 'actor'])('hides unauthorized %s without reading child facts', async mode => {
    const f = fixture()
    if (mode === 'course') f.db.course.findFirst.mockResolvedValue(null)
    if (mode === 'task') f.db.compositeAssessment.findMany.mockResolvedValue([])
    if (mode === 'actor') f.db.user.findFirst.mockResolvedValue(null)
    await expect(loadTrainingAnalysisSources(f.db, actor, request())).rejects.toMatchObject({statusCode: 404})
    expect(f.db.assessment.findMany).not.toHaveBeenCalled(); expect(f.db.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled()
  })
  it('does not attach independent/unscoped results to a course from current users', async () => {
    const f = fixture(); f.parents[1].deliveryCourseId = null
    const result = await loadTrainingAnalysisSources(f.db, actor, request())
    expect(result.source.observations).toHaveLength(1)
    expect(f.db.compositeAssessmentAttempt.findMany.mock.calls[0][0].where.deliveryCourseId).toBe('course')
  })
  it('uses only real study linkage for anonymous rows, never display name/code/participant token', async () => {
    const f = fixture(); f.parents[0].userId = null; f.parents[0].anonymousCode = 'same-display-code'
    const result = await loadTrainingAnalysisSources(f.db, actor, request())
    expect(result.source.observations).toHaveLength(1); expect(result.manifest.exclusions.IDENTITY_UNAVAILABLE).toBe(1)
    expect(JSON.stringify(result)).not.toContain('same-display-code')
    expect(f.db.$queryRaw.mock.calls.some(([parts]: any) => parts.join('').includes('anonymous_study_participants'))).toBe(true)
  })
  it('includes non-FINAL missingness without reading that parent child facts', async () => {
    const f = fixture(); f.parents[0].status = 'IN_PROGRESS'
    const result = await loadTrainingAnalysisSources(f.db, actor, request())
    expect(result.source.observations[0]).toMatchObject({value: null, reason: 'NON_FINAL', originalFinalStatus: 'IN_PROGRESS'})
    expect(f.db.assessmentUnitSnapshot.findMany.mock.calls.every(([arg]: any) => arg.where.OR.every((row: any) => row.compositeAttemptId !== 'attempt-0'))).toBe(true)
  })
  it('freezes sample IDs; newly arrived responses cannot expand a recomputation', async () => {
    const f = fixture(), before = await loadTrainingAnalysisSources(f.db, actor, request())
    f.parents.push({...f.parents[1], id: 'new', userId: 'new-user'})
    const after = await loadTrainingAnalysisSources(f.db, actor, request(), {fixedManifest: before.manifest})
    expect(after.sourceFingerprint).toBe(before.sourceFingerprint); expect(after.source.observations).toHaveLength(2)
  })
  it('changes the source fingerprint after epoch/source loss rather than silently substituting another response', async () => {
    const f = fixture(), before = await loadTrainingAnalysisSources(f.db, actor, request())
    f.parents.splice(1)
    const after = await loadTrainingAnalysisSources(f.db, actor, request(), {fixedManifest: before.manifest})
    expect(after.sourceFingerprint).not.toBe(before.sourceFingerprint)
  })
  it('freezes exact epochs and cutoff without substituting a later accepted response', async () => {
    const f = fixture(), before = await loadTrainingAnalysisSources(f.db, actor, request(), {sourceCutoff: publication})
    f.parents[0].attemptEpoch = 2
    f.parents[1].completedAt = new Date('2026-10-19T00:00:00.000Z')
    const after = await loadTrainingAnalysisSources(f.db, actor, request(), {fixedManifest: before.manifest, sourceCutoff: publication})
    expect(after.source.observations).toHaveLength(0); expect(after.sourceFingerprint).not.toBe(before.sourceFingerprint)
    expect(f.db.compositeAssessmentAttempt.findMany.mock.calls[1][0].where.AND).toContainEqual({startedAt: {lte: new Date(publication)}})
  })
  it('does not turn unrelated actor activity into permission drift', async () => {
    const f = fixture(), before = await loadTrainingAnalysisSources(f.db, actor, request())
    // The query only selects genuine permission fields; a lastSeen change is not selected.
    expect(f.db.user.findFirst.mock.calls[0][0].select).not.toHaveProperty('lastSeenAt')
    const after = await loadTrainingAnalysisSources(f.db, actor, request())
    expect(after.authorityHash).toBe(before.authorityHash)
  })
  it('refuses governed resultDisclosure grants as original/raw instrument authority', async () => {
    const f = fixture(); f.db.$queryRaw.mockImplementation(async (parts: TemplateStringsArray) => parts.join('').includes('assessment_run_executions') ? [{id: 'attempt-0'}] : [])
    await expect(loadTrainingAnalysisSources(f.db, actor, request())).rejects.toMatchObject({statusCode: 404})
    expect(f.db.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled()
  })
  it('rejects numeric title aliases and frozen question definition drift', async () => {
    const f = fixture(), wrong = request(); wrong.waves[0].metrics[0].metricKey = 'Original number'
    await expect(loadTrainingAnalysisSources(f.db, actor, wrong)).rejects.toMatchObject({statusCode: 404})
    f.field.formDefinition.prompt = 'Changed title'
    await expect(loadTrainingAnalysisSources(f.db, actor, request())).rejects.toThrow()
  })
  it('keeps outside-group poisoned Form facts unread before resolving any numeric values', async () => {
    const f = fixture(), outside = item('outside'), sectionB = {...f.section, id: outside.formSectionId, position: 1, items: [outside]}
    outside.position = 1; f.task.items.push(outside); f.task.formSections.push(sectionB)
    const config = compileWeightedVariants({schemaVersion: 1, groups: f.task.formSections.map((section: any, i: number) => ({variantKey: `group_${i}`, label: `Group ${i}`, weight: 1, units: [{type: 'FORM_SECTION', id: section.id}]}))}, buildTrainingVariantUnion(f.task))
    f.task.trainingVariantFrozen = config; f.task.trainingVariantDigest = config.configDigest
    f.parents.forEach((row, i) => {
      const allocation = createWeightedVariantAllocation(config, {compositeId: 'task', attemptId: row.id, participantKey: row.participantKey, attemptEpoch: 1, publishedAt: publication}, {randomInt: () => i, assignedAt: publication})
      row.trainingVariantAllocationEncrypted = encryptUnifiedRuntimePayload(allocation); row.trainingVariantAllocationHash = allocation.allocationHash
      const section = f.task.formSections[i], slots = createFrozenActiveSlotSet({schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots: [{slotKey: `form-section:${section.id}`, unitType: 'FORM_SECTION', required: true,
        sourceDefinitionIdentity: {key: section.id, version: '2', hash: canonicalHash(mapCompositeSection(section))}, sourceBinding: {sectionId: section.id}}]})
      row.frozenActiveSlotSetEncrypted = encryptFrozenActiveSlotSet(slots); row.frozenActiveSlotSetHash = slots.snapshotHash
    })
    f.snapshots[1].slotKey = `form-section:${sectionB.id}`; f.snapshots[1].collectionFactsEncrypted = 'POISON-MUST-NOT-BE-DECRYPTED'
    f.db.$queryRaw.mockImplementation(async (parts: TemplateStringsArray) => parts.join('').includes('training_variant_frozen') ? [{id: 'task'}] : [])
    const selected = request(); selected.waves[0].configDigest = config.configDigest; selected.waves[0].variantKey = 'group_0'
    const result = await loadTrainingAnalysisSources(f.db, actor, selected)
    expect(result.source.observations).toHaveLength(1); expect(result.source.observations[0].value).toBe(0)
    expect(f.db.assessmentUnitSnapshot.findMany.mock.calls.every(([arg]: any) => arg.where.OR.every((row: any) => row.compositeAttemptId === 'attempt-0'))).toBe(true)
  })
  it('numeric Scale capability does not grant raw/item scores and skips unrelated Form facts', async () => {
    const f = scaleFixture(), result = await loadTrainingAnalysisSources(f.db, actor, f.selector)
    expect(result.source.observations[0].value).toBe(f.result.scores[0].value)
    expect(JSON.stringify(result.source)).not.toContain('itemScores'); expect(JSON.stringify(result.source)).not.toContain('responseValue')
    expect(f.db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
    expect(f.db.assessmentUnitSnapshot.findMany.mock.calls[0][0].where.OR[0].slotKey.in).toEqual(['scale:scale-item'])
    expect(f.db.assessment.findMany.mock.calls[0][0].select).not.toHaveProperty('answers')
  })
  it('educational-only Scale policies cannot become numeric analysis through course ownership', async () => {
    const f = scaleFixture(false)
    await expect(loadTrainingAnalysisSources(f.db, actor, f.selector)).rejects.toMatchObject({statusCode: 404})
  })
  it.each(['epoch', 'submission', 'runtime', 'result'])('rejects Scale %s drift against accepted FINAL facts', async mode => {
    const f = scaleFixture()
    if (mode === 'epoch') f.child.attemptEpoch = 2
    if (mode === 'submission') f.child.submissionId = 'wrong'
    if (mode === 'runtime') f.child.compiledRuntimeHash = 'f'.repeat(64)
    if (mode === 'result') f.result.scores[0].value = (f.result.scores[0].value ?? 0) + 1
    await expect(loadTrainingAnalysisSources(f.db, actor, f.selector)).rejects.toThrow()
  })
  it.each(['duplicate-metric', 'provenance', 'source-type', 'unit'])('rejects canonical %s identity corruption before numeric output', async mode => {
    const f = scaleFixture(), snapshot = f.snapshots[1], envelope = structuredClone(f.envelope)
    if (mode === 'duplicate-metric') envelope.core.metrics.push({...envelope.core.metrics[0]})
    if (mode === 'provenance') envelope.core.scientificProvenance.instrumentKey = 'different-instrument'
    if (mode === 'source-type') {envelope.persistenceProvenance.sourceType = 'SITUATIONAL_ATTEMPT'; snapshot.sourceType = 'SITUATIONAL_ATTEMPT'}
    if (mode === 'unit') envelope.core.metrics.find(metric => metric.key === f.selector.waves[0].metrics[0].metricKey)!.unit = 'milliseconds'
    snapshot.canonicalResultEncrypted = encryptUnifiedRuntimePayload(createCanonicalUnitResultEnvelope(envelope))
    await expect(loadTrainingAnalysisSources(f.db, actor, f.selector)).rejects.toThrow()
  })
  it.each(['calculated', 'not_calculable'])('discovers SJT frozen metrics while preserving %s status', async status => {
    const f = fixture(1), runtime = {instrumentKey: 'sjt_fixture', instrumentVersion: '1.0.0', definitionHash: 'a'.repeat(64), compiledRuntimeHash: 'b'.repeat(64), scorerKey: 'sjt.scorer', scoringVersion: '1.0.0', runtimeGeneration: 'UNIFIED_V1' as const, deliveryMode: 'FINAL_ONLY' as const, frozenAt: publication}
    f.task.items = [{id: 'sjt-item', type: 'SITUATIONAL', position: 0, required: true, situationalInstrumentKey: runtime.instrumentKey, situationalInstrumentVersion: runtime.instrumentVersion}]; f.task.formSections = []
    const slots = createFrozenActiveSlotSet({schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots: [{slotKey: 'situational:sjt-item', unitType: 'SITUATIONAL', required: true,
      sourceDefinitionIdentity: {key: runtime.instrumentKey, version: runtime.instrumentVersion, hash: runtime.definitionHash}, sourceBinding: {}, runtimeIdentity: runtime}]})
    f.parents[0].frozenActiveSlotSetEncrypted = encryptFrozenActiveSlotSet(slots); f.parents[0].frozenActiveSlotSetHash = slots.snapshotHash
    const envelope = createCanonicalUnitResultEnvelope({core: {schemaVersion: 1, unitType: 'SITUATIONAL', instrumentKey: runtime.instrumentKey, instrumentVersion: runtime.instrumentVersion,
      sourceDefinitionHash: runtime.definitionHash, compilerVersion: '1', compiledRuntimeHash: runtime.compiledRuntimeHash, scorerKey: runtime.scorerKey, scorerVersion: runtime.scoringVersion,
      quality: {status: status === 'not_calculable' ? 'invalid' : 'interpretable', flags: []}, metrics: [{key: 'cooperation', value: status === 'not_calculable' ? null : 3, unit: 'score', quality: status}], facts: [], references: [], contextHash: null,
      scientificProvenance: {instrumentKey: runtime.instrumentKey, instrumentVersion: runtime.instrumentVersion}}, completedAt: publication,
      persistenceProvenance: {sourceType: 'SITUATIONAL_ATTEMPT', sourceAttemptId: 'sjt-attempt', sourceSubmissionId: 'sjt-submit'}})
    const snapshot = {compositeAttemptId: f.parents[0].id, compositeAttempt: f.parents[0], attemptEpoch: 1, slotKey: 'situational:sjt-item', unitType: 'SITUATIONAL', terminalState: 'COMPLETED', payloadKind: 'UNIT_RESULT',
      sourceType: 'SITUATIONAL_ATTEMPT', sourceAttemptId: 'sjt-attempt', sourceSubmissionId: 'sjt-submit', sourceDefinitionHash: runtime.definitionHash, compiledRuntimeHash: runtime.compiledRuntimeHash,
      canonicalResultEncrypted: encryptUnifiedRuntimePayload(envelope), collectionFactsEncrypted: null, completedAt: new Date(publication)}
    f.db.assessmentUnitSnapshot.findMany.mockResolvedValue([snapshot])
    const discovery = await listTrainingAnalysisSources(f.db, actor, 'course')
    expect(discovery.list[0].metrics).toEqual([{itemId: 'sjt-item', metricKey: 'cooperation', label: 'cooperation'}])
    const selector = request(); selector.waves[0].metrics = [{itemId: 'sjt-item', metricKey: 'cooperation'}]
    const result = await loadTrainingAnalysisSources(f.db, actor, selector)
    expect(result.source.observations[0]).toMatchObject({value: status === 'not_calculable' ? null : 3, reason: status === 'not_calculable' ? 'NOT_CALCULABLE' : null, originalFinalStatus: 'COMPLETED', measurement: {instrumentKey: runtime.instrumentKey, unit: 'score'}})
  })
  it('includes accepted Form submission identity in its source hash', async () => {
    const f = fixture(1), before = await loadTrainingAnalysisSources(f.db, actor, request())
    f.snapshots[0].sourceSubmissionId = 'changed-final-submission'
    const after = await loadTrainingAnalysisSources(f.db, actor, request(), {fixedManifest: before.manifest})
    expect(after.sourceFingerprint).not.toBe(before.sourceFingerprint)
  })
  it.each(['slot', 'snapshot', 'SKIPPED', 'NOT_APPLICABLE'])('fails closed when required FINAL evidence is %s', async mode => {
    const f = scaleFixture()
    if (mode === 'slot') {
      const slots = createFrozenActiveSlotSet({schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots: []})
      f.parents[0].frozenActiveSlotSetEncrypted = encryptFrozenActiveSlotSet(slots); f.parents[0].frozenActiveSlotSetHash = slots.snapshotHash
    } else if (mode === 'snapshot') f.snapshots.splice(1)
    else {f.snapshots[1].terminalState = mode; f.snapshots[1].payloadKind = 'NONE'; f.snapshots[1].canonicalResultEncrypted = null}
    await expect(loadTrainingAnalysisSources(f.db, actor, f.selector)).rejects.toMatchObject({statusCode: 409})
  })
  it.each(['frozenActiveSlotSetEncrypted', 'frozenActiveSlotSetHash'])('fails closed for a completed FINAL parent missing %s', async field => {
    const f = fixture(1); f.parents[0][field] = null
    await expect(loadTrainingAnalysisSources(f.db, actor, request())).rejects.toMatchObject({statusCode: 409})
    expect(f.db.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled()
  })
  it.each(['SKIPPED', 'NOT_APPLICABLE'])('preserves optional %s as NOT_ASSIGNED and freezes its terminal evidence', async state => {
    const f = scaleFixture(); f.task.items[1].required = false
    const slots = createFrozenActiveSlotSet({schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots: [
      {slotKey: 'scale:scale-item', unitType: 'SCALE', required: false, sourceDefinitionIdentity: {key: f.runtime.instrumentKey, version: f.runtime.instrumentVersion, hash: f.runtime.sourceDefinitionHash}, sourceBinding: {compiledRuntimeHash: f.runtime.compiledRuntime.compiledRuntimeHash}},
    ]})
    f.parents[0].frozenActiveSlotSetEncrypted = encryptFrozenActiveSlotSet(slots); f.parents[0].frozenActiveSlotSetHash = slots.snapshotHash
    f.snapshots[1].terminalState = state; f.snapshots[1].payloadKind = 'NONE'; f.snapshots[1].canonicalResultEncrypted = null
    const before = await loadTrainingAnalysisSources(f.db, actor, f.selector)
    expect(before.source.observations[0]).toMatchObject({value: null, reason: 'NOT_ASSIGNED', originalFinalStatus: 'COMPLETED'})
    f.snapshots.splice(1)
    const after = await loadTrainingAnalysisSources(f.db, actor, f.selector, {fixedManifest: before.manifest})
    expect(after.source.observations[0].reason).toBe('MISSING_SOURCE')
    expect(after.sourceFingerprint).not.toBe(before.sourceFingerprint)
  })
  it('preserves explicit optional missingness instead of fabricating a required result', async () => {
    const f = scaleFixture(); f.task.items[1].required = false; f.snapshots.splice(1)
    const slots = createFrozenActiveSlotSet({schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots: []})
    f.parents[0].frozenActiveSlotSetEncrypted = encryptFrozenActiveSlotSet(slots); f.parents[0].frozenActiveSlotSetHash = slots.snapshotHash
    const result = await loadTrainingAnalysisSources(f.db, actor, f.selector)
    expect(result.source.observations[0]).toMatchObject({value: null, reason: 'MISSING_SOURCE'})
  })
  it('ADMIN cannot promote teacher numeric disclosure to a researcher audience', async () => {
    const f = scaleFixture(false), admin = {...actor, role: 'ADMIN' as const}
    await expect(loadTrainingAnalysisSources(f.db, admin, f.selector)).rejects.toMatchObject({statusCode: 404})
  })
  it('ADMIN discovery cannot bypass frozen Cognitive research-only profile restrictions', async () => {
    const f = fixture(), report = {profile: 'research', metricDefinitions: {secret: {key: 'secret', label: 'Research only', role: 'research_only', availableProfiles: ['research'], unit: 'score', valueType: 'number'}}}
    f.task.items = [{id: 'cognitive', type: 'COGNITIVE', cognitiveAssignment: {resolvedReportSnapshotEncrypted: encryptCognitivePayload(report)}}]; f.task.formSections = []
    const discovery = await listTrainingAnalysisSources(f.db, {...actor, role: 'ADMIN'}, 'course')
    expect(discovery.list).toEqual([])
  })
  it('rejects a selected snapshot query bind budget before any child or fact reads', async () => {
    const f = fixture(900), selector = request()
    for (let i = 1; i < 32; i++) {
      const extra = item(`number-${i}`); f.task.items.push(extra)
      f.task.formSections.push({id: extra.formSectionId, title: 'Number', position: i, contextSection: false, items: [extra]})
      selector.waves[0].metrics.push({itemId: extra.id, metricKey: extra.formDefinition.itemKey})
    }
    await expect(loadTrainingAnalysisSources(f.db, actor, selector)).rejects.toMatchObject({statusCode: 413})
    expect(f.db.assessment.findMany).not.toHaveBeenCalled(); expect(f.db.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled()
  })
  it('rejects an over-budget Scale fact batch before the immutable fact query', async () => {
    const f = scaleFixture(); f.db.assessment.findMany.mockResolvedValue(Array.from({length: 15001}, (_, index) => ({...f.child, id: `child-${index}`, result: {k: 'SFF1', e: 1}})))
    await expect(loadTrainingAnalysisSources(f.db, actor, f.selector)).rejects.toMatchObject({statusCode: 413})
    expect(f.db.$queryRaw.mock.calls.some(([parts]: any) => parts.join('').includes('assessment_result_facts'))).toBe(false)
  })
  it('bounds parent loading before any facts at 6000 records', async () => {
    const f = fixture(6001)
    await expect(loadTrainingAnalysisSources(f.db, actor, request())).rejects.toMatchObject({statusCode: 400})
    expect(f.db.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled()
  })
  it('discovers exact numeric stable-key selectors without reading personal answers', async () => {
    const f = fixture(), result = await listTrainingAnalysisSources(f.db, actor, 'course')
    expect(result.list[0]).toMatchObject({taskId: 'task', publication, configDigest: null, variantKey: null, metrics: [{itemId: 'number', metricKey: 'stable_number'}]})
    expect(f.db.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled()
  })
})
