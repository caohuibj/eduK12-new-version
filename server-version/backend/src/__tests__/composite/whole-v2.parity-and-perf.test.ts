import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { buildFourFamilyTestSlots } from '../assessment-runtime/phase2-test-fixtures'
import {
  createPublicTemplateStore,
  withCommittedStartTemplates,
  type PublicTemplateRow,
} from '../../modules/assessment-runtime/public-templates'
import {
  buildCompositePublicationPlan,
  saveCompositePublicationPlan,
} from '../../modules/assessment-runtime/composite-publication-plan'
import { commitCompositeWholeFinal } from '../../modules/assessment-runtime/composite-final.writer'
import { readCompositeFinalRawBatch } from '../../modules/assessment-runtime/composite-final.reader'
import {
  freezeTrainingTimingPolicy,
  freezeTrainingTimingSnapshot,
  projectTrainingTimingFact,
} from '../../modules/assessment-runtime/training-scale-timing'
import { prisma } from '../../config/database'
import { withTrainingTimingReport } from '../../modules/composite/training-timing-report'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import {
  materializeCompositePublicationPlan,
  resetWholeV2PlanCacheForTests,
  resolveVariantActiveSlotKeys,
} from '../../modules/composite/whole-v2.access'
import { educationWholeProgressFromRow } from '../../modules/composite/whole-questionnaire.service'
import { recoverWholeQuestionnaireReceipt } from '../../modules/composite/whole-receipt-recovery'
import { preloadCompositeReportFacts } from '../../modules/composite/composite-report-read-batch'
import {
  clearPreloadedActiveScaleDeployments,
  setPreloadedActiveScaleDeployments,
} from '../../modules/scale/deployment/repository'
import * as scaleDeploymentService from '../../modules/scale/deployment/service'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { teacherNativeLeafContract } from '../../modules/huiteacher/nativeGroupSource'
import * as assessmentResourceRepo from '../../modules/education-tools/assessment-resource.repository'
import { relationalEntryToRunPolicy } from '../../modules/assessment-run/resourceAuthority'
import { buildSelfGroupCohortAnalysisPolicy } from '../../modules/assessment-policy/self-group-contract'
import { testDisclosure } from '../assessment-policy/result-disclosure.fixture'

const sqlTextOf = (sql: any): string => (
  Array.isArray(sql)
    ? sql.join('?')
    : Array.isArray(sql?.strings)
      ? sql.strings.join('?')
      : String(sql?.sql ?? '')
)

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

function makeTemplateStore() {
  const rows = new Map<string, PublicTemplateRow>()
  const repo = {
    read: vi.fn(async (hashes: string[]) => hashes.flatMap(h => (rows.has(h) ? [rows.get(h)!] : []))),
    append: vi.fn(async (rs: PublicTemplateRow[]) => { for (const r of rs) rows.set(r.templateHash, r) }),
  }
  return { rows, repo, store: createPublicTemplateStore(repo) }
}

function makeScaleOnlyFinalDb(publicationHash: string) {
  const finals = new Map<string, any>()
  const finalsBySub = new Map<string, any>()
  const parentState = { status: 'IN_PROGRESS', attemptEpoch: 1, publicationHash }
  const db: any = {
    $queryRaw: vi.fn(async (sql: any) => {
      const text = Array.isArray(sql?.strings) ? sql.strings.join('?') : String(sql?.sql ?? '')
      if (text.includes('FROM composite_assessment_attempts')) return [{ ...parentState }]
      if (text.includes('FROM composite_attempt_finals') && text.includes('submission_id =')) {
        const [attemptId, attemptEpoch, submissionId] = sql.values
        const row = finals.get(`${attemptId}:${attemptEpoch}`) ?? finalsBySub.get(submissionId)
        return row ? [row] : []
      }
      if (text.includes('FROM composite_attempt_finals')) {
        if (text.includes('WHERE attempt_id =')) {
          const [attemptId, attemptEpoch] = sql.values
          const row = finals.get(`${attemptId}:${attemptEpoch}`)
          return row ? [row] : []
        }
        return [...finals.values()]
      }
      if (text.includes('FROM composite_attempt_checkpoints')) return []
      return []
    }),
    $executeRaw: vi.fn(async (sql: any) => {
      const text = Array.isArray(sql?.strings) ? sql.strings.join('?') : String(sql?.sql ?? '')
      if (text.includes('INSERT INTO composite_attempt_finals')) {
        const [
          attemptId, attemptEpoch, compositeId, organizationId, courseId,
          pubHash, slotSetHash, contextHash, submissionId,
          payloadHash, aggregateHash, factsHash, factsCipher,
          rawHash, rawCipher, feedbackCipher, completedAt,
        ] = sql.values
        const row = {
          attemptId, attemptEpoch, compositeId, organizationId, courseId,
          publicationHash: pubHash, slotSetHash, contextHash, submissionId,
          payloadHash, aggregateHash, factsHash, factsCipher,
          rawHash, rawCipher, feedbackCipher, completedAt,
        }
        finals.set(`${attemptId}:${attemptEpoch}`, row)
        finalsBySub.set(submissionId, row)
        return 1
      }
      if (text.includes('UPDATE composite_assessment_attempts')) {
        parentState.status = 'COMPLETED'
        return 1
      }
      return 1
    }),
  }
  return { db, finals, parentState }
}

