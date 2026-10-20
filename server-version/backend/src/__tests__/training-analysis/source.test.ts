import {beforeEach, describe, expect, it, vi} from 'vitest'
const globalRead = vi.hoisted(() => vi.fn(() => {throw new Error('Global database used inside source transaction')}))
vi.mock('../../config/database', () => ({prisma: new Proxy({}, {get: () => globalRead})}))
import {loadTrainingAnalysisSources, listTrainingAnalysisSources} from '../../modules/training-analysis/source'
import {compileTrainingFlow, trainingFlowUnitKey} from '../../modules/assessment-core/flow/training'
import {buildTrainingFlowUnits} from '../../modules/composite/training-flow-definition'
import {resolveTrainingFlowScope} from '../../modules/composite/training-flow-scope'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {createPublicTemplateStore, type PublicTemplateRow} from '../../modules/assessment-runtime/public-templates'
import {prepareCompactScaleFacts, decodeScaleFacts, isScaleReportFactsView} from '../../modules/assessment-runtime/compact-scale-facts'
import {preloadCompositeReportFacts} from '../../modules/composite/composite-report-read-batch'
import {makeCanonicalFactsReference, createStoredScaleFactsReader, preloadStoredScaleResults, resolveStoredScaleResult, loadStoredCanonicalUnitResults} from '../../modules/assessment-runtime/compact-assessment-storage'
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
import {sourceAuthorityRow} from './source-authority-fixture'

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
    trainingFlowDraft: null, trainingFlowFrozen: null, trainingFlowDigest: null,
    trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null, items: [field], formSections: [section]}
  const slots = createFrozenActiveSlotSet({schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots: [{slotKey: `form-section:${section.id}`, unitType: 'FORM_SECTION', required: true,
    sourceDefinitionIdentity: {key: section.id, version: '2', hash: canonicalHash(mapCompositeSection(section))}, sourceBinding: {sectionId: section.id}}]})
  const parents: any[] = Array.from({length: n}, (_, i) => ({id: `attempt-${i}`, compositeAssessmentId: 'task', userId: `user-${i}`, participantKey: `user-${i}`, deliveryCourseId: 'course', assignmentRef: null,
    status: 'COMPLETED', startedAt: new Date(publication), deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
    trainingFlowSnapshotEncrypted: null, trainingFlowSnapshotHash: null, trainingFlowPathEncrypted: null, trainingFlowPathHash: null,
    respondentType: 'SELF', taskSatisfaction: i ? 'NOT_SATISFIED' : 'SATISFIED', completedAt: new Date(publication),
    frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slots), frozenActiveSlotSetHash: slots.snapshotHash}))
  const snapshots: any[] = parents.map((parent, i) => ({compositeAttemptId: parent.id, attemptEpoch: 1, slotKey: `form-section:${section.id}`, unitType: 'FORM_SECTION', terminalState: 'COMPLETED', payloadKind: 'COLLECTION_FACTS', sourceType: 'COMPOSITE_FORM_SECTION', sourceAttemptId: `section-attempt-${i}`, sourceSubmissionId: `section-submit-${i}`,
    sourceDefinitionHash: canonicalHash(mapCompositeSection(section)), collectionFactsEncrypted: encryptUnifiedRuntimePayload({schemaVersion: 2, sectionKey: section.id, items: [{key: field.id, label: field.formLabel, value: i}]}), completedAt: new Date(publication)}))
  const matches = (row: any, condition: any): boolean => Object.entries(condition).every(([key, value]: any) => key === 'AND' ? value.every((part: any) => matches(row, part)) : key === 'OR' ? value.some((part: any) => matches(row, part)) : value && typeof value === 'object' ? ('in' in value ? value.in.includes(row[key]) : 'lte' in value ? row[key] && new Date(row[key]) <= value.lte : false) : row[key] === value)
  const db: any = {
    authorityRow: sourceAuthorityRow(),
    user: {findFirst: vi.fn(async () => ({id: 'teacher', role: 'TEACHER', isActive: true, isFrozen: false, expiresAt: null, teacherApproved: true, accountDomain: 'TRAINING', mustChangePassword: false, tokenVersion: 0}))},
    course: {findFirst: vi.fn(async () => ({id: 'course', creatorId: 'teacher', courseType: 'TRAINING_COURSE', isLibrary: false}))},
    relationalAssessmentAssignment: {findMany: vi.fn(async () => [])},
    compositeAssessment: {findMany: vi.fn(async () => [task]), findUnique: vi.fn(async () => ({...task, attempts: parents}))},
    compositeAssessmentAttempt: {findMany: vi.fn(async ({where}: any) => parents.filter(row => matches(row, where)))},
    assessment: {findMany: vi.fn(async () => [])},
    assessmentUnitSnapshot: {findMany: vi.fn(async ({where}: any) => snapshots.filter(row => (where.OR ?? [where]).some((condition: any) => condition.compositeAttemptId === row.compositeAttemptId && condition.attemptEpoch === row.attemptEpoch && (!condition.slotKey || condition.slotKey.in.includes(row.slotKey)))))},
    $queryRaw: vi.fn(async (parts: TemplateStringsArray) => parts.join('').includes('FROM courses c JOIN users') && db.authorityRow ? [db.authorityRow] : []),
  }
  return {db, task, parents, snapshots, section, field}
}
function scaleFixture(numericScores = true, legacyClass?: 'CUSTOM_DESCRIPTIVE' | 'STANDARD') {
  const f = fixture(1), source = getScaleInstrumentSource('adexi_v1', '2.0.0')!, executable = source.executable!, golden = executable.goldenCases[0]
  const instrumentKey = legacyClass ? 'training_custom_fixture' : source.identity.instrumentKey
  const result = buildScaleResult({scaleId: 'scale', instrumentKey, name: 'Scale', instrumentVersion: source.identity.instrumentVersion,
    definition: executable.definition, answers: golden.answers, referenceSets: []})
  const v1 = createFrozenScaleRuntimeSnapshot({instrumentKey, instrumentVersion: source.identity.instrumentVersion, definition: executable.definition, frozenAt: new Date(publication)})
  const runtime = legacyClass ? v1 : createFrozenScaleRuntimeSnapshotV2FromV1(v1, compileScalePolicy({...source, disclosure: {...source.disclosure!, audiences: {teacher: numericScores ? DISCLOSURE_PRESETS.SCORES() : DISCLOSURE_PRESETS.EDUCATIONAL_ONLY(), researcher: DISCLOSURE_PRESETS.FULL_REPORT()}}}))
  const scale: any = {id: 'scale-item', type: 'SCALE', position: 1, required: true, scaleId: 'scale', scale: {id: 'scale', code: runtime.instrumentKey, instrumentVersion: runtime.instrumentVersion, instrumentClass: legacyClass ?? 'STANDARD'}}
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
async function compactScaleFixture() {
  const f = scaleFixture(), storage = new Map<string, PublicTemplateRow>()
  const templates = createPublicTemplateStore({read: async hashes => hashes.flatMap(hash => storage.has(hash) ? [storage.get(hash)!] : []), append: async rows => {for (const row of rows) storage.set(row.templateHash, row)}})
  const envelope = createCanonicalUnitResultEnvelope({...f.envelope, bundleBridge: {sourceResultHash: canonicalHash(f.result)}})
  const factsEncrypted = await prepareCompactScaleFacts({result: f.result, itemOrder: f.result.itemScores.map(row => row.itemCode),
    binding: {assessmentId: f.child.id, attemptEpoch: f.child.attemptEpoch, submissionId: f.child.submissionId, payloadHash: f.child.submissionPayloadHash}, canonical: envelope}, templates)
  const decoded = decodeScaleFacts(factsEncrypted)!
  const fact = {id: f.child.id, attemptEpoch: f.child.attemptEpoch, submissionId: f.child.submissionId, submissionPayloadHash: f.child.submissionPayloadHash,
    sourceResultHash: decoded.sourceResultHash, canonicalResultHash: envelope.resultHash, factsEncrypted}
  Object.defineProperty(fact, 'rawAnswersEncrypted', {get: () => {throw new Error('Numeric analysis must not read raw answers')}})
  ;(f.child as any).result = {k: 'SFF1', e: 1}
  f.snapshots[1].canonicalResultEncrypted = encryptUnifiedRuntimePayload(envelope)
  f.db.$queryRaw.mockImplementation(async (parts: TemplateStringsArray) => parts.join('').includes('assessment_result_facts') ? [fact]
    : parts.join('').includes('assessment_public_templates') ? [...storage.values()]
    : parts.join('').includes('FROM courses c JOIN users') ? [f.db.authorityRow] : [])
  return {...f, fact, envelope}
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
    if (mode === 'course') f.db.authorityRow = null
    if (mode === 'task') f.db.compositeAssessment.findMany.mockResolvedValue([])
    if (mode === 'actor') f.db.authorityRow = null
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
    expect(f.db.$queryRaw.mock.calls[0][0].join('')).not.toContain('last_seen')
    const after = await loadTrainingAnalysisSources(f.db, actor, request())
    expect(after.authorityHash).toBe(before.authorityHash)
  })
  it('refuses governed resultDisclosure grants as original/raw instrument authority', async () => {
    const f = fixture(); f.db.$queryRaw.mockImplementation(async (parts: TemplateStringsArray) => parts.join('').includes('assessment_run_executions') ? [{id: 'attempt-0'}]
      : parts.join('').includes('FROM courses c JOIN users') ? [f.db.authorityRow] : [])
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
    f.db.$queryRaw.mockImplementation(async (parts: TemplateStringsArray) => parts.join('').includes('training_variant_frozen') ? [{id: 'task'}]
      : parts.join('').includes('FROM courses c JOIN users') ? [f.db.authorityRow] : [])
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
  it.each(['SCF2', 'legacy'])('keeps the complete source fingerprint equal for inline and %s canonical storage', async representation => {
    const f = await compactScaleFixture(), before = await loadTrainingAnalysisSources(f.db, actor, f.selector)
    const binding = {assessmentId: f.child.id, attemptEpoch: f.child.attemptEpoch, submissionId: f.child.submissionId, payloadHash: f.child.submissionPayloadHash}
    f.snapshots[1].canonicalResultEncrypted = representation === 'SCF2' ? makeCanonicalFactsReference(binding, f.envelope.resultHash)
      : encryptUnifiedRuntimePayload({kind: 'SCALE_FACTS_CANONICAL_REF', version: 1, binding, resultHash: f.envelope.resultHash})
    f.db.$queryRaw.mockClear()
    const after = await loadTrainingAnalysisSources(f.db, actor, f.selector)
    expect(after.sourceFingerprint).toBe(before.sourceFingerprint)
    expect(after.manifest.attempts[0].sourceHash).toBe(before.manifest.attempts[0].sourceHash)
    expect(f.db.$queryRaw.mock.calls.filter(([parts]: any) => parts.join('').includes('assessment_result_facts'))).toHaveLength(1)
    expect(globalRead).not.toHaveBeenCalled()
  })
  it.each(['child', 'epoch', 'slot', 'unit', 'missing-item', 'legacy-submission'])('rejects a canonical reference with the wrong %s before referenced facts are read', async mode => {
    const f = await compactScaleFixture(), binding = {assessmentId: f.child.id, attemptEpoch: f.child.attemptEpoch, submissionId: f.child.submissionId, payloadHash: f.child.submissionPayloadHash}
    if (mode === 'child') binding.assessmentId = 'OUTSIDE-GROUP-POISON'
    if (mode === 'epoch') binding.attemptEpoch++
    if (mode === 'slot') f.snapshots[1].slotKey = 'scale:other-slot'
    if (mode === 'unit') f.snapshots[1].unitType = 'COGNITIVE'
    if (mode === 'missing-item') f.child.compositeItemId = null
    if (mode === 'legacy-submission') binding.submissionId = 'wrong-submission'
    f.snapshots[1].canonicalResultEncrypted = mode === 'legacy-submission' ? encryptUnifiedRuntimePayload({kind: 'SCALE_FACTS_CANONICAL_REF', version: 1, binding, resultHash: f.envelope.resultHash})
      : makeCanonicalFactsReference(binding, f.envelope.resultHash)
    if (mode === 'slot') f.db.assessmentUnitSnapshot.findMany.mockResolvedValue([f.snapshots[1]])
    await expect(loadTrainingAnalysisSources(f.db, actor, f.selector)).rejects.toMatchObject({statusCode: 409})
    expect(f.db.$queryRaw.mock.calls.some(([parts]: any) => parts.join('').includes('assessment_result_facts'))).toBe(false)
  })
  it('fails closed when an authorized canonical reference has no immutable fact', async () => {
    const f = scaleFixture(), binding = {assessmentId: f.child.id, attemptEpoch: f.child.attemptEpoch, submissionId: f.child.submissionId, payloadHash: f.child.submissionPayloadHash}
    f.snapshots[1].canonicalResultEncrypted = makeCanonicalFactsReference(binding, f.envelope.resultHash)
    await expect(loadTrainingAnalysisSources(f.db, actor, f.selector)).rejects.toThrow('Canonical fact version missing')
  })
  it('rejects a referenced immutable canonical hash mismatch through the existing runtime validator', async () => {
    const f = await compactScaleFixture(), binding = {assessmentId: f.child.id, attemptEpoch: f.child.attemptEpoch, submissionId: f.child.submissionId, payloadHash: f.child.submissionPayloadHash}
    f.snapshots[1].canonicalResultEncrypted = makeCanonicalFactsReference(binding, f.envelope.resultHash); f.fact.canonicalResultHash = '0'.repeat(64)
    await expect(loadTrainingAnalysisSources(f.db, actor, f.selector)).rejects.toThrow('Canonical result hash mismatch')
  })
  it('uses the original immutable digest for a real marked compact numeric view without raw or item reconstruction', async () => {
    const f = await compactScaleFixture()
    const attempt = {...f.parents[0], compositeAssessment: f.task, scaleAssessments: [f.child]}
    const reader = await preloadCompositeReportFacts([attempt], f.db, {selectedItemIds: new Map([[attempt.id, new Set(['scale-item'])]]), numericOnly: true})
    const facts = reader(attempt), view = facts.scaleResults.get(f.child)
    expect(isScaleReportFactsView(view)).toBe(true); expect(view.itemScores).toEqual([])
    expect(() => canonicalHash(view)).toThrow('symbol')
    expect(facts.scaleSourceResultHashes.get(f.child)).toBe(canonicalHash(f.result))
    expect(facts.scaleSourceResultHashes.get({...f.child})).toBeUndefined()
    const result = await loadTrainingAnalysisSources(f.db, actor, f.selector)
    expect(result.source.observations[0]).toMatchObject({value: f.result.scores[0].value, reason: null})
    expect(result.manifest.attempts[0].sourceHashes['scale:scale-item']).toBe(canonicalHash({id: f.child.id, epoch: 1, submissionId: f.child.submissionId,
      payloadHash: f.child.submissionPayloadHash, runtime: f.runtime.snapshotHash, result: f.fact.sourceResultHash}))
    expect(globalRead).not.toHaveBeenCalled()
  })
  it('rejects compact immutable row digest drift before exporting numeric values', async () => {
    const f = await compactScaleFixture(); f.fact.sourceResultHash = '0'.repeat(64)
    await expect(loadTrainingAnalysisSources(f.db, actor, f.selector)).rejects.toThrow('source digest')
  })
  it.each(['compact', 'noncompact'])('rejects an accepted bridge digest that mismatches the %s original source', async kind => {
    const f = kind === 'compact' ? await compactScaleFixture() : scaleFixture()
    f.snapshots[1].canonicalResultEncrypted = encryptUnifiedRuntimePayload(createCanonicalUnitResultEnvelope({...f.envelope, bundleBridge: {sourceResultHash: '0'.repeat(64)}}))
    await expect(loadTrainingAnalysisSources(f.db, actor, f.selector)).rejects.toMatchObject({statusCode: 409})
  })
  it('uses the authoritative custom class for V1 numeric policy without additional reads', async () => {
    const f = scaleFixture(true, 'CUSTOM_DESCRIPTIVE')
    expect(f.runtime.schemaVersion).toBe(1); expect(f.child).not.toHaveProperty('scale')
    const result = await loadTrainingAnalysisSources(f.db, actor, f.selector)
    expect(result.source.observations[0]).toMatchObject({value: f.result.scores[0].value, reason: null, measurement: {instrumentKey: f.runtime.instrumentKey}})
    expect(f.db.assessment.findMany).toHaveBeenCalledTimes(1); expect(globalRead).not.toHaveBeenCalled()
  })
  it.each(['STANDARD', null])('keeps an unknown V1 identity with class %s denied', async instrumentClass => {
    const f = scaleFixture(true, 'STANDARD'); f.task.items[1].scale.instrumentClass = instrumentClass
    await expect(loadTrainingAnalysisSources(f.db, actor, f.selector)).rejects.toMatchObject({statusCode: 404})
  })
  it('rejects a mismatched authoritative Scale relation before policy resolution', async () => {
    const f = scaleFixture(true, 'CUSTOM_DESCRIPTIVE'); f.task.items[1].scale.id = 'another-scale'
    await expect(loadTrainingAnalysisSources(f.db, actor, f.selector)).rejects.toMatchObject({statusCode: 409})
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
    // A real legacy row loads every nullable flow marker; omitted is UNKNOWN.
    Object.assign(f.task, {trainingFlowDraft: null, trainingFlowFrozen: null, trainingFlowDigest: null})
    Object.assign(f.parents[0], {trainingFlowSnapshotEncrypted: null, trainingFlowSnapshotHash: null, trainingFlowPathEncrypted: null, trainingFlowPathHash: null})
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


async function materialFixture(n = 2) {
  const f = fixture(n)
  const config = compileTrainingFlow({schemaVersion: 2,
    experiment: {experimentKey: 'material_trial', linkedPolicy: 'KEEP_LINKED', groups: [
      {groupKey: 'a', weight: 1, materialTitle: 'A title', materialBody: 'A body'},
      {groupKey: 'b', weight: 1, materialTitle: 'B title', materialBody: 'B body'},
    ]}, blocks: [{blockKey: 'measure', kind: 'INSTRUMENT', instrumentKey: trainingFlowUnitKey(f.section.id)}],
  }, buildTrainingFlowUnits(f.task))
  f.task.trainingFlowFrozen = config; f.task.trainingFlowDigest = config.flowDigest
  if (config.schemaVersion !== 2) throw new Error('Expected V2 fixture')
  for (const [index, parent] of f.parents.entries()) {
    const group = config.experiment.groups[index % 2]
    const assignmentBody = {schemaVersion: 1, claimId: `claim-${index}`, experimentId: 'experiment', compositeId: f.task.id,
      publicationKey: publication, configDigest: config.flowDigest, participantKey: parent.participantKey,
      attemptId: parent.id, attemptEpoch: parent.attemptEpoch, groupKey: group.groupKey,
      materialDigest: canonicalHash({materialTitle: group.materialTitle, materialBody: group.materialBody}), algorithm: 'CRYPTO_RANDOM_INT_V1'}
    const materialAssignment = {...assignmentBody, assignmentHash: canonicalHash(assignmentBody)}
    const snapshot = {schemaVersion: 2, compositeId: f.task.id, publishedAt: publication, attemptId: parent.id, attemptEpoch: 1,
      flowDigest: config.flowDigest, unionDigest: config.unionDigest, slotSetHash: parent.frozenActiveSlotSetHash, materialAssignment}
    parent.trainingFlowSnapshotEncrypted = encryptUnifiedRuntimePayload(snapshot); parent.trainingFlowSnapshotHash = canonicalHash(snapshot)
    f.snapshots[index].id = `snapshot-${index}`
    const scope = await resolveTrainingFlowScope(parent, f.task, {db: f.db, snapshotRows: [f.snapshots[index]], allowAdvance: true})
    parent.trainingFlowPathEncrypted = encryptUnifiedRuntimePayload(scope!.evidence); parent.trainingFlowPathHash = scope!.pathHash
  }
  const selector = request(); selector.waves[0].materialGroupKey = 'a'
  return {...f, selector}
}

describe('material-only analysis strata', () => {
  it('discovers explicit material arms with the same metrics and no C14 variant identity', async () => {
    const f = await materialFixture(), result = await listTrainingAnalysisSources(f.db, actor, 'course')
    expect(result.list.map(row => ({materialGroupKey: row.materialGroupKey, configDigest: row.configDigest, variantKey: row.variantKey})))
      .toEqual([{materialGroupKey: 'a', configDigest: null, variantKey: null}, {materialGroupKey: 'b', configDigest: null, variantKey: null}])
    expect(result.list[0].metrics).toEqual(result.list[1].metrics)
  })
  it('selects one verified material arm and binds observations, manifest, dictionary and source hashes', async () => {
    const f = await materialFixture(), loaded = await loadTrainingAnalysisSources(f.db, actor, f.selector)
    expect(loaded.source.observations).toHaveLength(1)
    expect(loaded.source.observations[0]).toMatchObject({materialGroupKey: 'a', attemptId: 'attempt-0', value: 0, configDigest: null, variantKey: null})
    expect(loaded.source.observations[0].sourceHashes).toMatchObject({materialConfig: f.task.trainingFlowDigest, materialAssignment: expect.any(String), materialPath: f.parents[0].trainingFlowPathHash})
    expect(loaded.manifest.attempts[0]).toMatchObject({materialGroupKey: 'a'})
    expect(loaded.dictionary[0]).toMatchObject({materialGroupKey: 'a'})
    const selectedQuery = f.db.assessmentUnitSnapshot.findMany.mock.calls.at(-1)![0]
    expect(selectedQuery.where.OR.map((row: any) => row.compositeAttemptId)).toEqual(['attempt-0'])
  })
  it.each([undefined, 'unknown'])('rejects an unselected or unknown arm (%s) before source reads', async group => {
    const f = await materialFixture(); f.selector.waves[0].materialGroupKey = group
    await expect(loadTrainingAnalysisSources(f.db, actor, f.selector)).rejects.toThrow()
    expect(f.db.compositeAssessmentAttempt.findMany).not.toHaveBeenCalled()
    expect(f.db.assessment.findMany).not.toHaveBeenCalled()
  })
  it('rejects material selection on legacy sources rather than silently accepting it', async () => {
    const f = fixture(), selector = request(); selector.waves[0].materialGroupKey = 'a'
    await expect(loadTrainingAnalysisSources(f.db, actor, selector)).rejects.toThrow()
    expect(f.db.compositeAssessmentAttempt.findMany).not.toHaveBeenCalled()
  })
  it('rejects a tampered persisted group assignment and frozen config', async () => {
    const f = await materialFixture()
    f.parents[0].trainingFlowSnapshotHash = 'a'.repeat(64)
    await expect(loadTrainingAnalysisSources(f.db, actor, f.selector)).rejects.toThrow()
    const g = await materialFixture(); g.task.trainingFlowFrozen.experiment.groups[0].groupKey = 'changed'
    await expect(listTrainingAnalysisSources(g.db, actor, 'course')).rejects.toThrow()
  })
  it('rejects a fixed manifest changed to a different group', async () => {
    const f = await materialFixture(), loaded = await loadTrainingAnalysisSources(f.db, actor, f.selector)
    const attempts = loaded.manifest.attempts.map(row => ({...row, materialGroupKey: 'b'}))
    await expect(loadTrainingAnalysisSources(f.db, actor, f.selector, {fixedManifest: {attempts}})).rejects.toThrow()
  })
})


it('material arms retain hand-calculated means 4 versus 5 instead of a pooled 4.5', async () => {
  const f = await materialFixture(10)
  const a = await loadTrainingAnalysisSources(f.db, actor, f.selector)
  f.selector.waves[0].materialGroupKey = 'b'
  const b = await loadTrainingAnalysisSources(f.db, actor, f.selector)
  const valuesA = a.source.observations.map(row => row.value!), valuesB = b.source.observations.map(row => row.value!)
  expect(valuesA).toEqual([0, 2, 4, 6, 8]); expect(valuesB).toEqual([1, 3, 5, 7, 9])
  expect(valuesA.reduce((sum, value) => sum + value, 0) / valuesA.length).toBe(4)
  expect(valuesB.reduce((sum, value) => sum + value, 0) / valuesB.length).toBe(5)
  expect(a.sourceFingerprint).not.toBe(b.sourceFingerprint)
  expect(f.db).not.toHaveProperty('trainingMaterialAllocationClaim')
})

describe('single locked Training authority',()=>{
 const locked=sourceAuthorityRow
 it.each(['SHARE','UPDATE'] as const)('reuses actual locked principal/course fields in %s and preserves the authority fingerprint',async authorityLock=>{
  const before=fixture(),expected=await loadTrainingAnalysisSources(before.db,actor,request())
  const f=fixture();f.db.$queryRaw.mockImplementation(async(parts:TemplateStringsArray)=>parts.join('').includes('FROM courses c JOIN users')?[locked()]:[])
  const actual=await loadTrainingAnalysisSources(f.db,actor,request(),{authorityLock})
  expect(actual.authorityHash).toBe(expected.authorityHash)
  expect(f.db.user.findFirst).not.toHaveBeenCalled();expect(f.db.course.findFirst).not.toHaveBeenCalled()
  const calls=f.db.$queryRaw.mock.calls.filter(([parts]:any)=>parts.join('').includes('FROM courses c JOIN users'))
  expect(calls).toHaveLength(1)
  expect(calls[0][0].join('')).toContain('u.account_domain')
  expect(calls[0].some((arg:any)=>arg?.sql?.includes(authorityLock==='UPDATE'?'FOR UPDATE OF c FOR SHARE OF u':'FOR SHARE OF c,u'))).toBe(true)
  expect(f.db.relationalAssessmentAssignment.findMany).toHaveBeenCalledOnce()
 })
 it.each(['mustChangePassword','teacherApproved'])('still denies the additional %s policy before task/fact reads',async field=>{
  const f=fixture();f.db.$queryRaw.mockResolvedValue([{...locked(),[field]:field==='mustChangePassword'}])
  await expect(loadTrainingAnalysisSources(f.db,actor,request(),{authorityLock:'SHARE'})).rejects.toMatchObject({statusCode:404})
  expect(f.db.compositeAssessment.findMany).not.toHaveBeenCalled()
 })
 it('preserves the service lock denial code, while direct loaders still verify independently',async()=>{
  const f=fixture();f.db.$queryRaw.mockResolvedValue([])
  await expect(loadTrainingAnalysisSources(f.db,actor,request(),{authorityLock:'SHARE'})).rejects.toMatchObject({statusCode:404,code:'TRAINING_ANALYSIS_NOT_FOUND'})
  expect(f.db.user.findFirst).not.toHaveBeenCalled()
  f.db.$queryRaw.mockImplementation(async(parts:TemplateStringsArray)=>parts.join('').includes('FROM courses c JOIN users')?[locked()]:[])
  await loadTrainingAnalysisSources(f.db,actor,request())
  expect(f.db.user.findFirst).not.toHaveBeenCalled();expect(f.db.course.findFirst).not.toHaveBeenCalled()
  expect(f.db.$queryRaw.mock.calls.filter(([parts]:any)=>parts.join('').includes('FROM courses c JOIN users'))).toHaveLength(2)
 })
})

describe('request-local immutable facts reader',()=>{
 it('reuses one row query and decoded body for report then canonical, without marking it committed',async()=>{
  const f=await compactScaleFixture(),codec=await import('../../modules/assessment-runtime/compact-scale-facts')
  const decode=vi.spyOn(codec,'decodeScaleFacts')
  try{
   const reader=await preloadStoredScaleResults([f.child],f.db)
   const result=await resolveStoredScaleResult(f.child.result,{record:f.child,db:f.db,reader})
   const cipher=makeCanonicalFactsReference({assessmentId:f.child.id,attemptEpoch:1,submissionId:f.child.submissionId,payloadHash:f.child.submissionPayloadHash},f.envelope.resultHash)
   const [canonical]=await loadStoredCanonicalUnitResults([cipher],f.db,[],reader)
   expect(result.scores).toEqual(f.result.scores);expect(canonical).toEqual(f.envelope)
   expect(decode.mock.calls.filter(([value])=>value===f.fact.factsEncrypted)).toHaveLength(1)
   expect(f.db.$queryRaw.mock.calls.filter(([parts]:any)=>parts.join('').includes('assessment_result_facts'))).toHaveLength(1)
   const {readCommittedScaleFacts}=await import('../../modules/assessment-runtime/scale-fact-records')
   expect(readCommittedScaleFacts(f.child)).toBeNull()
  }finally{decode.mockRestore()}
 })
 it.each(['child-epoch','child-submission','child-payload','child-result','row-cipher','row-source','row-canonical'])('rejects changed %s instead of reusing decoded facts',async mode=>{
  const f=await compactScaleFixture(),reader=await preloadStoredScaleResults([f.child],f.db)
  if(mode==='child-epoch')f.child.attemptEpoch++
  if(mode==='child-submission')f.child.submissionId='changed'
  if(mode==='child-payload')f.child.submissionPayloadHash='0'.repeat(64)
  if(mode==='child-result')(f.child.result as any).e++
  if(mode==='row-cipher')f.fact.factsEncrypted+='changed'
  if(mode==='row-source')f.fact.sourceResultHash='0'.repeat(64)
  if(mode==='row-canonical')f.fact.canonicalResultHash='0'.repeat(64)
  expect(()=>reader.read(f.child,f.db)).toThrow('identity changed')
 })
 it('rejects a different child object or transaction, with no cross-request cache',async()=>{
  const f=await compactScaleFixture(),reader=await createStoredScaleFactsReader([f.child],f.db)
  expect(()=>reader.read({...f.child},f.db)).toThrow('identity changed')
  expect(()=>reader.read(f.child,{...f.db})).toThrow('identity changed')
  expect(()=>reader.find(f.child.id,1,{...f.db})).toThrow('transaction changed')
 })
 it('retains per-scale binding error timing after ordinary preload',async()=>{
  const f=await compactScaleFixture(),codec=await import('../../modules/assessment-runtime/compact-scale-facts')
  const body=decodeScaleFacts(f.fact.factsEncrypted)!
  const decode=vi.spyOn(codec,'decodeScaleFacts').mockImplementation(value=>value===f.fact.factsEncrypted?{...body,binding:{...body.binding,submissionId:'wrong'}}:null)
  try{
   const reader=await preloadStoredScaleResults([f.child],f.db)
   await expect(resolveStoredScaleResult(f.child.result,{record:f.child,db:f.db,reader})).rejects.toThrow()
  }finally{decode.mockRestore()}
 })
})
