import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { prisma as db } from '../../config/database'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { batchEnsureScaleAdmissionsAtDelivery } from '../../modules/scale/scale-admission.service'
import { createFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { compileResearchScale } from '../../modules/survey/builder.compiler'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'

/**
 * Concurrent batch scale admission delivery on real PostgreSQL.
 * Asserts that two concurrent requests attempting first-time batch admission delivery
 * for the same attempt's child units resolve with zero deadlocks/SSI conflicts,
 * exactly one set of durable admissions is created via row locks, and both requests
 * return matching snapshot hashes without partial or orphaned commits.
 */
process.env.DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const DB_URL = integrationDatabaseUrl(
  'BATCH_SCALE_ADMISSION_INTEGRATION_DATABASE_URL',
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip
if (DB_URL) requireIsolatedReleaseDatabase(DB_URL)

suite('Batch scale admission delivery concurrency (real PostgreSQL)', () => {
  const suffix = `scale-adm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let compositeId = ''
  let courseId = ''
  let scaleId1 = ''
  let scaleId2 = ''
  let attemptId = ''
  let childId1 = ''
  let childId2 = ''
  const userId = `${suffix}-student`
  const ownerId = `${suffix}-owner`
  let observer: PrismaClient

  let runtime1: any
  let runtime2: any
  let parentAttempt: any
  let deliveryItems: any[]

  beforeAll(async () => {
    observer = new PrismaClient({ datasources: { db: { url: DB_URL } } })
    await observer.$connect()

    const owner = await db.user.create({
      data: {
        id: ownerId,
        username: ownerId,
        passwordHash: 'SYNTHETIC NONLOGIN',
        role: 'TEACHER',
        teacherApproved: true,
        accountDomain: 'TRAINING',
      },
    })
    const course = await db.course.create({
      data: {
        title: 'Batch Admission Concurrency Course',
        courseCode: `${suffix}-course`,
        creatorId: owner.id,
        status: 'PUBLISHED',
        courseType: 'TRAINING_COURSE',
      },
    })
    courseId = course.id

    const student = await db.user.create({
      data: {
        id: userId,
        username: userId,
        passwordHash: 'SYNTHETIC NONLOGIN',
        role: 'STUDENT',
        accountDomain: 'TRAINING',
      },
    })
    await db.courseStudent.create({
      data: {
        courseId: course.id,
        studentId: student.id,
        status: 'ACTIVE',
      },
    })

    const def1 = compileResearchScale(`Scale1_${suffix}`, {
      schemaVersion: 1,
      respondentType: 'participant_self_report',
      aggregation: 'sum',
      responseOptions: [
        { optionKey: 'o0', label: 'Never', score: 0 },
        { optionKey: 'o1', label: 'Sometimes', score: 1 },
        { optionKey: 'o2', label: 'Often', score: 2 },
        { optionKey: 'o3', label: 'Always', score: 3 },
      ],
      dimensions: [{ dimensionKey: 'engagement', label: 'Engagement', direction: 'higher_is_better' }],
      items: Array.from({ length: 2 }, (_, i) => ({
        itemKey: `i1_${i}`,
        prompt: `Question 1-${i}: Test item prompt`,
        required: true,
        reverse: false,
        dimensionKeys: ['engagement'],
      })),
    })
    const s1 = await db.scale.create({
      data: {
        code: `${suffix}-s1`,
        name: 'Scale 1',
        creatorId: owner.id,
        status: 'PUBLISHED',
        instrumentClass: 'CUSTOM_DESCRIPTIVE',
        instrumentVersion: '1',
        definition: def1,
        definitionHash: hashScaleDefinition(def1),
      },
    })
    scaleId1 = s1.id

    const def2 = compileResearchScale(`Scale2_${suffix}`, {
      schemaVersion: 1,
      respondentType: 'participant_self_report',
      aggregation: 'sum',
      responseOptions: [
        { optionKey: 'o0', label: 'Never', score: 0 },
        { optionKey: 'o1', label: 'Sometimes', score: 1 },
        { optionKey: 'o2', label: 'Often', score: 2 },
        { optionKey: 'o3', label: 'Always', score: 3 },
      ],
      dimensions: [{ dimensionKey: 'engagement', label: 'Engagement', direction: 'higher_is_better' }],
      items: Array.from({ length: 2 }, (_, i) => ({
        itemKey: `i2_${i}`,
        prompt: `Question 2-${i}: Test item prompt`,
        required: true,
        reverse: false,
        dimensionKeys: ['engagement'],
      })),
    })
    const s2 = await db.scale.create({
      data: {
        code: `${suffix}-s2`,
        name: 'Scale 2',
        creatorId: owner.id,
        status: 'PUBLISHED',
        instrumentClass: 'CUSTOM_DESCRIPTIVE',
        instrumentVersion: '1',
        definition: def2,
        definitionHash: hashScaleDefinition(def2),
      },
    })
    scaleId2 = s2.id

    runtime1 = createFrozenScaleRuntimeSnapshot({
      instrumentKey: s1.code,
      instrumentVersion: '1',
      definition: def1,
    })
    runtime2 = createFrozenScaleRuntimeSnapshot({
      instrumentKey: s2.code,
      instrumentVersion: '1',
      definition: def2,
    })

    const composite = await db.compositeAssessment.create({
      data: {
        code: `${suffix}-comp`,
        name: 'Batch Admission Concurrency Composite',
        createdBy: owner.id,
        productKind: 'QUESTIONNAIRE',
        questionnaireType: 'COURSE',
        status: 'PUBLISHED',
        publishedAt: new Date('2026-10-01T00:00:00Z'),
        maxAttempts: 5,
        questionnaireCourses: { create: { courseId: course.id } },
        items: {
          create: [
            { type: 'SCALE', position: 0, required: true, scaleId: s1.id },
            { type: 'SCALE', position: 1, required: true, scaleId: s2.id },
          ],
        },
      },
      include: { items: true },
    })
    compositeId = composite.id

    const item1 = composite.items.find(i => i.scaleId === s1.id)!
    const item2 = composite.items.find(i => i.scaleId === s2.id)!

    const parent = await db.compositeAssessmentAttempt.create({
      data: {
        compositeAssessmentId: composite.id,
        userId: student.id,
        participantKey: student.id,
        attemptEpoch: 1,
        status: 'IN_PROGRESS',
        progress: 0,
        completedItems: 0,
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        contextSnapshotHash: 'ctx-hash',
        frozenActiveSlotSetHash: 'slot-hash',
      },
      include: {
        compositeAssessment: {
          include: { formSections: true },
        },
      },
    })
    attemptId = parent.id
    parentAttempt = parent

    const c1 = await db.assessment.create({
      data: {
        scaleId: s1.id,
        userId: student.id,
        attemptEpoch: 1,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        compositeAttemptId: parent.id,
        compositeItemId: item1.id,
        runtimeSnapshotEncrypted: encryptUnifiedRuntimePayload(runtime1),
        compiledRuntimeHash: runtime1.compiledRuntime.compiledRuntimeHash,
      },
      include: { scale: true },
    })
    childId1 = c1.id

    const c2 = await db.assessment.create({
      data: {
        scaleId: s2.id,
        userId: student.id,
        attemptEpoch: 1,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        compositeAttemptId: parent.id,
        compositeItemId: item2.id,
        runtimeSnapshotEncrypted: encryptUnifiedRuntimePayload(runtime2),
        compiledRuntimeHash: runtime2.compiledRuntime.compiledRuntimeHash,
      },
      include: { scale: true },
    })
    childId2 = c2.id

    deliveryItems = [
      {
        slot: {
          slotKey: `scale:${item1.id}`,
          unitType: 'SCALE',
          sourceDefinitionIdentity: { key: s1.code, version: '1', hash: runtime1.sourceDefinitionHash },
          sourceBinding: { compositeItemId: item1.id, scaleId: s1.id, compiledRuntimeHash: runtime1.compiledRuntime.compiledRuntimeHash },
        },
        child: c1,
        runtime: runtime1,
      },
      {
        slot: {
          slotKey: `scale:${item2.id}`,
          unitType: 'SCALE',
          sourceDefinitionIdentity: { key: s2.code, version: '1', hash: runtime2.sourceDefinitionHash },
          sourceBinding: { compositeItemId: item2.id, scaleId: s2.id, compiledRuntimeHash: runtime2.compiledRuntime.compiledRuntimeHash },
        },
        child: c2,
        runtime: runtime2,
      },
    ]
  }, 120000)

  afterAll(async () => {
    try {
      if (childId1 || childId2) {
        await db.assessment.deleteMany({ where: { id: { in: [childId1, childId2] } } })
      }
      if (attemptId) {
        await db.compositeAssessmentAttempt.deleteMany({ where: { id: attemptId } })
      }
      if (compositeId) {
        await db.compositeAssessmentItem.deleteMany({ where: { compositeAssessmentId: compositeId } })
        await db.questionnaireCourseDelivery.deleteMany({ where: { compositeId } })
        await db.compositeAssessment.deleteMany({ where: { id: compositeId } })
      }
      if (scaleId1 || scaleId2) {
        await db.scale.deleteMany({ where: { id: { in: [scaleId1, scaleId2] } } })
      }
      if (courseId) {
        await db.courseStudent.deleteMany({ where: { courseId } })
        await db.course.deleteMany({ where: { id: courseId } })
      }
      await db.user.deleteMany({ where: { id: { in: [userId, ownerId] } } })
    } finally {
      await observer.$disconnect()
      await (await import('../../config/queue')).closeQueues(true)
      await db.$disconnect()
    }
  }, 120000)

  it('handles two simultaneous batch admission delivery requests on real PostgreSQL with zero deadlocks and identical snapshot hashes', async () => {
    const [resultA, resultB] = await Promise.all([
      batchEnsureScaleAdmissionsAtDelivery(parentAttempt, deliveryItems),
      batchEnsureScaleAdmissionsAtDelivery(parentAttempt, deliveryItems),
    ])

    expect(resultA.size).toBe(2)
    expect(resultB.size).toBe(2)

    const admA1 = resultA.get(childId1)!
    const admB1 = resultB.get(childId1)!
    expect(admA1).toBeDefined()
    expect(admB1).toBeDefined()
    expect(admA1.snapshotHash).toBe(admB1.snapshotHash)

    const admA2 = resultA.get(childId2)!
    const admB2 = resultB.get(childId2)!
    expect(admA2).toBeDefined()
    expect(admB2).toBeDefined()
    expect(admA2.snapshotHash).toBe(admB2.snapshotHash)

    // Direct database observation
    const persisted = await observer.assessment.findMany({
      where: { id: { in: [childId1, childId2] } },
      select: {
        id: true,
        frozenAdmissionSnapshotHash: true,
        frozenAdmissionSnapshotEncrypted: true,
      },
    })
    expect(persisted).toHaveLength(2)
    for (const row of persisted) {
      expect(row.frozenAdmissionSnapshotHash).toBeTruthy()
      expect(row.frozenAdmissionSnapshotEncrypted).toBeTruthy()
    }
  })
})