describe('Phase 2 WHOLE_V2 parity & performance regressions', () => {
  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
    resetWholeV2PlanCacheForTests()
  })
  afterEach(() => {
    resetWholeV2PlanCacheForTests()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('Item 1: validates & persists BROWSER_ACTIVE_SCALE_V1 trainingTimingFact and roundtrips into report projection', async () => {
    const fixture = buildFourFamilyTestSlots()
    const scaleSlot = fixture.slots.find(s => s.unitType === 'SCALE')!
    const plan = buildCompositePublicationPlan({
      compositeId: randomUUID(),
      title: '计时协议回归卷',
      slots: [scaleSlot],
    })
    const { store } = makeTemplateStore()
    const { db } = makeScaleOnlyFinalDb(plan.publicationHash)
    const policy = freezeTrainingTimingPolicy([{ id: 'course-1', courseType: 'TRAINING_COURSE', isLibrary: false }], false)
    const snapshot = freezeTrainingTimingSnapshot(policy, 'course-1', 1, false)!
    const scaleGold = fixture.scalePkg.goldenCases[0]
    const protocolTimings = Object.fromEntries(scaleGold.answers.map(a => [
      a.itemCode,
      {
        schemaVersion: 1 as const,
        firstResponseMs: 320,
        activeTimeMs: 480,
        changeCount: 0,
        revisitCount: 0,
        visits: 1,
        interrupted: false,
        recoveredWithoutClock: false,
      },
    ]))

    // 1. Rejects non-protocol timing shape when timing is enabled
    await expect(commitCompositeWholeFinal(db, {
      attempt: {
        id: randomUUID(),
        compositeAssessmentId: plan.compositeId,
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        trainingTimingSnapshot: snapshot,
        receiptOnly: false,
        startedAt: new Date(),
      },
      plan,
      templates: store,
      submit: {
        submissionId: `whole-${sha('bad-protocol')}`,
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        slotSetHash: plan.slotSetHash,
        units: {
          [scaleSlot.slotKey]: {
            unitType: 'SCALE',
            definitionHash: scaleSlot.definitionHash,
            answers: scaleGold.answers,
            timings: { [scaleGold.answers[0].itemCode]: { firstResponseMs: 320, responseTimeMs: 320 } },
          },
        },
      },
    })).rejects.toMatchObject({ statusCode: 400, code: 'SUBMISSION_PAYLOAD_CONFLICT' })

    // 2. Rejects timing payload when trainingTimingSnapshot is explicitly null
    await expect(commitCompositeWholeFinal(db, {
      attempt: {
        id: randomUUID(),
        compositeAssessmentId: plan.compositeId,
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        trainingTimingSnapshot: null,
        receiptOnly: false,
        startedAt: new Date(),
      },
      plan,
      templates: store,
      submit: {
        submissionId: `whole-${sha('disabled-timing')}`,
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        slotSetHash: plan.slotSetHash,
        units: {
          [scaleSlot.slotKey]: {
            unitType: 'SCALE',
            definitionHash: scaleSlot.definitionHash,
            answers: scaleGold.answers,
            timings: protocolTimings,
          },
        },
      },
    })).rejects.toMatchObject({ statusCode: 400, code: 'SUBMISSION_PAYLOAD_CONFLICT' })

    // 3. Accepts standard protocol timings, persists trainingTimingFact, and projects RECORDED in report
    const attemptId = randomUUID()
    const receipt = await commitCompositeWholeFinal(db, {
      attempt: {
        id: attemptId,
        compositeAssessmentId: plan.compositeId,
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        trainingTimingSnapshot: snapshot,
        receiptOnly: false,
        startedAt: new Date(),
      },
      plan,
      templates: store,
      submit: {
        submissionId: `whole-${sha('valid-protocol')}`,
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        slotSetHash: plan.slotSetHash,
        units: {
          [scaleSlot.slotKey]: {
            unitType: 'SCALE',
            definitionHash: scaleSlot.definitionHash,
            answers: scaleGold.answers,
            timings: protocolTimings,
          },
        },
      },
    })
    expect(receipt.feedbackAvailable).toBe(true)

    const rawMap = await readCompositeFinalRawBatch(db, [{ attemptId, attemptEpoch: 1 }])
    const scaleRaw = rawMap.get(`${attemptId}:1`)!.raw.units[scaleSlot.slotKey]
    expect(scaleRaw.unitType).toBe('SCALE')
    if (scaleRaw.unitType === 'SCALE') {
      expect(scaleRaw.trainingTimingFact?.status).toBe('RECORDED')
      expect(scaleRaw.trainingTimingFact?.snapshotHash).toBe(snapshot.snapshotHash)
      expect(scaleRaw.timings).toBeUndefined()
      const projected = projectTrainingTimingFact(snapshot, scaleRaw.trainingTimingFact)
      expect(projected.scope).toBe('TRAINING_COURSE')
      expect(projected.status).toBe('RECORDED')
    }

    const rawQuerySpy = vi.spyOn(prisma, '$queryRaw').mockImplementation(db.$queryRaw)
    try {
      const report: any = await withTrainingTimingReport(
        { unitReports: [{ type: 'SCALE', itemId: fixture.scaleItemId }] },
        {
          id: attemptId,
          attemptEpoch: 1,
          publicationHash: plan.publicationHash,
          trainingTimingSnapshot: snapshot,
          compositeAssessment: { productKind: 'QUESTIONNAIRE', timingExportEnabled: true, revision: 1 },
        },
        'teacher',
      )
      expect(report.unitReports[0].trainingTiming).toMatchObject({
        scope: 'TRAINING_COURSE',
        status: 'RECORDED',
        snapshotHash: snapshot.snapshotHash,
      })
    } finally {
      rawQuerySpy.mockRestore()
    }
  })

  it('Item 2: resolveVariantActiveSlotKeys restricts slots to frozen variant subset and rejects hash tampering', () => {
    const fixture = buildFourFamilyTestSlots()
    const plan = buildCompositePublicationPlan({
      compositeId: randomUUID(),
      title: '概率分卷测试',
      slots: fixture.slots,
    })
    const allocation = {
      selectedItemIds: [fixture.scaleItemId],
      selectedSectionIds: [fixture.formSectionId],
      allocationHash: sha('alloc-1'),
    }
    const encrypted = encryptUnifiedRuntimePayload(allocation)
    const active = resolveVariantActiveSlotKeys(
      { trainingVariantAllocationEncrypted: encrypted, trainingVariantAllocationHash: allocation.allocationHash },
      plan,
    )
    expect([...active!].sort()).toEqual([`form:${fixture.formSectionId}`, `scale:${fixture.scaleItemId}`].sort())

    expect(() => resolveVariantActiveSlotKeys(
      { trainingVariantAllocationEncrypted: encrypted, trainingVariantAllocationHash: sha('tampered') },
      plan,
    )).toThrowError(/概率分卷冻结分配校验失败/)
  })

  it('Item 4: aligns post-submit feedbackAvailable, educationWholeProgressFromRow, and recoverWholeQuestionnaireReceipt for WHOLE_V2', async () => {
    const fixture = buildFourFamilyTestSlots()
    const scaleSlot = fixture.slots.find(s => s.unitType === 'SCALE')!
    const plan = buildCompositePublicationPlan({
      compositeId: randomUUID(),
      title: '回执与报告一致性测试',
      slots: [scaleSlot],
    })
    const { store } = makeTemplateStore()
    const scaleGold = fixture.scalePkg.goldenCases[0]

    // With-report (receiptOnly=false) without buildFeedback MUST still return feedbackAvailable=true
    const withReport = makeScaleOnlyFinalDb(plan.publicationHash)
    const attemptWithReport = {
      id: randomUUID(),
      compositeAssessmentId: plan.compositeId,
      attemptEpoch: 1,
      publicationHash: plan.publicationHash,
      receiptOnly: false,
      startedAt: new Date(),
    }
    const subWithReport = {
      submissionId: `whole-${sha('with-report')}`,
      attemptEpoch: 1,
      publicationHash: plan.publicationHash,
      slotSetHash: plan.slotSetHash,
      units: {
        [scaleSlot.slotKey]: { unitType: 'SCALE' as const, definitionHash: scaleSlot.definitionHash, answers: scaleGold.answers },
      },
    }
    const r1 = await commitCompositeWholeFinal(withReport.db, { attempt: attemptWithReport, plan, templates: store, submit: subWithReport })
    expect(r1.receiptOnly).toBe(false)
    expect(r1.feedbackAvailable).toBe(true)
    const r1Replay = await commitCompositeWholeFinal(withReport.db, { attempt: attemptWithReport, plan, templates: store, submit: subWithReport })
    expect(r1Replay.replayed).toBe(true)
    expect(r1Replay.feedbackAvailable).toBe(true)

    // Receipt-only (receiptOnly=true) returns feedbackAvailable=false
    const receiptOnlyDb = makeScaleOnlyFinalDb(plan.publicationHash)
    const r2 = await commitCompositeWholeFinal(receiptOnlyDb.db, {
      attempt: { ...attemptWithReport, id: randomUUID(), receiptOnly: true },
      plan,
      templates: store,
      submit: { ...subWithReport, submissionId: `whole-${sha('receipt-only')}` },
    })
    expect(r2.receiptOnly).toBe(true)
    expect(r2.feedbackAvailable).toBe(false)

    // educationWholeProgressFromRow returns READY for V2 without a composite_report_jobs row
    const v2Progress = educationWholeProgressFromRow('att-v2', {
      epoch: 1,
      receiptOnly: false,
      parentStatus: 'COMPLETED',
      wholeSubmissionId: subWithReport.submissionId,
      jobStatus: null,
      v2FinalCommitted: true,
    }, 'COMPLETED')
    expect(v2Progress).toMatchObject({
      status: 'COMPLETED',
      wholeSubmissionReceived: true,
      runCompleted: true,
      reportStatus: { state: 'READY' },
    })

    // recoverWholeQuestionnaireReceipt returns retryAfterSeconds=0 when V2 state is READY
    const recoveredReport = await recoverWholeQuestionnaireReceipt('att-v2', subWithReport.submissionId, 1, { userId: 'u1' }, {
      id: 'att-v2',
      receiptOnly: false,
      userId: 'u1',
      recoveryTokenHash: null,
      epoch: 1,
      slotHash: plan.slotSetHash,
      jobSlot: plan.slotSetHash,
      wholeSubmissionId: subWithReport.submissionId,
      payloadHash: r1.payloadHash,
      acceptedAt: new Date(),
      state: 'READY',
    })
    expect(recoveredReport).toMatchObject({
      status: 'ACCEPTED',
      reportStatus: { state: 'READY', retryAfterSeconds: 0 },
    })

    const recoveredReceiptOnly = await recoverWholeQuestionnaireReceipt('att-v2-ro', subWithReport.submissionId, 1, { userId: 'u1' }, {
      id: 'att-v2-ro',
      receiptOnly: true,
      userId: 'u1',
      recoveryTokenHash: null,
      epoch: 1,
      slotHash: plan.slotSetHash,
      jobSlot: plan.slotSetHash,
      wholeSubmissionId: subWithReport.submissionId,
      payloadHash: r2.payloadHash,
      acceptedAt: new Date(),
      state: 'READY',
    })
    expect(recoveredReceiptOnly).toMatchObject({ status: 'ACCEPTED', receiptOnly: true })
    expect('reportStatus' in recoveredReceiptOnly).toBe(false)
  })

  it('Item 5: teacherNativeLeafContract verifies V2 publication plans directly without reading facts_cipher', async () => {
    const fixture = buildFourFamilyTestSlots()
    const sjtSlot = fixture.slots.find(s => s.unitType === 'SITUATIONAL')!
    const plan = buildCompositePublicationPlan({
      compositeId: 'runtime-comp',
      title: '教师原生群体报告',
      slots: [sjtSlot],
    })
    const parent = testDisclosure(10)
    parent.policyKey = 'EDUCATION_SELF_GROUP_V2'
    parent.audiences.ORGANIZATION = { mode: 'AGGREGATE_ONLY', metricKeys: ['sjt'], longitudinalMetricKeys: [] }
    const sjtDisc = testDisclosure(10)
    sjtDisc.policyKey = parent.policyKey
    sjtDisc.audiences.ORGANIZATION = { mode: 'AGGREGATE_ONLY', metricKeys: ['sjt'], longitudinalMetricKeys: [] }
    const key = 'education-assessment:TEACHER:org-1:res-1'
    const entry = {
      releaseStatus: 'PUBLISHED',
      initiationModes: ['ORG_ASSIGN'],
      applicability: {
        schemaVersion: 1, resourceKind: 'BUNDLE', resourceKey: key, resourceVersion: '2.0.0',
        subjectRoles: ['TEACHER'], respondentRoles: ['TEACHER'], relationshipKinds: ['SELF'], perspectives: ['SELF_REPORT'],
        analysisMode: 'COHORT_AGGREGATE', visibilityPolicyKey: parent.policyKey, minimumRespondents: 10,
      },
      resultDisclosure: parent,
      cohortAnalysisPolicy: buildSelfGroupCohortAnalysisPolicy(parent),
      scienceMaturity: 'PILOT',
      launchTarget: { runtime: 'COMPOSITE', compositeAssessmentId: 'runtime-comp' },
    } as any
    const policy = relationalEntryToRunPolicy(entry)
    const track = { key, version: '2.0.0', family: 'BUNDLE', policy, hash: canonicalHash(policy) }
    vi.spyOn(assessmentResourceRepo, 'readEducationAssessmentDeliveryIdentity').mockResolvedValue({
      entry,
      origin: {
        product: 'TEACHER', organizationId: 'org-1', family: 'BUNDLE', runtimeCompositeId: 'runtime-comp',
        units: [{ itemId: fixture.sjtItemId, family: 'SJT', measurement: { releaseId: 'r-sjt' }, groupDisclosure: sjtDisc }],
      },
      runtime: { items: [{ id: fixture.sjtItemId, situationalInstrumentKey: sjtSlot.instrumentKey, situationalInstrumentVersion: sjtSlot.instrumentVersion }] },
      releases: new Map([['r-sjt', { layer: 'MEASUREMENT', content: {} }]]),
    } as any)

    const storedTemplates = new Map<string, PublicTemplateRow>()
    const db: any = {
      $queryRaw: vi.fn(async (sql: any) => {
        const text = sqlTextOf(sql)
        expect(text).not.toContain('facts_cipher')
        if (text.includes('assessment_unit_snapshots')) return []
        if (text.includes('SELECT DISTINCT p.publication_hash')) return [{ publicationHash: plan.publicationHash }]
        if (text.includes('assessment_public_templates')) {
          return [...storedTemplates.values()]
        }
        return []
      }),
      $executeRaw: vi.fn(async () => 1),
    }
    const { store, rows } = makeTemplateStore()
    await saveCompositePublicationPlan(plan, store)
    for (const [k, v] of rows.entries()) storedTemplates.set(k, v)

    const source = { organizationId: 'org-1', runId: 'run-1', trackId: 'track-1' }
    const leaf = {
      slotKey: sjtSlot.slotKey,
      unitType: 'SITUATIONAL' as const,
      instrumentKey: sjtSlot.instrumentKey,
      instrumentVersion: sjtSlot.instrumentVersion,
      compiledRuntimeHash: sjtSlot.compiledRuntime.compiledRuntimeHash,
    }
    expect(await teacherNativeLeafContract(source, track, leaf, db)).toEqual(sjtDisc)
    await expect(teacherNativeLeafContract(source, track, { ...leaf, compiledRuntimeHash: '0'.repeat(64) }, db))
      .rejects.toMatchObject({ statusCode: 404 })
  })

  it('Items 6 & 7: materializeCompositePublicationPlan checks cache before DB load and re-verifies live Scale deployment on cache hit', async () => {
    const source = getScaleInstrumentSource('adexi_v1', '2.0.0')!
    const compositeId = randomUUID()
    const scaleId = randomUUID()
    const publishedAt = new Date('2026-11-24T00:00:00.000Z')
    const updatedAt = new Date('2026-11-24T00:00:00.000Z')
    const fakeComposite = {
      id: compositeId,
      name: '缓存部署检查卷',
      description: null,
      updatedAt,
      publishedAt,
      trainingFlowFrozen: null,
      trainingFlowDraft: null,
      formSections: [],
      items: [{
        id: 'item-1',
        type: 'SCALE',
        position: 0,
        required: true,
        scaleId,
        cognitiveAssignmentId: null,
        situationalInstrumentKey: null,
        situationalInstrumentVersion: null,
        cognitiveAssignment: null,
        scale: {
          id: scaleId,
          code: 'adexi_v1',
          name: 'ADEXI',
          status: 'PUBLISHED',
          instrumentVersion: '2.0.0',
          instrumentClass: 'STANDARD',
          standardSourceKind: null,
          standardToolKey: null,
          libraryEntryId: null,
          measurementReleaseId: null,
          definition: source.executable!.definition,
          definitionHash: null,
          instruction: null,
        },
      }],
    }
    const templates = new Map<string, PublicTemplateRow>()
    const db: any = {
      compositeAssessment: { findUnique: vi.fn(async () => fakeComposite) },
      assessmentReferenceSet: { findMany: vi.fn(async () => []) },
      $queryRaw: vi.fn(async (sql: any, ...rest: any[]) => {
        const text = sqlTextOf(sql)
        if (text.includes('INSERT INTO assessment_public_templates')) {
          const flatten = (item: any): any[] => (
            item && typeof item === 'object' && Array.isArray(item.values)
              ? item.values.flatMap(flatten)
              : [item]
          )
          const vals: any[] = Array.isArray(sql) ? rest.flatMap(flatten) : flatten(sql)
          const inserted: Array<{ template_hash: string }> = []
          for (let i = 0; i + 3 < vals.length; i += 4) {
            const row: PublicTemplateRow = {
              templateHash: vals[i],
              templateKind: vals[i + 1],
              plaintextBytes: vals[i + 2],
              payloadEncrypted: vals[i + 3],
            }
            templates.set(row.templateHash, row)
            inserted.push({ template_hash: row.templateHash })
          }
          return inserted
        }
        if (text.includes('assessment_public_templates')) {
          return [...templates.values()]
        }
        return []
      }),
      $executeRaw: vi.fn(async () => 1),
    }
    setPreloadedActiveScaleDeployments(db, new Map([[scaleId, null]]))
    let allowStarts = true
    const resolveSpy = vi.spyOn(scaleDeploymentService, 'resolveScaleStartDeployment').mockImplementation(async () => {
      if (!allowStarts) {
        return { kind: 'DENY', allowNewStarts: false, reasons: ['DEPLOYMENT_SUSPENDED'], runtimePolicy: null, deployment: null, decision: null }
      }
      return { kind: 'LEGACY_V1', allowNewStarts: true, reasons: ['LEGACY_DEPLOYMENT_NOT_MIGRATED'], runtimePolicy: null, deployment: null, decision: null }
    })

    try {
      const header = { id: compositeId, publishedAt, updatedAt }
      const first = await withCommittedStartTemplates(
        work => work(db),
        tx => materializeCompositePublicationPlan(compositeId, tx, header),
      )
      expect(db.compositeAssessment.findUnique).toHaveBeenCalledTimes(1)
      expect(first.slots[0].unitType).toBe('SCALE')

      // Second call with knownHeader MUST hit cache BEFORE compositeAssessment.findUnique, yet STILL check resolveScaleStartDeployment!
      const second = await materializeCompositePublicationPlan(compositeId, db, header)
      expect(second.publicationHash).toBe(first.publicationHash)
      expect(db.compositeAssessment.findUnique).toHaveBeenCalledTimes(1)
      expect(resolveSpy).toHaveBeenCalledTimes(2)

      // Third call after deployment suspended MUST reject 409 even on cache hit!
      allowStarts = false
      await expect(materializeCompositePublicationPlan(compositeId, db, header))
        .rejects.toMatchObject({ statusCode: 409, code: 'INSTRUMENT_NOT_AVAILABLE' })
      expect(db.compositeAssessment.findUnique).toHaveBeenCalledTimes(1)
    } finally {
      clearPreloadedActiveScaleDeployments(db)
    }
  })

  it('Item 9: preloadCompositeReportFacts batch-loads V2 finals and plans in 1 pass and exposes v2Final on reader', async () => {
    const fixture = buildFourFamilyTestSlots()
    const scaleSlot = fixture.slots.find(s => s.unitType === 'SCALE')!
    const plan = buildCompositePublicationPlan({
      compositeId: randomUUID(),
      title: '批量报告读取测试',
      slots: [scaleSlot],
    })
    const storedTemplates = new Map<string, PublicTemplateRow>()
    const { store, rows } = makeTemplateStore()
    await saveCompositePublicationPlan(plan, store)

    const finalsList: any[] = []
    const scaleGold = fixture.scalePkg.goldenCases[0]
    for (const attemptId of [randomUUID(), randomUUID()]) {
      const { db: writeDb, finals } = makeScaleOnlyFinalDb(plan.publicationHash)
      await commitCompositeWholeFinal(writeDb, {
        attempt: {
          id: attemptId,
          compositeAssessmentId: plan.compositeId,
          attemptEpoch: 1,
          publicationHash: plan.publicationHash,
          receiptOnly: false,
          startedAt: new Date(),
        },
        plan,
        templates: store,
        submit: {
          submissionId: `whole-${sha(attemptId)}`,
          attemptEpoch: 1,
          publicationHash: plan.publicationHash,
          slotSetHash: plan.slotSetHash,
          units: {
            [scaleSlot.slotKey]: { unitType: 'SCALE', definitionHash: scaleSlot.definitionHash, answers: scaleGold.answers },
          },
        },
      })
      finalsList.push([...finals.values()][0])
    }
    for (const [k, v] of rows.entries()) storedTemplates.set(k, v)

    let finalsQueries = 0
    const batchDb: any = {
      $queryRaw: vi.fn(async (sql: any) => {
        const text = sqlTextOf(sql)
        if (text.includes('FROM composite_attempt_finals')) {
          finalsQueries += 1
          return finalsList
        }
        if (text.includes('assessment_public_templates')) {
          return [...storedTemplates.values()]
        }
        return []
      }),
      assessmentUnitSnapshot: { findMany: vi.fn(async () => []) },
      assessmentResultFact: { findMany: vi.fn(async () => []) },
    }

    const attempts = finalsList.map(row => ({
      id: row.attemptId,
      attemptEpoch: 1,
      publicationHash: plan.publicationHash,
      frozenActiveSlotSetHash: plan.slotSetHash,
      contextSnapshotHash: null,
      trainingVariantAllocationHash: null,
      trainingVariantAllocationEncrypted: null,
      trainingFlowSnapshotEncrypted: null,
      trainingFlowSnapshotHash: null,
      trainingFlowPathEncrypted: null,
      trainingFlowPathHash: null,
      scaleAssessments: [],
      compositeAssessment: {
        id: plan.compositeId,
        trainingVariantDraft: null,
        trainingVariantFrozen: null,
        trainingVariantDigest: null,
        trainingFlowDraft: null,
        trainingFlowFrozen: null,
        trainingFlowDigest: null,
        items: [{ id: fixture.scaleItemId, type: 'SCALE', position: 0, required: true, scaleId: scaleSlot.scaleId }],
        formSections: [],
      },
    }))

    const reader = await preloadCompositeReportFacts(attempts, batchDb)
    expect(finalsQueries).toBe(1)
    for (const attempt of attempts) {
      const facts = reader(attempt)
      expect(facts.v2Final).toBeDefined()
      expect(facts.v2Final!.loaded.meta.attemptId).toBe(attempt.id)
      expect(facts.v2Final!.plan.publicationHash).toBe(plan.publicationHash)
      expect(facts.v2Final!.snapshots).toHaveLength(1)
    }
  })
})
