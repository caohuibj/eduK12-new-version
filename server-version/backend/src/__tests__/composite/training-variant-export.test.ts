import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({$queryRaw: vi.fn(), compositeAssessment: {findUnique: vi.fn()}, compositeAssessmentAttempt: {count: vi.fn()},
  assessment: {findMany: vi.fn()}, cognitiveSession: {findMany: vi.fn()}, compositeFormAnswer: {findMany: vi.fn()},
  cognitiveTrial: {count: vi.fn()}, cognitiveRawSubmission: {aggregate: vi.fn()}, assessmentUnitSnapshot: {findMany: vi.fn()},
  relationalAssessmentAssignment: {findMany: vi.fn()}}))
vi.mock('../../config/database', () => ({prisma: db}))
import { compileWeightedVariants, createWeightedVariantAllocation } from '../../modules/assessment-core/weighted-variants'
import { buildTrainingVariantUnion, resolveTrainingAttemptScope } from '../../modules/composite/training-variant-scope'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { mapCompositeSection } from '../../modules/assessment-runtime/form-section-definition'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { createFrozenActiveSlotSet, encryptFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { getExportData, getTrainingVariantTaskAnalysis, saveExportFiles } from '../../modules/composite/composite-export.service'
import { trainingVariantProvenance, readTrainingVariantCognitiveTrials } from '../../modules/composite/training-variant-export'
import { assertTrainingVariantReportScope } from '../../modules/composite/compact-composite-report'
import { buildCompositeExportProjectionBinding, compositeExportFileNameMatchesProjection, bindCompositeExportFileName } from '../../modules/composite/composite-export-projection'
import { UserRole } from '@prisma/client'
import fs from 'node:fs/promises'

beforeEach(() => {
  vi.clearAllMocks(); process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  db.$queryRaw.mockImplementation(async (parts: TemplateStringsArray) => parts.join('').includes('training_variant_frozen') ? [{id: 'parent'}] : [])
  db.compositeAssessmentAttempt.count.mockResolvedValue(2)
  db.assessment.findMany.mockResolvedValue([]); db.cognitiveSession.findMany.mockResolvedValue([]); db.compositeFormAnswer.findMany.mockResolvedValue([])
  db.cognitiveTrial.count.mockResolvedValue(0); db.cognitiveRawSubmission.aggregate.mockResolvedValue({_sum: {trialCount: 0}})
  db.relationalAssessmentAssignment.findMany.mockResolvedValue([])
})
const question = (id: string, position: number) => ({id, type: 'FORM', formType: 'number', formLabel: id, position, formSectionPosition: 0,
  required: false, formOptions: null, formDefinition: {itemKey: id, type: 'NUMBER', prompt: id, required: false, options: [], rows: []}, formPolicy: null})
function fixture() {
  const items = [question('item-a', 0), question('item-b', 1)]
  const formSections = items.map((item, i) => ({id: `section-${i}`, title: `Form ${i}`, position: i, contextSection: false, items: [item]}))
  const template: any = {id: 'parent', name: '分卷', productKind: 'QUESTIONNAIRE', publishedAt: new Date('2026-10-18T00:00:00Z'), items, formSections}
  const config = compileWeightedVariants({schemaVersion: 1, groups: formSections.map((section, i) => ({variantKey: `group_${i}`, label: `组${i}`, weight: i ? 3 : 1, units: [{type: 'FORM_SECTION', id: section.id}]}))}, buildTrainingVariantUnion(template))
  template.trainingVariantFrozen = config; template.trainingVariantDigest = config.configDigest
  template.attempts = items.map((item, i) => {
    const id = `attempt-${i}`, participantKey = `user-${i}`
    const allocation = createWeightedVariantAllocation(config, {compositeId: template.id, attemptId: id, participantKey, attemptEpoch: 1, publishedAt: template.publishedAt.toISOString()}, {randomInt: () => i, assignedAt: '2026-10-18T00:00:01Z'})
    const frozen = createFrozenActiveSlotSet({schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots: [{slotKey: `form-section:section-${i}`, unitType: 'FORM_SECTION', required: true,
      sourceDefinitionIdentity: {key: `section-${i}`, version: '2', hash: canonicalHash(mapCompositeSection(formSections[i]))}, sourceBinding: {sectionId: `section-${i}`}}]})
    return {id, participantKey, attemptEpoch: 1, runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', status: 'COMPLETED', taskSatisfaction: i ? 'NOT_SATISFIED' : 'SATISFIED',
      trainingVariantAllocationEncrypted: encryptUnifiedRuntimePayload(allocation), trainingVariantAllocationHash: allocation.allocationHash,
      frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(frozen), frozenActiveSlotSetHash: frozen.snapshotHash, completedAt: new Date('2026-10-18T00:01:00Z')}
  })
  const snapshots = template.attempts.map((attempt: any, i: number) => ({compositeAttemptId: attempt.id, attemptEpoch: 1, slotKey: `form-section:section-${i}`,
    terminalState: 'COMPLETED', payloadKind: 'COLLECTION_FACTS', unitType: 'FORM_SECTION', sourceType: 'COMPOSITE_FORM_SECTION',
    sourceDefinitionHash: canonicalHash(mapCompositeSection(formSections[i])), collectionFactsEncrypted: encryptUnifiedRuntimePayload({schemaVersion: 2, sectionKey: `section-${i}`, items: [{key: items[i].id, label: items[i].id, value: i ? 7 : 0}]})}))
  db.compositeAssessment.findUnique.mockResolvedValue(template); db.assessmentUnitSnapshot.findMany.mockResolvedValue(snapshots)
  return {template, snapshots}
}
describe('weighted variant export scope', () => {
  it('exports only selected canonical form facts; other-group values are null with NOT_SHOWN and independent strata', async () => {
    const {template} = fixture()
    const data = await getExportData('parent')
    expect(data.rows.map(row => [row.F001_value, row.F001_state, row.F002_value, row.F002_state])).toEqual([[0, null, null, 'NOT_SHOWN'], [null, 'NOT_SHOWN', 7, null]])
    expect(data.rows.map(row => row.V_variant_key)).toEqual(['group_0', 'group_1'])
    expect(new Set(data.rows.map(row => row.V_stratum_key)).size).toBe(2)
    expect(data.trainingVariantExport?.strata.map(row => [row.recordCount, row.completedCount]).sort()).toEqual([[1, 1], [1, 1]])
    expect(data.rows.every(row => !JSON.stringify(row).includes('user-'))).toBe(true)
    expect(template.items).toHaveLength(2); expect(db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
    expect(db.compositeFormAnswer.findMany.mock.calls[0][0].where.OR).toEqual([{attemptId: {in: ['attempt-0']}, itemId: {in: ['item-a']}}, {attemptId: {in: ['attempt-1']}, itemId: {in: ['item-b']}}])
  })
  it('retains variant provenance and strata in the same CSV/ZIP artifact dictionary', async () => {
    fixture(); const data = await getExportData('parent')
    const {filePath} = await saveExportFiles('parent', {}, 'zip', data)
    try { const bytes = await fs.readFile(filePath); expect(bytes.includes(Buffer.from('STRATIFIED_ONLY'))).toBe(true); expect(bytes.includes(Buffer.from('V_config_digest'))).toBe(true); expect(bytes.includes(Buffer.from('NOT_SHOWN'))).toBe(true) }
    finally {await fs.rm(filePath, {force: true})}
  })
  it('previews count the full exact scope while sampling rows', async () => {
    const {template} = fixture(); template.attempts = template.attempts.slice(0, 1)
    const data = await getExportData('parent', {previewLimit: 1})
    expect(data.totalCount).toBe(2); expect(data.rows).toHaveLength(1)
  })
  it.each(['allocation', 'slot', 'publication', 'definition'])('fails closed for %s drift before child payload reads', async mode => {
    const {template} = fixture()
    if (mode === 'allocation') template.attempts[0].trainingVariantAllocationHash = 'f'.repeat(64)
    if (mode === 'slot') template.attempts[0].frozenActiveSlotSetHash = 'f'.repeat(64)
    if (mode === 'publication') template.publishedAt = new Date('2026-10-19T00:00:00Z')
    if (mode === 'definition') template.items[0].formDefinition.prompt = 'changed'
    await expect(getExportData('parent')).rejects.toThrow()
    expect(db.assessment.findMany).not.toHaveBeenCalled(); expect(db.cognitiveSession.findMany).not.toHaveBeenCalled()
  })
  it('provides usable stratified administration counts without reading answers or excluding uncompleted attempts', async () => {
    const {template} = fixture(); template.attempts[1].status = 'IN_PROGRESS'
    const data = await getTrainingVariantTaskAnalysis('parent', {userId: 'teacher', role: UserRole.TEACHER})
    expect(data.recordCount).toBe(2)
    expect(data.strata.find(row => row.variantKey === 'group_0')).toMatchObject({recordCount: 1, completedCount: 1, taskSatisfiedCount: 1})
    expect(data.strata.find(row => row.variantKey === 'group_1')).toMatchObject({recordCount: 1, completedCount: 0, inProgressCount: 1, taskSatisfiedCount: 0})
    expect(db.assessment.findMany).not.toHaveBeenCalled(); expect(db.cognitiveSession.findMany).not.toHaveBeenCalled(); expect(db.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled()
    expect(db.compositeAssessmentAttempt.count.mock.calls[0][0].where.AND).toContainEqual({OR: [{assignmentRef: null}, {assignmentRef: {in: []}}]})
  })
  it('rejects cached report provenance or union leakage before compact source reads', async () => {
    const {template} = fixture(); const scope = await resolveTrainingAttemptScope(template.attempts[0], template)
    const report = {trainingVariant: trainingVariantProvenance(scope), unitReports: [], backgroundValues: [{itemId: 'item-a'}]}
    expect(() => assertTrainingVariantReportScope(report, scope)).not.toThrow()
    expect(() => assertTrainingVariantReportScope({...report, backgroundValues: [{itemId: 'item-b'}]}, scope)).toThrow()
    expect(() => assertTrainingVariantReportScope({...report, trainingVariant: {...report.trainingVariant, variantKey: 'group_1'}}, scope)).toThrow()
    expect(() => assertTrainingVariantReportScope(report)).toThrow()
  })
  it('invalidates artifact identity when either frozen configuration or publication changes', () => {
    const base = {resourceId: 'parent', items: [], trainingVariantDigest: 'a'.repeat(64), trainingVariantFrozen: {version: 1}, publishedAt: '2026-10-18T00:00:00Z'}
    const binding = buildCompositeExportProjectionBinding(base)
    const name = bindCompositeExportFileName('composite_parent_summary_2026-10-18T00-00-00_12345678-1234-1234-1234-123456789012.zip', binding)
    expect(compositeExportFileNameMatchesProjection(name, binding)).toBe(true)
    for (const patch of [{publishedAt: '2026-10-19T00:00:00Z'}, {trainingVariantDigest: 'b'.repeat(64)}, {trainingVariantFrozen: {version: 2}}]) expect(compositeExportFileNameMatchesProjection(name, buildCompositeExportProjectionBinding({...base, ...patch}))).toBe(false)
  })
})

function cognitiveFixture() {
  const template: any = {id: 'parent', name: '认知分卷', productKind: 'QUESTIONNAIRE', publishedAt: new Date('2026-10-18T00:00:00Z'), formSections: [],
    items: ['a', 'b'].map((key, index) => ({id: `cog-${key}`, type: 'COGNITIVE', position: index, required: true, cognitiveAssignmentId: `assignment-${key}`, cognitiveAssignment: {title: `任务${key}`}}))}
  const config = compileWeightedVariants({schemaVersion: 1, groups: template.items.map((item: any, index: number) => ({variantKey: `group_${index}`, label: `组${index}`, weight: 1, units: [{type: 'ITEM', id: item.id}]}))}, buildTrainingVariantUnion(template))
  template.trainingVariantFrozen = config; template.trainingVariantDigest = config.configDigest
  template.attempts = template.items.map((item: any, index: number) => {
    const id = `attempt-${index}`, participantKey = `user-${index}`
    const allocation = createWeightedVariantAllocation(config, {compositeId: template.id, attemptId: id, participantKey, attemptEpoch: 1, publishedAt: template.publishedAt.toISOString()}, {randomInt: () => index, assignedAt: '2026-10-18T00:00:01Z'})
    const frozen = createFrozenActiveSlotSet({schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots: [{slotKey: `cognitive:${item.id}`, unitType: 'COGNITIVE', required: true,
      sourceDefinitionIdentity: {key: item.cognitiveAssignmentId, version: '1', hash: 'd'.repeat(64)}, sourceBinding: {compositeItemId: item.id, sessionId: `session-${index}`}}]})
    return {id, participantKey, attemptEpoch: 1, runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', status: 'COMPLETED',
      trainingVariantAllocationEncrypted: encryptUnifiedRuntimePayload(allocation), trainingVariantAllocationHash: allocation.allocationHash,
      frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(frozen), frozenActiveSlotSetHash: frozen.snapshotHash, completedAt: new Date('2026-10-18T00:01:00Z')}
  })
  const sessions: any[] = template.attempts.map((attempt: any, index: number) => ({id: `session-${index}`, compositeAttemptId: attempt.id, compositeItemId: template.items[index].id,
    runtimeGeneration: 'UNIFIED_V1', attemptNo: 1, rawSubmissions: [{attemptEpoch: 1, trialCount: 1, payloadSchemaVersion: 1, encodingVersion: 'CANONICAL_JSON_SHA256_V1',
      payloadEncrypted: encryptUnifiedRuntimePayload({schemaVersion: 1, attemptEpoch: 1, trials: [{schemaVersion: 1, trialIndex: 0, phase: 'test', startedAtPerfMs: 0, endedAtPerfMs: 1.125, durationMs: 1.125,
        flags: {timeout: false, premature: false}, qualityEvents: [], payload: {rtMs: index ? 1.125 : 0}}]})}]}))
  db.compositeAssessment.findUnique.mockResolvedValue(template); db.cognitiveSession.findMany.mockResolvedValue(sessions)
  return {template, sessions}
}

describe('weighted variant raw, batch and history consumers', () => {
  it('counts and exports only selected current-epoch unified cognitive raw trials without zero filling another group', async () => {
    cognitiveFixture()
    const data = await getExportData('parent', {detail: 'full'})
    expect(data.trialCount).toBe(2)
    expect(data.rows.map(row => [row.C001_T001_rtms, row.C002_T001_rtms])).toEqual([[0, null], [null, 1.125]])
    expect(db.cognitiveRawSubmission.aggregate.mock.calls[0][0].where.OR).toEqual([
      {attemptEpoch: 1, session: {is: {compositeAttemptId: {in: ['attempt-0']}, attemptNo: 1, compositeItemId: {in: ['cog-a']}}}},
      {attemptEpoch: 1, session: {is: {compositeAttemptId: {in: ['attempt-1']}, attemptNo: 1, compositeItemId: {in: ['cog-b']}}}},
    ])
    expect(db.cognitiveSession.findMany.mock.calls[0][0].where.OR).toHaveLength(2)
    expect(db.cognitiveSession.findMany.mock.calls[0][0].where.OR[0]).toMatchObject({compositeAttemptId: {in: ['attempt-0']}, attemptNo: 1, compositeItemId: {in: ['cog-a']}})
  })
  it('preflights combined scoped legacy and unified trial bounds before raw source reads', async () => {
    cognitiveFixture(); db.cognitiveRawSubmission.aggregate.mockResolvedValue({_sum: {trialCount: 100001}})
    await expect(getExportData('parent', {detail: 'full'})).rejects.toThrow()
    expect(db.cognitiveSession.findMany).not.toHaveBeenCalled()
  })
  it.each(['missing', 'duplicate', 'epoch', 'encoding', 'count'])('fails closed on %s unified raw without legacy fallback', mode => {
    const {sessions} = cognitiveFixture(); const session = sessions[0]
    if (mode === 'missing') session.rawSubmissions = []
    if (mode === 'duplicate') session.rawSubmissions.push(session.rawSubmissions[0])
    if (mode === 'epoch') session.rawSubmissions[0].attemptEpoch = 2
    if (mode === 'encoding') session.rawSubmissions[0].encodingVersion = 'unknown'
    if (mode === 'count') session.rawSubmissions[0].trialCount = 2
    expect(() => readTrainingVariantCognitiveTrials(session)).toThrow()
  })
  it('resolves shared FSP2 plans in one batch for all selected attempts', async () => {
    const {template} = fixture()
    const {decryptUnifiedRuntimePayload} = await import('../../modules/assessment-runtime/security')
    const {encryptControlReference} = await import('../../modules/assessment-runtime/control-reference-codec')
    const {publicTemplates} = await import('../../modules/assessment-runtime/public-templates')
    const plans = template.attempts.map((attempt: any) => {
      const {attemptEpoch, snapshotHash, ...plan} = decryptUnifiedRuntimePayload<any>(attempt.frozenActiveSlotSetEncrypted)
      attempt.frozenActiveSlotSetEncrypted = encryptControlReference({k: 'FSP2', p: canonicalHash(plan), e: attemptEpoch})
      return plan
    })
    const read = vi.spyOn(publicTemplates, 'loadMany').mockResolvedValue(plans)
    try {expect((await getExportData('parent')).rows).toHaveLength(2); expect(read).toHaveBeenCalledTimes(1); expect(read.mock.calls[0][0]).toHaveLength(2)}
    finally {read.mockRestore()}
  })
  it('history filters unselected and old-epoch child rows before counts and result parsing', async () => {
    const {template, sessions} = cognitiveFixture()
    const {encryptCognitivePayload} = await import('../../modules/cognitive/cognitive.security')
    const {listMyHistory} = await import('../../modules/cognitive/history.service')
    const parent = {...template.attempts[0], compositeAssessment: template}
    const selected = {...sessions[0], compositeAttempt: parent, scoreEncrypted: encryptCognitivePayload(0), qualityFlagsEncrypted: encryptCognitivePayload({interpretable: true}), assignment: {title: 'Selected'}}
    db.cognitiveSession.findMany.mockResolvedValue([selected, {...selected, id: 'wrong-slot', compositeItemId: 'cog-b', scoreEncrypted: 'POISON'}, {...selected, id: 'old-epoch', attemptNo: 2, scoreEncrypted: 'POISON'}])
    const data = await listMyHistory('user-0', {skip: 0, take: 20, page: 1, pageSize: 20})
    expect(data.total).toBe(1); expect(data.list[0]).toMatchObject({sessionId: 'session-0', score: 0, trainingVariant: {variantKey: 'group_0'}})
  })
})
