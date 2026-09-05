/**
 * Disposable Gate-D fixture seeder for eduk12-gate47 isolated DB.
 * Writes fixtures + ledger under /tmp only. Does not touch ptool-*.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Prisma, PrismaClient } from '@prisma/client'
import { hashScaleDefinition, type ScaleDefinitionV2 } from '../src/modules/scale/scale-definition'
import {
  createUnifiedCognitiveSessionConfigSnapshot,
  readCognitiveSessionConfig,
} from '../src/modules/cognitive/session.service'
import { canonicalJsonBytes } from '../src/modules/assessment-runtime/canonical'
import { createTrialEnvelope } from '../src/modules/cognitive/v2/trial-envelope'
import {
  ensureQuestionnaireFormSections,
  listQuestionnaireFormSections,
} from '../src/services/questionnaire-form-section.service'
import {
  encryptFrozenScaleRuntimeSnapshot,
  freezeScaleRuntimeAtAttemptStart,
} from '../src/modules/assessment-runtime/runtime-snapshot'
import {
  createFrozenUnitAdmission,
  frozenAdmissionPersistence,
} from '../src/modules/assessment-runtime/admission-snapshot'
import {
  freezeQuestionnaireActiveSlotSet,
  formSectionIdentityHash,
} from '../src/modules/assessment-runtime/attempt-runtime'
import { encryptFrozenActiveSlotSet, questionnaireScaleSlotKey } from '../src/modules/assessment-runtime/slot-set'

const OUT_DIR = process.env.FIXTURE_OUT_DIR || '/tmp/eduk12-gate47-fixtures'
const SCALE_N = Number(process.env.SCALE_FIXTURE_COUNT || 1200)
const FORM_N = Number(process.env.FORM_FIXTURE_COUNT || 300)
const COG_N = Number(process.env.COG_FIXTURE_COUNT || 200)
/** sameParent sibling slots on one parent (Gate-E supports 2 / 10 / 50). Default 50 for PEAK=50. */
const SAME_PARENT_SIBLINGS = (() => {
  const n = Number(process.env.SAME_PARENT_SIBLINGS || 50)
  if (![2, 10, 50].includes(n)) {
    throw new Error(`SAME_PARENT_SIBLINGS must be 2, 10, or 50 (got ${process.env.SAME_PARENT_SIBLINGS})`)
  }
  return n
})()
// v3.0 §34-36: real business scale sizes, not 3-item fake.
// Small=5 (WHO-5), Typical=25 (SDQ), Large=21 (TEXI) / 20 (ADEXI).
const SCALE_ITEM_COUNT = Number(process.env.SCALE_ITEM_COUNT || 3)
const JWT_SECRET = process.env.JWT_SECRET!
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'gate47admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Gate47AdminPass!'
const STUDENT_USERNAME = process.env.PERF_STUDENT_USERNAME || 'gate47student'
const STUDENT_PASSWORD = process.env.PERF_STUDENT_PASSWORD || 'Gate47StudentPass!'

const prisma = new PrismaClient()

const scaleDefinitionFor = (size: number, prefix: string): ScaleDefinitionV2 => {
  const itemCodes = Array.from({ length: size }, (_, index) => `${prefix}-${index + 1}`)
  return {
    schemaVersion: 2,
    respondentType: 'participant_self_report',
    source: { title: 'Gate47 perf scale', citation: 'eduk12-gate47-seed-fixtures' },
    license: { status: 'self_authored', redistribution: 'allowed' },
    display: { randomizeItems: false },
    responseSets: [{
      key: 'default',
      options: [
        { value: 'no', label: '否', score: 0 },
        { value: 'yes', label: '是', score: 1 },
      ],
    }],
    items: itemCodes.map((itemCode, sortOrder) => ({
      itemCode,
      content: `Perf item ${sortOrder + 1}`,
      type: 'single',
      required: true,
      sortOrder,
      responseSetKey: 'default',
      randomizeOptions: false,
    })),
    scoring: {
      scoringVersion: '2.0.0',
      itemRules: itemCodes.map((itemCode) => ({ itemCode, transform: { type: 'identity' as const } })),
      defaultMissingPolicy: { type: 'complete_required' },
      scores: [{
        key: 'total',
        type: 'total',
        label: '总分',
        direction: 'descriptive',
        canonical: true,
        displayPrecision: 2,
        source: { type: 'items', items: itemCodes.map((itemCode) => ({ itemCode, weight: 1 })), aggregation: 'sum' },
      }],
    },
    report: {
      reportVersion: '2.0.0',
      primaryScoreKeys: ['total'],
      scoreOrder: ['total'],
      interpretations: [{
        scoreKey: 'total',
        headline: '总分',
        source: { type: 'score_only' },
        summary: 'Gate47 disposable fixture.',
        bands: [],
        guidance: [],
      }],
      limitations: [],
      disclaimer: 'Perf fixture only.',
    },
    referencePolicy: { type: 'none' },
  }
}

