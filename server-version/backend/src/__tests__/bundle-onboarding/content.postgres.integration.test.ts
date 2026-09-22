import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import crypto, { createHmac, randomUUID, randomBytes } from 'node:crypto'
import path from 'node:path'
import { scaffoldPackage } from '../../modules/assessment-bundle/onboarding/template'
import { gonogoSequence } from '../../modules/cognitive/randomization'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import { INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1 } from '../../modules/assessment-bundle/bundles/integrated-adult-age-context-v1'
import { readSmoke } from '../../../scripts/bundle-content-check'
import { discoverPackages } from '../../modules/assessment-bundle/onboarding/loader'
import { hashDeclarativePackage } from '../../modules/assessment-bundle/onboarding/contract'
import { packageEntry } from '../../modules/assessment-bundle/onboarding/catalog'
import { canonicalJsonString, canonicalHash } from '../../modules/assessment-runtime/canonical'
import { compositeItemSlotKey } from '../../modules/assessment-runtime/slot-set'
import { installPackage, publishPackage, changePackageStatus } from '../../modules/bundle-product/package-release'
import { BundleDefinitionProvider } from '../../modules/bundle-product/definition-provider'
import { getExecutableScalePackage } from '../../modules/scale/onboarding/executable-registry'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { cognitiveSeeds } from '../../modules/cognitive/generated/seeds'
import { requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { freezeAssignmentProfile, freezeDataForWrite } from '../../modules/cognitive/profile-freeze'
import { decryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { integrationDatabaseUrl } from '../integration/integration-env'

vi.mock('node:crypto', async importOriginal => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return { ...actual, randomBytes: vi.fn(actual.randomBytes) }
})

const packages = discoverPackages(path.resolve(__dirname, '../../modules/assessment-bundle/packages'))
// Exercise every generic driver branch without publishing another product.
function mixedDriverCase() {
  const pack = scaffoldPackage('c4_driver_' + randomUUID().replace(/-/g, ''))
  pack.context = structuredClone(INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1)
  pack.manifest.files.context = 'context.json'
  pack.manifest.definition.contextDefinitionKey = pack.context.contextDefinitionKey
  pack.manifest.definition.contextDefinitionVersion = pack.context.contextDefinitionVersion
  pack.manifest.definition.slots.push(
    {slotKey:'scale',unitType:'SCALE',position:1,required:true,instrumentKey:'who5',instrumentVersion:'1.0.0',respondentType:'SELF',valueSelectors:['raw_total']},
    {slotKey:'cognitive',unitType:'COGNITIVE',position:2,required:true,instrumentKey:'gonogo',instrumentVersion:'1.0.0',respondentType:'SELF',valueSelectors:['commissionRate']},
    {slotKey:'context',unitType:'FORM',position:3,required:true,instrumentKey:pack.context.contextDefinitionKey,instrumentVersion:pack.context.contextDefinitionVersion,respondentType:'SELF'},
  )
  pack.manifest.cognitiveDependencies = [{slotKey:'cognitive',configVersion:'1.0.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',profile:'standard'}]
  pack.evidence.push(
    {evidenceKey:'scale.observation',slotKey:'scale',selector:'raw_total',valueType:'number',unit:'points',construct:'wellbeing',role:'SUPPORTING',direction:'neutral',qualityPolicy:'allow_limited'},
    {evidenceKey:'cognitive.observation',slotKey:'cognitive',selector:'commissionRate',valueType:'number',unit:'ratio',construct:'inhibition',role:'SUPPORTING',direction:'neutral',qualityPolicy:'allow_limited'},
    {evidenceKey:'context.age',slotKey:'context',selector:'subject_age_years',valueType:'number',unit:'context',construct:'age',role:'CONTEXT',direction:'neutral',qualityPolicy:'interpretable_only'},
  )
  const fixture = readSmoke('example_descriptive_v1', '1.0.0')
  fixture.context = {subject_age_years:25}
  const scale = getExecutableScalePackage('who5','1.0.0')!
  fixture.slots.scale = {type:'SCALE',answers:scale.definition.items.map(item=>({itemCode:item.itemCode,responseValue:scale.definition.responseSets.find(r=>r.key===item.responseSetKey)!.options[0].value}))}
  fixture.slots.cognitive = {type:'COGNITIVE',trials:gonogoSequence(fixture.randomSeed,120,0.25).map((trialType,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*1300,endedAtPerfMs:trialIndex*1300+300,payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?300:null,interrupted:false}}))}
  return {name:'synthetic four-type driver',pack,fixture}
}
const cases = [...packages.map(pack => ({name:pack.manifest.definition.bundleKey+'@'+pack.manifest.definition.bundleVersion,pack,fixture:readSmoke(pack.manifest.definition.bundleKey,pack.manifest.definition.bundleVersion)})), mixedDriverCase()]
const url = integrationDatabaseUrl('BUNDLE_PRODUCT_TEST_DATABASE_URL')
const suite = url ? describe : describe.skip
suite('actual content packages: install, FINAL, canonical report and audiences', () => {
  const suffix = randomUUID(), actor = { userId: 'c4-admin-' + suffix, role: UserRole.ADMIN }
  const reviewer = 'c4-reviewer-' + suffix, student = 'c4-student-' + suffix
  const secret = 'isolated-c4-review-key-' + suffix, oldKey = process.env.BUNDLE_REVIEW_SIGNING_KEY
  let db: PrismaClient, courseId: string
  const scaleStatuses = new Map<string, any>(), configIds: string[] = []
  beforeAll(async () => {
    process.env.DATABASE_URL = url!; process.env.BUNDLE_PRODUCTS_ENABLED = 'true'; process.env.BUNDLE_REVIEW_SIGNING_KEY = secret
    db = new PrismaClient({ datasources: { db: { url } } })
    for (const [id, role] of [[actor.userId, 'ADMIN'], [reviewer, 'ADMIN'], [student, 'STUDENT']] as const) {
      await db.user.create({ data: { id, username: id, passwordHash: 'synthetic-only', role } })
    }
    courseId = (await db.course.create({ data: { creatorId: actor.userId, title: 'C4 synthetic content smoke', courseCode: 'C4-' + suffix, status: 'PUBLISHED' } })).id
    await db.courseStudent.create({ data: { courseId, studentId: student, status: 'ACTIVE' } })
  }, 60000)
  afterAll(async () => {
    if (db) {
      const ids = (await db.compositeAssessment.findMany({ where: { createdBy: actor.userId }, select: { id: true } })).map(r => r.id)
      const attempts = (await db.compositeAssessmentAttempt.findMany({ where: { compositeAssessmentId: { in: ids } }, select: { id: true } })).map(r => r.id)
      await db.assessmentUnitSnapshot.deleteMany({ where: { compositeAttemptId: { in: attempts } } })
      await db.situationalRawSubmission.deleteMany({ where: { attempt: { compositeAttemptId: { in: attempts } } } })
      await db.situationalAttempt.deleteMany({ where: { compositeAttemptId: { in: attempts } } })
      await db.cognitiveRawSubmission.deleteMany({ where: { session: { compositeAttemptId: { in: attempts } } } })
      await db.cognitiveSession.deleteMany({ where: { compositeAttemptId: { in: attempts } } })
      await db.assessment.deleteMany({ where: { compositeAttemptId: { in: attempts } } })
      await db.compositeAssessment.deleteMany({ where: { id: { in: ids } } })
      await db.cognitiveAssignment.deleteMany({ where: { createdBy: actor.userId } })
      await db.cognitiveTestConfig.deleteMany({ where: { id: { in: configIds } } })
      for (const [id, status] of scaleStatuses) await db.scale.update({ where: { id }, data: { status } })
      await db.scale.deleteMany({ where: { creatorId: actor.userId } })
      await db.course.deleteMany({ where: { creatorId: actor.userId } })
      await db.bundlePackageRelease.deleteMany({ where: { installedBy: actor.userId } })
      await db.user.deleteMany({ where: { id: { in: [actor.userId, reviewer, student] } } })
      await db.$disconnect()
    }
    if (oldKey === undefined) delete process.env.BUNDLE_REVIEW_SIGNING_KEY; else process.env.BUNDLE_REVIEW_SIGNING_KEY = oldKey
  }, 60000)
  it('has at least one package; no empty-green content suite', () => expect(packages.length).toBeGreaterThan(0))
  it.each(cases)('$name', async ({ pack, fixture }) => {
    const d = pack.manifest.definition
    const installed = await installPackage(db, actor.userId, pack)
    // A shared/non-isolated database must never have an existing release overwritten.
    expect(installed.installedBy).toBe(actor.userId)
    expect(installed.status).toBe('DRAFT')
    const bindings: Array<{ slotKey: string; resourceId?: string }> = []
    for (const slot of d.slots) {
      if (slot.unitType === 'FORM') continue
      const binding: { slotKey: string; resourceId?: string } = { slotKey: slot.slotKey }
      if (slot.unitType === 'SCALE') {
        const p = getExecutableScalePackage(slot.instrumentKey, slot.instrumentVersion)!
        let row = await db.scale.findUnique({ where: { code: slot.instrumentKey } })
        if (row) { if (!scaleStatuses.has(row.id)) scaleStatuses.set(row.id, row.status); row = await db.scale.update({ where: { id: row.id }, data: { status: 'PUBLISHED' } }) }
        else row = await db.scale.create({ data: { code: slot.instrumentKey, name: slot.instrumentKey, creatorId: actor.userId, status: 'PUBLISHED', visibility: 'HIDDEN', instrumentClass: 'STANDARD', instrumentVersion: slot.instrumentVersion, definition: p.definition as any, definitionHash: hashScaleDefinition(p.definition), itemCount: p.definition.items.length, dimensionCount: p.definition.scoring.scores.length } })
        binding.resourceId = row.id
      } else if (slot.unitType === 'COGNITIVE') {
        const dep = pack.manifest.cognitiveDependencies.find(v => v.slotKey === slot.slotKey)!
        const seed = cognitiveSeeds.find(v => v.testType === slot.instrumentKey && v.configVersion === dep.configVersion)!
        let cfg = await db.cognitiveTestConfig.findUnique({ where: { testType_configVersion: { testType: slot.instrumentKey, configVersion: dep.configVersion } } })
        if (!cfg) { cfg = await db.cognitiveTestConfig.create({ data: { ...seed, config: seed.config as any, accessPolicy: 'OPEN' } }); configIds.push(cfg.id) }
        const entry = requireCognitiveRegistryEntry(slot.instrumentKey, dep.engineVersion, dep.scoringVersion)
        const frozen = freezeAssignmentProfile({ entry, profile: dep.profile, baseConfig: cfg.config as any })
        binding.resourceId = (await db.cognitiveAssignment.create({ data: { configId: cfg.id, courseId, createdBy: actor.userId, title: slot.slotKey, status: 'PUBLISHED', listedStandalone: true, ...freezeDataForWrite(frozen) } })).id
      }
      bindings.push(binding)
    }
    const material = { contentHash: hashDeclarativePackage(pack), reviewerId: reviewer, expiresAt: new Date(Date.now() + 3600000).toISOString(), claims: ['independent_summary', 'cross_source_condition', 'joint_conclusion'], scientific: true, rights: true, language: true, report: true }
    await publishPackage(db, actor.userId, d.bundleKey, d.bundleVersion, { ...material, signature: createHmac('sha256', secret).update(canonicalJsonString(material)).digest('hex') })
    const provider = new BundleDefinitionProvider([packageEntry(pack)])
    const { createBundleProductService, readInstance } = await import('../../modules/bundle-product/service')
    const product = createBundleProductService(provider), runtime = await import('../../modules/composite/composite.service')
    let row = await product.create(actor, { requestId: randomUUID(), bundleKey: d.bundleKey, bundleVersion: d.bundleVersion, name: d.name, courseId, bindings })
    row = await product.publish(actor, row.id, row.revision)
    // Fix only test admission entropy, then restore it before submission. The
    // authoritative scorer still validates trials against the real frozen seed.
    vi.mocked(randomBytes).mockImplementation(((size: number) => size === 16 ? Buffer.from(fixture.randomSeed, 'hex') : crypto.randomBytes(size)) as any)
    let started: Awaited<ReturnType<typeof runtime.startUserAttempt>>
    try { started = await runtime.startUserAttempt(student, row.id) } finally { vi.mocked(randomBytes).mockImplementation(crypto.randomBytes) }
    const attemptId = started.attempt.id
    const instance = await db.bundleInstance.findUniqueOrThrow({ where: { compositeId: row.id } })
    const frozen = readInstance(instance)
    if (frozen.bindings.context.length) {
      const section = await db.compositeFormSection.findFirstOrThrow({ where: { compositeAssessmentId: row.id }, include: { items: true } })
      await (await import('../../modules/composite/final-submit.service')).submitCompositeFormSectionFinal({ attemptId, sectionId: section.id, userId: student, submissionId: randomUUID(), attemptEpoch: 1, definitionHash: (started.attempt.currentItem as any).definitionHash,
        answers: section.items.map(i => { const key = frozen.bindings.context.find(c => c.itemId === i.id)!.contextKey; return { formItemId: i.id, value: fixture.context[key] == null ? '' : String(fixture.context[key]) } }) })
    }
    for (const slot of d.slots.filter(s => s.unitType !== 'FORM')) {
      const sample = fixture.slots[slot.slotKey], itemId = frozen.bindings.slots.find(b => b.slotKey === slot.slotKey)!.itemId
      if (sample.type === 'SCALE') {
        const child = await db.assessment.findFirstOrThrow({ where: { compositeAttemptId: attemptId, compositeItemId: itemId } })
        await (await import('../../modules/scale/scale-final-submit.service')).submitScaleAssessmentFinal({ assessmentId: child.id, userId: student, submissionId: randomUUID(), attemptEpoch: 1, definitionHash: hashScaleDefinition(getExecutableScalePackage(slot.instrumentKey, slot.instrumentVersion)!.definition), contextSnapshotHash: null, answers: sample.answers as any })
      } else if (sample.type === 'COGNITIVE') {
        const child = await db.cognitiveSession.findFirstOrThrow({ where: { compositeAttemptId: attemptId, compositeItemId: itemId }, include: { assignment: true } })
        expect(child.randomSeed).toBe(fixture.randomSeed)
        await (await import('../../modules/cognitive/final-submit.service')).submitCognitiveSessionFinal(student, { sessionId: child.id, submissionId: randomUUID(), attemptEpoch: 1, definitionHash: child.assignment!.resolvedConfigHash!, contextSnapshotHash: null, trials: sample.trials as any })
      } else {
        const child = await db.situationalAttempt.findFirstOrThrow({ where: { compositeAttemptId: attemptId, compositeItemId: itemId } })
        await (await import('../../modules/situational/situational-final-submit.service')).submitSituationalAttemptFinal({ attemptId: child.id, userId: student, submissionId: randomUUID(), attemptEpoch: 1, definitionHash: child.definitionHash, instrumentVersion: child.instrumentVersion, compiledRuntimeHash: child.compiledRuntimeHash, scoringVersion: child.scoringVersion, responses: sample.responses as any, embedded: { compositeAttemptId: attemptId, compositeItemId: itemId, compositeSlotKey: compositeItemSlotKey(itemId, 'SITUATIONAL'), userId: student } })
      }
    }
    await runtime.finalizeCompositeAttemptIfReady(attemptId)
    expect((await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: attemptId } })).status).toBe('COMPLETED')
    const analysis = await import('../../modules/bundle-product/analysis')
    const report = await analysis.readReport(attemptId, 'admin')
    expect(['READY', 'UNAVAILABLE']).toContain(report.status)
    const stored = await db.bundleAnalysis.findUniqueOrThrow({ where: { id: report.analysisId } })
    const facts = decryptCognitivePayload<any>(stored.payloadEncrypted!)
    expect(canonicalHash(facts)).toBe(report.factsHash)
    expect(facts.enginePayload.kind).toBe(fixture.expectedKind)
    expect((facts.enginePayload.payload?.conclusions ?? []).map((c: any) => c.ruleId).sort()).toEqual([...fixture.expectedRuleIds].sort())
    for (const audience of ['student', 'parent', 'teacher', 'admin'] as const) {
      const view = (await analysis.readReport(attemptId, audience)).view as any
      expect(view).toBeTruthy()
      for (const e of view.evidence.filter((e: any) => e.sourceKind === 'CONTEXT_FACT')) expect(e.value).toEqual({state:'redacted'})
      for (const block of view.blocks ?? []) {
        expect(pack.report.blocks.find(b => b.blockId === block.blockId)?.audience).toContain(audience)
        expect(block.evidence.every((e: any) => e.sourceKind !== 'CONTEXT_FACT')).toBe(true)
      }
    }
    await changePackageStatus(db, actor.userId, d.bundleKey, d.bundleVersion, 'RETIRED')
    expect((await analysis.readReport(attemptId, 'admin')).factsHash).toBe(report.factsHash)
  }, 90000)
})
