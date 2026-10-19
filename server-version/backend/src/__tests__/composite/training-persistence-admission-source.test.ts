import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { freezeTrainingPersistenceSnapshot, parseTrainingPersistencePolicy, trainingCheckpointExpiry, trainingPersistenceMetadata } from '../../modules/composite/training-persistence.policy'

const source = (file: string) => readFileSync(`src/modules/${file}`, 'utf8')
const composite = source('composite/composite.service.ts')
const authoring = source('questionnaire-product/service.ts')
const cognitive = source('cognitive/session.service.ts')
const admission = composite.slice(composite.indexOf('const createAttempt = async'), composite.indexOf('const createAttempt = async') + 30000)
const now = new Date('2026-10-19T00:00:00.000Z')
const publicationIdentity = { schemaVersion: 1, compositeId: 'publication', courseId: 'training', publishedAt: now.toISOString(), productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', trainingFlowDigest: null, trainingVariantDigest: null }

describe('Training persistence publication/admission source contracts (not HTTP evidence)', () => {
  it('keeps authoring strict while defaulting each absent opt-in independently off', () => {
    expect(authoring).toContain('checkpoint: retentionSettingSchema.optional().default(null), localCognitive: retentionSettingSchema.optional().default(null)')
    expect(authoring).toContain("const retentionSettingSchema = z.object({ enabled: z.literal(true), ttlHours: z.number().int().min(1).max(48) }).strict().nullable()")
    expect(authoring).toContain('trainingPersistencePolicy: persistencePolicySchema.optional()')
    expect(authoring).toContain('trainingPersistencePolicyHash: canonicalHash(policy)')
    expect(composite).toContain("validateTrainingPersistenceAuthoring(prisma as Prisma.TransactionClient, composite, composite.trainingPersistencePolicy)")
    expect(composite).toContain('...flowFields, ...persistenceFields')
    expect(authoring).toContain('input.trainingPersistencePolicy === undefined ? row.trainingPersistencePolicy : input.trainingPersistencePolicy')
    expect(authoring).toContain('publicEnabled:false},composite?.trainingPersistencePolicy)')
  })

  it('resolves policy/course under parent lock before optional flow and variant branches', () => {
    const lock = admission.indexOf('FOR UPDATE')
    const policyRead = admission.indexOf('readTrainingPersistencePolicy(current.trainingPersistencePolicy)')
    const course = admission.indexOf('const courseId = userId ? composite.deliveryCourseId')
    expect(lock).toBeGreaterThan(0)
    expect(policyRead).toBeGreaterThan(lock)
    expect(course).toBeGreaterThan(policyRead)
    expect(course).toBeLessThan(admission.indexOf('const flowEnabled'))
    expect(admission).toContain('courseIds.length === 1 ? courseIds[0] : null')
    expect(admission).toContain('!courseIds.includes(courseId)')
    expect(admission).toContain("c.course_type='TRAINING_COURSE' AND NOT c.is_library AND c.status::text='PUBLISHED'")
    expect(admission).toContain('FOR SHARE OF c,u')
    expect(admission).toContain('db.courseStudent.findFirst')
    expect(admission).toContain('if (accessTokenId)')
    expect(admission).toContain('if (token.trainingRoundId)')
    expect(admission).not.toContain('trainingPublicRound.create')
    expect(admission).not.toContain('compositeAssessmentAccessToken.create')
  })

  it('uses the same C21 identity DTO as checkpoint access and inserts frozen snapshot immediately', () => {
    expect(admission).toContain('trainingRoundPublicationIdentity(current, courseId)')
    expect(source('composite/training-checkpoint.service.ts')).toContain('trainingRoundPublicationIdentity(parent,s.courseId)')
    expect(admission).toContain('round.publicationHash !== canonicalHash(publicationIdentity)')
    expect(admission).toContain('cutoffs: [facts[0].endedAt, current.expiresAt, roundCutoff]')
    const insert = admission.indexOf('const attempt = await db.compositeAssessmentAttempt.create')
    expect(admission.indexOf('const trainingPersistenceSnapshot =')).toBeLessThan(insert)
    const insertData = admission.slice(insert, admission.indexOf('const attempt = await db.compositeAssessmentAttempt.create') + 1100)
    expect(insertData).toContain('trainingPersistenceSnapshotHash: canonicalHash(trainingPersistenceSnapshot)')
    expect(insertData).toContain('id: newAttemptId')
  })

  it('shares authenticated/public cognitive metadata and frozen admission session epoch', () => {
    expect(cognitive).toContain('sessionEpoch: admission.attemptEpoch')
    expect(composite).toContain('sessionEpoch: admission.attemptEpoch')
    expect(composite).toContain('checkpointDefinitionHash: attempt.frozenActiveSlotSetHash')
    expect(cognitive).not.toContain('sessionEpoch: session.attemptNo')
    expect(composite).not.toContain('sessionEpoch: session.attemptNo')
    expect(cognitive).toContain('sessionId: session.id')
    expect(cognitive).toContain('trainingPersistenceMetadata(session.compositeAttempt as any)')
    for (const start of ['export const getSession =', 'export const getPublicSession =']) {
      const body = cognitive.slice(cognitive.indexOf(start), cognitive.indexOf(start) + 2200)
      expect(body).toContain('trainingPersistenceSnapshot: true')
      expect(body).toContain('trainingPersistenceSnapshotHash: true')
      expect(body).toContain('toRunnerPayload(session')
    }
  })
})

describe('Training admission snapshot unit contracts', () => {
  for (const mode of ['authenticated-no-token', 'anonymous-null-round']) {
    it(`${mode}: old/unknown/malformed policy never activates retention`, () => {
      for (const policy of [undefined, null, {}, { schemaVersion: 2 }, { schemaVersion: 1, checkpoint: { enabled: true, ttlHours: 49 } }]) {
        expect(freezeTrainingPersistenceSnapshot({ policy, policyHash: null, publicationIdentity, attemptId: mode, attemptEpoch: 1, compositeId: 'publication', courseId: 'training', cutoffs: [] })).toBeNull()
      }
      expect(trainingPersistenceMetadata({ id: mode, attemptEpoch: 1, deliveryCourseId: 'training' })).toBeUndefined()
    })

    it(`${mode}: supports a genuine >48-hour task with no round and bounds each payload`, () => {
      const policy = parseTrainingPersistencePolicy({ schemaVersion: 1, checkpoint: { enabled: true, ttlHours: 6 } })!
      const snapshot = freezeTrainingPersistenceSnapshot({ policy, policyHash: canonicalHash(policy), publicationIdentity, attemptId: mode, attemptEpoch: 2, compositeId: 'publication', courseId: 'training', cutoffs: [new Date('2026-11-19')] })!
      expect(snapshot.roundId).toBeNull()
      expect(snapshot.frozenCutoff).toBe('2026-11-19T00:00:00.000Z')
      expect(trainingCheckpointExpiry(snapshot, now, []).toISOString()).toBe('2026-10-19T06:00:00.000Z')
      const metadata = trainingPersistenceMetadata({ id: mode, attemptEpoch: 2, deliveryCourseId: 'training', trainingPersistenceSnapshot: snapshot, trainingPersistenceSnapshotHash: canonicalHash(snapshot) })!
      expect(metadata).toEqual({ snapshotHash: canonicalHash(snapshot), attemptId: mode, attemptEpoch: 2, courseId: 'training', checkpoint: { enabled: true, ttlHours: 6 }, localCognitive: null })
    })
  }
})