async function upsertUser(username: string, password: string, role: 'ADMIN' | 'STUDENT') {
  const passwordHash = await bcrypt.hash(password, 10)
  return prisma.user.upsert({
    where: { username },
    create: {
      username,
      passwordHash,
      role,
      nickname: username,
      isActive: true,
      mustChangePassword: false,
      teacherApproved: true,
    },
    update: {
      passwordHash,
      role,
      isActive: true,
      mustChangePassword: false,
      isFrozen: false,
      tokenVersion: 0,
    },
  })
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const admin = await upsertUser(ADMIN_USERNAME, ADMIN_PASSWORD, 'ADMIN')
  const student = await upsertUser(STUDENT_USERNAME, STUDENT_PASSWORD, 'STUDENT')

  // Minimal cognitive seed (fake config) if missing
  const fake = await prisma.cognitiveTestConfig.upsert({
    where: { testType_configVersion: { testType: 'fake', configVersion: '1.0.0' } },
    create: {
      testType: 'fake',
      configVersion: '1.0.0',
      name: 'Fake Cognitive Test v1.0.0',
      status: 'PUBLISHED',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      accessPolicy: 'OPEN',
      publishedAt: new Date(),
      config: { trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 } as Prisma.InputJsonValue,
    },
    update: { status: 'PUBLISHED' },
  })

  const csrf = randomBytes(32).toString('base64url')
  const token = jwt.sign(
    {
      userId: student.id,
      username: student.username,
      role: student.role,
      tokenVersion: student.tokenVersion,
      mustChangePassword: false,
    },
    JWT_SECRET,
    { expiresIn: '7d' },
  )

  const runId = randomUUID().slice(0, 8)
  const definition = scaleDefinitionFor(SCALE_ITEM_COUNT, `G47-SCALE-${runId}`)
  const definitionHash = hashScaleDefinition(definition)

  // One shared published scale for all scale assessments
  const answers = definition.items.map((item) => ({ itemCode: item.itemCode, responseValue: 'yes' as const }))
  const scaleRequests: any[] = []
  const ledger: any = {
    runId,
    createdAt: new Date().toISOString(),
    seedMode: 'e2-parent-bound-unified-scale',
    expectUnitSnapshotsOnScaleSubmit: true,
    users: { adminId: admin.id, studentId: student.id, studentUsername: STUDENT_USERNAME },
    scaleIds: [] as string[],
    cognitiveConfigId: fake.id,
    scaleAssessmentIds: [] as string[],
    questionnaireIds: [] as string[],
    questionnaireAssessmentIds: [] as string[],
    formSectionIds: [] as string[],
    cognitiveSessionIds: [] as string[],
  }

  console.log(`Creating ${SCALE_N} parent-bound UNIFIED_V1 scale fixtures (UnitSnapshot on fresh write)...`)
  // One shared published scale + frozen runtime; each logical student gets a fresh
  // questionnaire parent + child assessment (unique attempt / submissionId).
  const sharedScale = await prisma.scale.create({
    data: {
      code: `G47-SCALE-${runId}-SHARED`,
      name: `Gate47 perf scale ${runId} shared`,
      creatorId: admin.id,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      instrumentClass: 'CUSTOM_DESCRIPTIVE',
      instrumentVersion: '2.0.0',
      definition: definition as unknown as Prisma.InputJsonValue,
      definitionHash,
      itemCount: SCALE_ITEM_COUNT,
      dimensionCount: 1,
    },
  })
  ledger.scaleIds.push(sharedScale.id)
  const runtimeSnapshot = await freezeScaleRuntimeAtAttemptStart(prisma as any, {
    instrumentKey: sharedScale.code,
    instrumentVersion: sharedScale.instrumentVersion,
    definition,
  })
  const runtimeEncrypted = encryptFrozenScaleRuntimeSnapshot(runtimeSnapshot)
  const sourceDefinitionHash = runtimeSnapshot.sourceDefinitionHash
  const compiledRuntimeHash = runtimeSnapshot.compiledRuntime.compiledRuntimeHash
  const scaleIdentity = {
    id: sharedScale.id,
    code: sharedScale.code,
    name: sharedScale.name,
    instrumentVersion: sharedScale.instrumentVersion,
  }

  for (let i = 0; i < SCALE_N; i += 1) {
    const suffix = `${runId}-${String(i + 1).padStart(6, '0')}`
    const questionnaire = await prisma.questionnaire.create({
      data: {
        code: `G47-Q-SCALE-${suffix}`,
        name: `Gate47 scale parent ${suffix}`,
        creatorId: admin.id,
        type: 'COURSE',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      },
    })
    ledger.questionnaireIds.push(questionnaire.id)
    const binding = await prisma.questionnaireScale.create({
      data: {
        questionnaireId: questionnaire.id,
        scaleId: sharedScale.id,
        position: 0,
      },
    })
    const slotKey = questionnaireScaleSlotKey(binding.id)
    const slotSet = freezeQuestionnaireActiveSlotSet({
      attemptEpoch: 1,
      scales: [{
        questionnaireScaleId: binding.id,
        code: sharedScale.code,
        instrumentVersion: sharedScale.instrumentVersion,
        sourceDefinitionHash,
        compiledRuntimeHash,
      }],
      formSections: [],
    })
    const parent = await prisma.questionnaireAssessment.create({
      data: {
        questionnaireId: questionnaire.id,
        userId: student.id,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        progress: 0,
        frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slotSet),
        frozenActiveSlotSetHash: slotSet.snapshotHash,
      },
    })
    ledger.questionnaireAssessmentIds.push(parent.id)
    const admission = createFrozenUnitAdmission({
      attemptEpoch: 1,
      scale: scaleIdentity,
      principal: { userId: student.id },
      parent: {
        kind: 'questionnaire',
        parentId: parent.id,
        slotKey,
        sourceDefinitionHash,
        compiledRuntimeHash,
      },
      requiresContext: false,
    })
    const assessment = await prisma.assessment.create({
      data: {
        scaleId: sharedScale.id,
        userId: student.id,
        questionnaireAssessmentId: parent.id,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        runtimeSnapshotEncrypted: runtimeEncrypted,
        compiledRuntimeHash,
        ...frozenAdmissionPersistence(admission),
        attemptEpoch: 1,
        progress: 0,
      },
    })
    ledger.scaleAssessmentIds.push(assessment.id)
    const submissionId = `g47-scale-${suffix}`
    scaleRequests.push({
      fixtureId: `perf-scale-${String(i + 1).padStart(6, '0')}`,
      instrument: 'scale',
      parentKey: `perf-parent-scale-${String(i + 1).padStart(6, '0')}`,
      method: 'POST',
      path: `/api/scales/assessments/${assessment.id}/submit`,
      body: {
        submissionId,
        attemptEpoch: 1,
        definitionHash,
        contextSnapshotHash: null,
        answers,
      },
    })
    if ((i + 1) % 200 === 0) console.log(`  scale ${i + 1}/${SCALE_N}`)
  }

  console.log(`Creating ${FORM_N} Unified questionnaire form-section fixtures...`)
  const formClasses = [
    { key: 'formNormal', itemCount: Number(process.env.FORM_NORMAL_ITEM_COUNT || 8), requests: [] as any[] },
    { key: 'formLarge', itemCount: Number(process.env.FORM_LARGE_ITEM_COUNT || 25), requests: [] as any[] },
  ]
  for (const formClass of formClasses) {
    if (!Number.isInteger(formClass.itemCount) || formClass.itemCount < 1 || formClass.itemCount > 200) {
      throw new Error(`${formClass.key} item count must be an integer from 1 to 200`)
    }
    for (let i = 0; i < FORM_N; i += 1) {
      const suffix = `${runId}-${formClass.key}-${String(i + 1).padStart(5, '0')}`
      const questionnaire = await prisma.questionnaire.create({
        data: {
          code: `G47-Q-${suffix}`,
          name: `Gate47 ${formClass.key} questionnaire ${suffix}`,
          creatorId: admin.id,
          type: 'COURSE',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
        },
      })
      ledger.questionnaireIds.push(questionnaire.id)
      const section = await prisma.questionnaireFormSection.create({
        data: {
          questionnaireId: questionnaire.id,
          title: '区段 1',
          position: 0,
          contextSection: false,
        },
      })
      for (let itemIndex = 0; itemIndex < formClass.itemCount; itemIndex += 1) {
        await prisma.questionnaireFormItem.create({
          data: {
            questionnaireId: questionnaire.id,
            sectionId: section.id,
            sectionPosition: itemIndex,
            type: 'text_input',
            label: `${formClass.key} 字段 ${itemIndex + 1}`,
            required: true,
            position: itemIndex,
          },
        })
      }
      await ensureQuestionnaireFormSections(questionnaire.id)
      const sections = await listQuestionnaireFormSections(questionnaire.id)
      const mapped = sections[0]
      if (!mapped) throw new Error('missing form section after ensure')
      const formDefinitionHash = formSectionIdentityHash(mapped)
      const formSlotSet = freezeQuestionnaireActiveSlotSet({
        attemptEpoch: 1,
        scales: [],
        formSections: [{ sectionId: mapped.id, definitionHash: formDefinitionHash }],
      })
      const assessment = await prisma.questionnaireAssessment.create({
        data: {
          questionnaireId: questionnaire.id,
          userId: student.id,
          status: 'IN_PROGRESS',
          deliveryMode: 'FINAL_ONLY',
          runtimeGeneration: 'UNIFIED_V1',
          attemptEpoch: 1,
          progress: 0,
          frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(formSlotSet),
          frozenActiveSlotSetHash: formSlotSet.snapshotHash,
        },
      })
      ledger.questionnaireAssessmentIds.push(assessment.id)
      ledger.formSectionIds.push(mapped.id)
      const formAnswers = mapped.items.map((it) => ({ formItemId: it.id, value: `answer-${it.id}` }))
      const submissionId = `g47-form-${runId}-${formClass.key}-${String(i + 1).padStart(6, '0')}`
      const body = {
        submissionId,
        attemptEpoch: 1,
        definitionHash: formDefinitionHash,
        contextSnapshotHash: null,
        answers: formAnswers,
      }
      const request = {
        fixtureId: `perf-${formClass.key}-${String(i + 1).padStart(6, '0')}`,
        fixtureClass: formClass.key,
        logicalAttempt: `${assessment.id}:1:${submissionId}`,
        instrument: 'form',
        parentKey: `perf-parent-${formClass.key}-${String(i + 1).padStart(6, '0')}`,
        parentId: assessment.id,
        sectionId: mapped.id,
        runtimeGeneration: 'UNIFIED_V1',
        method: 'POST',
        path: `/api/questionnaires/assessments/${assessment.id}/form-sections/${mapped.id}/submit`,
        body,
        itemCount: mapped.items.length,
        bodyBytes: Buffer.byteLength(JSON.stringify(body)),
      }
      formClass.requests.push(request)
      if ((i + 1) % 50 === 0) console.log(`  ${formClass.key} ${i + 1}/${FORM_N}`)
    }
  }
  const formNormalRequests = formClasses[0].requests
  const formLargeRequests = formClasses[1].requests
  const formRequests = [...formNormalRequests, ...formLargeRequests]

  console.log(`Creating ${COG_N} Unified Cognitive sessions...`)
  const cognitiveRequests: any[] = []
  const trialCount = Number(process.env.COG_TRIAL_COUNT || 3)
  if (!Number.isInteger(trialCount) || trialCount < 1 || trialCount > 1000) {
    throw new Error(`COG_TRIAL_COUNT must be an integer from 1 to 1000 (got ${process.env.COG_TRIAL_COUNT})`)
  }
  const resolvedConfig = {
    trialCount,
    trialDurationMs: 1000,
    allowPractice: false,
    maxRtMs: 60000,
  }
  const unifiedCognitiveSnapshot = await createUnifiedCognitiveSessionConfigSnapshot({
    testType: fake.testType,
    configVersion: fake.configVersion,
    engineVersion: fake.engineVersion,
    scoringVersion: fake.scoringVersion,
    config: resolvedConfig,
  })
  const configSnapshotEncrypted = unifiedCognitiveSnapshot.encrypted
  const snapshot = readCognitiveSessionConfig(configSnapshotEncrypted).snapshot
  if (!snapshot || snapshot.runtimeGeneration !== 'UNIFIED_V1') {
    throw new Error('cognitive fixture did not create a Unified Runtime snapshot')
  }
  const frozenCognitiveAdmission = createFrozenUnitAdmission({
    attemptEpoch: 1,
    cognitive: {
      testType: fake.testType,
      engineVersion: fake.engineVersion,
      scoringVersion: fake.scoringVersion,
      configHash: snapshot.configHash,
    },
    principal: { userId: student.id },
    parent: null,
    requiresContext: false,
  })
  for (let i = 0; i < COG_N; i += 1) {
    const session = await prisma.cognitiveSession.create({
      data: {
        userId: student.id,
        participantKey: `g47-cog-${runId}-${i}`,
        configId: fake.id,
        testType: fake.testType,
        attemptNo: 1,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        configVersion: fake.configVersion,
        configSnapshotEncrypted,
        engineVersion: fake.engineVersion,
        scoringVersion: fake.scoringVersion,
        randomSeed: `g47-seed-${runId}-${i}`,
        runtimeGeneration: 'UNIFIED_V1',
        compiledRuntimeHash: unifiedCognitiveSnapshot.compiledRuntime.compiledRuntimeHash,
        ...frozenAdmissionPersistence(frozenCognitiveAdmission),
      },
    })
    ledger.cognitiveSessionIds.push(session.id)
    const trials = Array.from({ length: trialCount }, (_, trialIndex) => createTrialEnvelope({
      trialIndex,
      phase: 'test',
      payload: { correct: trialIndex % 2 === 0, rtMs: 400 + trialIndex },
      startedAtPerfMs: trialIndex * 1000,
      endedAtPerfMs: trialIndex * 1000 + 400,
    }))
    const submissionId = `g47-cog-${runId}-${String(i + 1).padStart(6, '0')}`
    const body = {
      submissionId,
      attemptEpoch: 1,
      definitionHash: snapshot.configHash,
      contextSnapshotHash: null,
      trials,
    }
    cognitiveRequests.push({
      fixtureId: `perf-cognitive-${String(i + 1).padStart(6, '0')}`,
      instrument: 'cognitive',
      parentKey: `perf-parent-cognitive-${String(i + 1).padStart(6, '0')}`,
      sessionId: session.id,
      submissionId,
      runtimeGeneration: 'UNIFIED_V1',
      compiledRuntimeHash: unifiedCognitiveSnapshot.compiledRuntime.compiledRuntimeHash,
      trialCount,
      bodyBytes: Buffer.byteLength(JSON.stringify(body)),
      canonicalPayloadBytes: canonicalJsonBytes({ trials }).byteLength,
      method: 'POST',
      path: `/api/cognitive/sessions/${session.id}/submit`,
      body,
    })
    if (Buffer.byteLength(JSON.stringify(body)) >= 1_500_000) {
      throw new Error('cognitive fixture unexpectedly reaches the HTTP size limit')
    }
    if ((i + 1) % 50 === 0) console.log(`  cognitive ${i + 1}/${COG_N}`)
  }

  // sameParent: ONE questionnaire assessment (shared parentId) with N form-section
  // siblings (distinct child/slot/submissionId). N = SAME_PARENT_SIBLINGS (2|10|50).
  // E4 VUs must index distinct siblings — never all hammer fixture 0.
  const sameParentRequests: any[] = []
  {
    const suffix = `${runId}-same`
    console.log(`Creating sameParent contention fixtures (siblings=${SAME_PARENT_SIBLINGS})...`)
    const questionnaire = await prisma.questionnaire.create({
      data: {
        code: `G47-Q-SAME-${suffix}`,
        name: `Gate47 same-parent ${suffix}`,
        creatorId: admin.id,
        type: 'COURSE',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      },
    })
    ledger.questionnaireIds.push(questionnaire.id)
    for (let s = 0; s < SAME_PARENT_SIBLINGS; s += 1) {
      const section = await prisma.questionnaireFormSection.create({
        data: {
          questionnaireId: questionnaire.id,
          title: `区段 ${s + 1}`,
          position: s,
          contextSection: false,
        },
      })
      await prisma.questionnaireFormItem.create({
        data: {
          questionnaireId: questionnaire.id,
          sectionId: section.id,
          sectionPosition: 0,
          type: 'text_input',
          label: `字段 ${s + 1}`,
          required: true,
          position: s,
        },
      })
    }
    const assessment = await prisma.questionnaireAssessment.create({
      data: {
        questionnaireId: questionnaire.id,
        userId: student.id,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        attemptEpoch: 1,
        progress: 0,
      },
    })
    ledger.questionnaireAssessmentIds.push(assessment.id)
    await ensureQuestionnaireFormSections(questionnaire.id)
    const sections = await listQuestionnaireFormSections(questionnaire.id)
    for (const [idx, mapped] of sections.entries()) {
      sameParentRequests.push({
        fixtureId: `perf-same-parent-child-${String(idx + 1).padStart(4, '0')}`,
        instrument: 'form',
        parentKey: 'perf-parent-contention-0001',
        parentId: assessment.id,
        slotIndex: idx,
        method: 'POST',
        path: `/api/questionnaires/assessments/${assessment.id}/form-sections/${mapped.id}/submit`,
        body: {
          submissionId: `g47-same-${runId}-${String(idx + 1).padStart(4, '0')}`,
          attemptEpoch: 1,
          definitionHash: mapped.definitionHash,
          contextSnapshotHash: null,
          answers: mapped.items.map((it) => ({ formItemId: it.id, value: `same-${it.id}` })),
        },
      })
    }
  }

  const mixed = [
    ...scaleRequests.slice(0, Math.min(400, scaleRequests.length)),
    ...formRequests.slice(0, Math.min(150, formRequests.length)),
    ...cognitiveRequests.slice(0, Math.min(100, cognitiveRequests.length)),
  ]

  const fixtures = {
    scale: scaleRequests,
    formSection: formRequests,
    formNormal: formNormalRequests,
    formLarge: formLargeRequests,
    cognitive: cognitiveRequests,
    sameParent: sameParentRequests,
    mixed,
  }

  const fixturesPath = `${OUT_DIR}/final-submit-fixtures.json`
  writeFileSync(fixturesPath, JSON.stringify(fixtures))
  writeFileSync(`${OUT_DIR}/ledger.json`, JSON.stringify(ledger, null, 2))
  writeFileSync(`${OUT_DIR}/auth.env`, [
    `PERF_AUTH_TOKEN=${token}`,
    `PERF_CSRF_TOKEN=${csrf}`,
    `PERF_STUDENT_USERNAME=${STUDENT_USERNAME}`,
    `PERF_STUDENT_PASSWORD=${STUDENT_PASSWORD}`,
    `PERF_STUDENT_ID=${student.id}`,
    '',
  ].join('\n'), { mode: 0o600 })

  console.log(JSON.stringify({
    fixturesPath,
    counts: {
      scale: scaleRequests.length,
      formSection: formRequests.length,
      formNormal: formNormalRequests.length,
      formLarge: formLargeRequests.length,
      cognitive: cognitiveRequests.length,
      sameParent: sameParentRequests.length,
      mixed: mixed.length,
    },
    studentId: student.id,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
