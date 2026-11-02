import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const memory = vi.hoisted(() => ({ repository: null as any, disclosure: null as any, reportAudience: 'teacher' as string | undefined }))
vi.mock('../../modules/assessment-relational/repository', async original => ({ ...await original<any>(), createSqlRelationalAssignmentRepository: () => memory.repository }))
vi.mock('../../modules/assessment-runtime/runtime-snapshot', async original => ({ ...await original<any>(), loadFrozenScaleRuntimeSnapshot: async () => ({ schemaVersion: 2, compiledPolicy: {}, definition: {report:{audienceContract: memory.reportAudience ? {audience:memory.reportAudience}:undefined}} }) }))
vi.mock('../../modules/scale/projection/policy-resolver', async original => ({ ...await original<any>(), scaleProjectionPolicyFromCompiled: () => ({ disposition: 'KNOWN', disclosure: memory.disclosure }) }))
import { createChildCrossMethodService, assertChildSourceBinding } from '../../modules/bundle-product/child-cross-method'
import { loadPackage } from '../../modules/assessment-bundle/onboarding/loader'
import { verifyPackageFixtures } from '../../modules/assessment-bundle/onboarding/fixtures'
import { packageEntry } from '../../modules/assessment-bundle/onboarding/catalog'
import { freezeBundleProductionDefinition, readFrozenBundleProductionDefinition } from '../../modules/bundle-product/definition-provider'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { encryptCognitivePayload, decryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { compositeItemSlotKey } from '../../modules/assessment-runtime/slot-set'
import { DISCLOSURE_PRESETS } from '../../modules/scale/policy/disclosure'
import { createChexiZhHansSource } from '../../modules/scale/packages/chexi-zh-hans-v1'
import { createScaleInstrumentRegistry } from '../../modules/scale/onboarding/instrument-registry'
import { materializeScaleInstrumentContent } from '../../modules/scale/onboarding/materialize'

const root = path.resolve(__dirname, '../../modules/assessment-bundle/packages')
const pack = (name: string) => loadPackage(root + '/' + name + '/0.1.0')
const actor = { userId: 'teacher', role: 'TEACHER' }, childActor = { userId: 'child', role: 'STUDENT' }
const requestId = '20000000-0000-4000-8000-000000000001'
const reportRequest = '20000000-0000-4000-8000-000000000002'

function harness(sourceVersion = '1.0.0', targetVersion = sourceVersion) {
  const selectedPack = (name: string) => {
    const p = pack(name)
    for (const slot of p.manifest.definition.slots) if (slot.unitType === 'SCALE' && slot.instrumentKey === 'chexi_zh_hans') {
      slot.instrumentVersion = name.startsWith('child_cognitive_control_') ? targetVersion : sourceVersion
    }
    return p
  }
  const assignments = new Map<string, any>(), episodes = new Map<string, any>(), attempts = new Map<string, any>(), consents = new Map<string, any>(), analyses = new Map<string, any>()
  const templates = new Map<string, any>()
  const names = ['child_cognitive_tasks_zh_cn', 'child_chexi_parent_zh_cn_v1', 'child_chexi_teacher_zh_cn_v1']
  for (const [i, name] of names.entries()) {
    const p = selectedPack(name), frozen = freezeBundleProductionDefinition(packageEntry(p), { frozenAt: '2026-11-01T00:00:00.000Z', sourceReference: 'fixture' })
    const bindings = { schemaVersion: 1, slots: frozen.bundleSnapshot.slotBindings.filter(s => s.unitType !== 'FORM').map(s => ({ slotKey: s.slotKey, itemId: name + '-' + s.slotKey, unitType: s.unitType })), context: [] }
    templates.set(['tasks','parent','teacher-observer'][i], { id: ['tasks','parent','teacher-observer'][i], createdBy: 'teacher', status: 'PUBLISHED', courseId: 'course', publicEnabled: false, productKind: 'ASSESSMENT_BUNDLE', bundleInstance: {
      definitionHash: frozen.contentHash, definitionEncrypted: encryptCognitivePayload(frozen), bindingsHash: canonicalHash(bindings), bindingsEncrypted: encryptCognitivePayload(bindings),
    } })
  }
  memory.repository = {
    findById: async (id: string) => assignments.get(id) ?? null,
    create: async (a: any) => assignments.set(a.assignmentId, { ...a, policyDomain: 'LEGACY_COURSE' }),
    resolveAcceptedConsent: async (a: any) => { const c = consents.get(a.consentId); return c?.acceptedAt && !c.revokedAt ? { consentId: c.id, acceptedAt: c.acceptedAt.toISOString() } : null },
    transition: async ({ assignmentId, from, to }: any) => { const a = assignments.get(assignmentId); if (a.status !== from) return false; a.status = to; return true },
  }
  const db: any = {
    $transaction: async (fn: any) => fn(db), $queryRaw: async () => [],
    assessmentEpisode: { findUnique: async ({ where }: any) => episodes.get(where.id), create: async ({ data }: any) => { episodes.set(data.id, data); return data } },
    relationalAssessmentAssignment: { findMany: async ({ where }: any) => [...assignments.values()].filter(a => !where.episodeId || a.episodeId === where.episodeId).map(a => ({ id: a.assignmentId })) },
    compositeAssessment: { findUnique: async ({ where }: any) => templates.get(where.id) },
    course: { findUnique: async () => ({ id: 'course', creatorId: 'teacher', isLibrary: false }) },
    courseStudent: { findUnique: async () => ({ studentId: 'child', status: 'ACTIVE' }) },
    user: { findUnique: async ({ where }: any) => ({ id: where.id, role: 'STUDENT', isActive: true, isFrozen: false }) },
    parentStudentRelationship: { findFirst: async () => ({ id: 'relationship', parentUserId: 'parent-user', studentUserId: 'child', status: 'ACTIVE', approvedAt: null, revokedAt: null, consentVersion: null, consentHash: null }) },
    assessmentAttemptConsent: { create: async ({ data }: any) => { consents.set(data.id, data); return data }, findUnique: async ({ where }: any) => consents.get(where.id) },
    compositeAssessmentAttempt: { findFirst: async ({ where }: any) => [...attempts.values()].find(a => a.assignmentRef === where.assignmentRef), findUnique: async ({ where }: any) => attempts.get(where.id) },
    assessment: { findFirst: async () => ({ runtimeSnapshotEncrypted: 'fixture-admission' }) },
    bundleAnalysis: {
      findUnique: async ({ where }: any) => where.id ? analyses.get(where.id) : [...analyses.values()].find(a => a.attemptId === where.attemptId_attemptEpoch_requestKey.attemptId && a.requestKey === where.attemptId_attemptEpoch_requestKey.requestKey),
      upsert: async ({ create }: any) => { const a = { id: 'analysis-' + analyses.size, retryCount: 0, ...create }; analyses.set(a.id, a); return a },
    },
  }
  const eligible = vi.fn(async (_actor: any, key: string) => packageEntry(selectedPack(key)))
  const frozenReads = vi.fn(async (id: string) => {
    const t = attempts.get(id), source = templates.get(t.compositeAssessmentId), p = selectedPack(names[t.compositeAssessmentId === 'tasks' ? 0 : t.compositeAssessmentId === 'parent' ? 1 : 2])
    const values = t.compositeAssessmentId === 'tasks' ? pack('child_cognitive_tasks_zh_cn').fixtures.valid.values : {}
    return { parent: { ...t, compositeAssessment: source }, payloads: p.manifest.definition.slots.filter(slot => slot.unitType !== 'FORM').map(slot => ({ header: { slotKey: compositeItemSlotKey(names[t.compositeAssessmentId === 'tasks' ? 0 : t.compositeAssessmentId === 'parent' ? 1 : 2] + '-' + slot.slotKey, slot.unitType as any) }, envelope: {
      resultHash: canonicalHash({ id, slot: slot.slotKey }), core: { instrumentKey: slot.instrumentKey, instrumentVersion: slot.instrumentVersion, quality: { status: 'interpretable' } },
      bundleBridge: { sourceResultHash: canonicalHash({ id, measurement: slot.instrumentKey }), ...(slot.unitType === 'COGNITIVE' ? { metrics: Object.fromEntries(p.evidence.filter(e => e.slotKey === slot.slotKey).map(e => [e.selector, (values[e.evidenceKey] as any).value])), hasReferenceNorms: false } : { scores: ['working_memory','inhibition'].map(scoreKey => ({ scoreKey, value: t.compositeAssessmentId === 'parent' ? 2 : 4, status: 'calculated', criterionBandKey: null })) }) },
    } })) }
  })
  const service = createChildCrossMethodService(db, { eligible: eligible as any, readInputs: frozenReads, startRuntime: (async (_db: any, input: any) => {
    const t = { id: 'attempt-' + attempts.size, userId: input.respondentUserId, compositeAssessmentId: input.compositeAssessmentId, status: 'IN_PROGRESS', attemptEpoch: 1, ...input.attemptIdentity, aggregateInputHash: null }
    attempts.set(t.id, t); return t
  }) as any, attemptState: (async id => ({ id })) as any })
  const issue = () => service.issue(actor, { requestId, subjectUserId: 'child', taskCompositeId: 'tasks', parent: { userId: 'parent-user', compositeId: 'parent' }, teacherObserverCompositeId: 'teacher-observer', reportBundleKey: 'child_cognitive_control_parent_teacher_zh_cn', reportBundleVersion: '0.1.0' })
  const complete = async () => {
    const issued = await issue()
    for (const a of assignments.values()) {
      if (a.consentId) consents.get(a.consentId).acceptedAt = new Date('2026-11-01T00:00:00Z')
      const role = a.respondentRole
      const r = await service.start({ userId: a.respondentUserId, role }, a.assignmentId)
      const t = attempts.get(r.attemptId); t.status = 'COMPLETED'; t.aggregateInputHash = canonicalHash({ attemptId: t.id }); a.status = 'COMPLETED'
    }
    return issued
  }
  return { db, service, issue, complete, assignments, attempts, episodes, consents, analyses, frozenReads }
}

beforeEach(() => {
  process.env.DATA_ENCRYPTION_KEY = '10'.repeat(32)
  memory.disclosure = { schemaVersion: 1, policyVersion: 'fixture', audiences: { teacher: DISCLOSURE_PRESETS.FULL_REPORT() }, unknownAudience: 'DENY' }
  memory.reportAudience = 'teacher'
})
describe('child cross-method existing-runtime composition', () => {
  it('keeps all six actual package configurations structurally valid without imposing a new age gate', () => {
    for (const name of ['child_cognitive_tasks_zh_cn','child_chexi_parent_zh_cn_v1','child_chexi_teacher_zh_cn_v1','child_cognitive_control_parent_zh_cn','child_cognitive_control_teacher_zh_cn','child_cognitive_control_parent_teacher_zh_cn']) {
      const p = pack(name); expect(verifyPackageFixtures(p)).toHaveLength(4)
      if (name.startsWith('child_cognitive_')) expect(p.rules.applicability).toBeUndefined()
    }
  })
  it('issues one shared episode with separate true child, parent and teacher assignments; retry is idempotent', async () => {
    const h = harness(), first = await h.issue(), second = await h.issue()
    expect(second).toEqual(first); expect(h.episodes.size).toBe(1); expect(h.assignments.size).toBe(3)
    expect([...h.assignments.values()].map(a => a.episodeId)).toEqual([requestId,requestId,requestId])
    const self = [...h.assignments.values()].find(a => a.relationshipKind === 'SELF')
    expect(self.respondentUserId).toBe('child'); expect(self.subjectUserId).toBe('child')
    await expect(h.service.start(actor, self.assignmentId)).rejects.toThrow('真实作答者')
    const parent = [...h.assignments.values()].find(a => a.respondentRole === 'PARENT')
    await expect(h.service.start({ userId: 'parent-user', role: 'PARENT' }, parent.assignmentId)).rejects.toThrow('consent')
    expect(h.attempts.size).toBe(0)
  })
  it('uses the eligible target exact CHEXI revision for both independent observers', async () => {
    const h = harness('1.0.1')
    const issued = await h.issue()
    expect(issued.assignments).toHaveLength(3)
    expect([...h.assignments.values()].filter(a => a.relationshipKind !== 'SELF').map(a => a.respondentUserId).sort()).toEqual(['parent-user', 'teacher'])
  })
  it.each([['1.0.0', '1.0.1'], ['1.0.1', '1.0.0']])('rejects source %s when the eligible target requires %s before creating a round', async (sourceVersion, targetVersion) => {
    const h = harness(sourceVersion, targetVersion)
    await expect(h.issue()).rejects.toThrow('CHEXI精确版本')
    expect(h.episodes.size).toBe(0)
    expect(h.assignments.size).toBe(0)
  })
  it('collects actual frozen sources, keeps parent 2 and teacher 4 separate, and reads saved facts without rescoring', async () => {
    const h = harness(); await h.complete()
    const r: any = await h.service.collect(actor, requestId, reportRequest)
    expect(r.status).toBe('READY')
    expect(r.view.evidence.find((e:any) => e.evidenceKey === 'parent_chexi_working_memory').value.value).toBe(2)
    expect(r.view.evidence.find((e:any) => e.evidenceKey === 'teacher_chexi_working_memory').value.value).toBe(4)
    expect(r.view.evidence.find((e:any) => e.evidenceKey === 'flanker_flanker_effect_ms').value.value).toBe(-12)
    expect(r.view.evidence.find((e:any) => e.evidenceKey === 'gonogo_omission_rate').value.value).toBe(0)
    const reads = h.frozenReads.mock.calls.length
    const replay: any = await h.service.collect(actor, requestId, reportRequest)
    expect(replay.factsHash).toBe(r.factsHash); expect(h.analyses.size).toBe(1); expect(h.frozenReads).toHaveBeenCalledTimes(reads)
    await h.service.read(actor, r.analysisId); expect(h.frozenReads).toHaveBeenCalledTimes(reads)
    const target = readFrozenBundleProductionDefinition(decryptCognitivePayload([...h.analyses.values()][0].targetDefinitionEncrypted))
    expect(target.crossMethodSources).toHaveLength(3)
  })
  it('resumes the admitted exact attempt without asking for a new publication, while still enforcing consent', async () => {
    const h=harness();await h.complete()
    const a=[...h.assignments.values()].find(a=>a.respondentRole==='PARENT')
    h.db.compositeAssessment.findUnique=async()=>{throw new Error('unexpected new publication read')}
    const prior=[...h.attempts.values()].find(t=>t.assignmentRef===a.assignmentId)
    expect(await h.service.start({userId:a.respondentUserId,role:'PARENT'},a.assignmentId)).toMatchObject({attemptId:prior.id})
    h.consents.get(a.consentId).revokedAt=new Date()
    await expect(h.service.start({userId:a.respondentUserId,role:'PARENT'},a.assignmentId)).rejects.toThrow('已失效')
  })
  it.each(['subjectUserId','episodeId','respondentUserId','assignmentRef'])('rejects frozen %s mismatch before aggregating', async field => {
    const h = harness(); await h.complete()
    const t = [...h.attempts.values()][0]; t[field] = 'different'
    await expect(h.service.collect(actor, requestId, reportRequest)).rejects.toThrow('不匹配')
    expect(h.analyses.size).toBe(0)
  })
  it('does not replace missing work with zero; withholds shared results after consent revocation or from another teacher', async () => {
    const h = harness(); await h.issue()
    expect(await h.service.collect(actor, requestId, reportRequest)).toMatchObject({ status: 'WAITING' })
    await h.complete(); const r: any = await h.service.collect(actor, requestId, reportRequest)
    await expect(h.service.read({ userId: 'other-teacher', role: 'TEACHER' }, r.analysisId)).rejects.toThrow()
    const c = [...h.consents.values()].find(c => c.respondentType === 'PARENT'); c.revokedAt = new Date()
    await expect(h.service.read(actor, r.analysisId)).rejects.toThrow('撤销')
  })
  it('applies source disclosure to text, numeric evidence, quality and JSON projection', async () => {
    const h = harness(); await h.complete()
    memory.disclosure.audiences.teacher = { ...DISCLOSURE_PRESETS.FULL_REPORT(), numericScores: false, individualInterpretations: false, scoreDerivedLabels: false, resultQualityDetails: false }
    const r: any = await h.service.collect(actor, requestId, reportRequest)
    expect(r.view.evidence.filter((e:any) => e.sourceKind === 'SCALE_SCORE').every((e:any) => e.value.state === 'redacted')).toBe(true)
    expect(r.view.blocks.flatMap((b:any) => b.conclusions).every((c:any) => !c.evidenceKeys.some((k:string) => k.includes('chexi')))).toBe(true)
    expect(r.view.engineSummary.conclusions).toBeUndefined()
  })
  it('retains the existing frozen report audience ceiling independently from numeric disclosure', async () => {
    const h=harness();await h.complete();memory.reportAudience=undefined
    const r:any=await h.service.collect(actor,requestId,reportRequest)
    expect(r.view.evidence.find((e:any)=>e.evidenceKey==='parent_chexi_working_memory').value.value).toBe(2)
    expect(r.view.blocks.flatMap((b:any)=>b.conclusions).every((c:any)=>!c.evidenceKeys.some((k:string)=>k.includes('chexi')))).toBe(true)
  })
  it('materializes the private official-form contract as hidden DRAFT using the existing importer path', async () => {
    const source = createChexiZhHansSource({ items: Array.from({length:24},(_,i) => '合成题文'+i), instruction: '合成指导语' })
    const registry = createScaleInstrumentRegistry([source]); let row: any
    const db: any = { scale: { findUnique: async () => row ?? null, create: async ({data}:any) => (row={ id:'private-scale',...data }) } }
    const result = await materializeScaleInstrumentContent(db, { ...source.identity, actorUserId: 'system-admin' }, registry)
    expect(result.created).toBe(true); expect(row.status).toBe('DRAFT'); expect(row.visibility).toBe('HIDDEN'); expect(row.definition.items).toHaveLength(24)
    expect(await materializeScaleInstrumentContent(db, { ...source.identity, actorUserId: 'system-admin' }, registry)).toMatchObject({ created: false, definitionHash: result.definitionHash })
  })
})
