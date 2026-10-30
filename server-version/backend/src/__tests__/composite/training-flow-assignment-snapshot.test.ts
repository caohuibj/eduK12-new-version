import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  course: { findUnique: vi.fn() },
  cognitiveTestConfig: { findUnique: vi.fn() },
  cognitiveAssignment: { findMany: vi.fn(), create: vi.fn(),findUnique:vi.fn() },
}))
vi.mock('../../config/database', () => ({ prisma: db }))

import { config as appConfig } from '../../config'
import { CanonicalJsonError, canonicalHash } from '../../modules/assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload, encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { prepareTeacherPublishedAssignment, persistPreparedTeacherPublishedAssignment } from '../../modules/cognitive/assignment.service'
import { freezeTrainingFlowAssignment } from '../../modules/composite/training-flow-assignment-snapshot'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { freezeAssignmentProfile, freezeDataForWrite } from '../../modules/cognitive/profile-freeze'

const input = {
  userId: 'flow-teacher', courseId: 'flow-course', configId: 'reaction-config',
  title: 'Deferred flow wrapper', instruction: null, quotaSourceAssignmentId: 'source-assignment', maxAttempts: 3,
}
const publishedConfig = {
  id: input.configId, testType: 'reaction', configVersion: '1.1.0',
  status: 'PUBLISHED', engineVersion: '1.0.0', scoringVersion: '1.1.0',
  config: {
    totalTrials: 20, foreperiodMinMs: 700, foreperiodMaxMs: 1500,
    timeoutMs: 2000, readyDurationMs: 1000,
    report: { reportVersion: '1.1.0', referenceMode: 'simulated', referenceVersion: 'lit-sim-k12-v0.2', referenceBand: 'K7-9' },
  },
}
const publication = new Date('2026-10-18T12:34:56.789Z')
const existingAssignment = () => ({
  id: 'existing-wrapper', courseId: input.courseId, configId: input.configId,
  createdBy: input.userId, title: input.title, instruction: input.instruction,
  courseSnapshot: { id: input.courseId, title: 'Flow course', courseCode: 'FLOW-COURSE' },
  status: 'PUBLISHED', listedStandalone: false, required: false,
  maxAttempts: input.maxAttempts, quotaSourceAssignmentId: input.quotaSourceAssignmentId,
  opensAt: null, dueAt: null, createdAt: publication, updatedAt: publication, publishedAt: publication,
  profile: null, profileDefinitionVersion: null, resolvedConfigSnapshotEncrypted: null,
  resolvedConfigHash: null, resolvedReportSnapshotEncrypted: null,
})
let cognitiveEnabled: boolean
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('DATA_ENCRYPTION_KEY', 'e'.repeat(64))
  cognitiveEnabled = appConfig.cognitiveModuleEnabled
  appConfig.cognitiveModuleEnabled = true
  db.cognitiveTestConfig.findUnique.mockResolvedValue(publishedConfig)
  db.course.findUnique.mockResolvedValue({ id: input.courseId, title: 'Flow course', courseCode: 'FLOW-COURSE' })
  db.cognitiveAssignment.findUnique.mockResolvedValue(null)
  db.cognitiveAssignment.findMany.mockResolvedValue([])
  db.cognitiveAssignment.create.mockImplementation(async ({ data }) => ({ id: 'created-wrapper', ...data }))
})
afterEach(() => { appConfig.cognitiveModuleEnabled = cognitiveEnabled; vi.unstubAllEnvs() })

describe('C19 private prepared-assignment candidate snapshot', () => {
  it.each(['false', 'true'])('copies an existing source freeze without transcoding, source compact=%s', async compact => {
    vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED', compact)
    const sourceFreeze = freezeDataForWrite(freezeAssignmentProfile({
      entry: getCognitiveRegistryEntry('reaction', '1.0.0', '1.1.0')!,
      baseConfig: publishedConfig.config, profile: 'standard',
    }))
    vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED', compact === 'true' ? 'false' : 'true')
    const prepared = await prepareTeacherPublishedAssignment(db as any, { ...input, sourceFreeze })
    expect(prepared.data).toMatchObject(sourceFreeze)
    const snapshot = freezeTrainingFlowAssignment(prepared)
    expect(snapshot.data).toMatchObject(sourceFreeze)
    await persistPreparedTeacherPublishedAssignment(db as any, snapshot)
    expect(db.cognitiveAssignment.create).toHaveBeenCalledExactlyOnceWith({ data: snapshot.data })
  })

  it.each(['false', 'true'])('freezes actual new-wrapper preparation and preserves deferred persistence, compact=%s', async compact => {
    vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED', compact)
    const prepared = await prepareTeacherPublishedAssignment(db as any, input)
    expect(prepared.data?.publishedAt).toBeInstanceOf(Date)
    // Reproduce the original failing boundary using the actual preparation.
    expect(() => canonicalHash({ assignments: { cognitive: prepared } })).toThrow(CanonicalJsonError)
    expect(() => canonicalHash({ assignments: { cognitive: prepared } })).toThrow('publishedAt must be a plain object')
    expect(db.cognitiveAssignment.create).not.toHaveBeenCalled()

    const snapshot = freezeTrainingFlowAssignment(prepared)
    const candidate = { schemaVersion: 1, assignments: { cognitive: snapshot } }
    const restored = decryptUnifiedRuntimePayload<any>(encryptUnifiedRuntimePayload(candidate))
    expect(canonicalHash(restored)).toBe(canonicalHash(candidate))
    expect(restored.assignments.cognitive.data).toEqual({
      ...prepared.data, publishedAt: (prepared.data!.publishedAt as Date).toISOString(),
    })
    expect(new Date(restored.assignments.cognitive.data.publishedAt).getTime()).toBe((prepared.data!.publishedAt as Date).getTime())
    expect(db.cognitiveAssignment.create).not.toHaveBeenCalled()
    const persisted = await persistPreparedTeacherPublishedAssignment(db as any, restored.assignments.cognitive)
    expect(persisted.id).toBe('created-wrapper')
    expect(db.cognitiveAssignment.create).toHaveBeenCalledExactlyOnceWith({ data: restored.assignments.cognitive.data })
    expect(prepared.data!.publishedAt).toBeInstanceOf(Date)
  })

  it.each(['false', 'true'])('freezes actual existing-wrapper preparation as identity only, compact=%s', async compact => {
    vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED', compact)
    const existing = existingAssignment()
    db.cognitiveAssignment.findMany.mockResolvedValue([existing])
    const prepared = await prepareTeacherPublishedAssignment(db as any, input)
    expect(prepared.existing).toBe(existing)
    expect(() => canonicalHash({ assignments: { cognitive: prepared } })).toThrow(CanonicalJsonError)
    expect(() => canonicalHash({ assignments: { cognitive: prepared } })).toThrow('createdAt must be a plain object')

    const snapshot = freezeTrainingFlowAssignment(prepared)
    expect(snapshot).toEqual({ existing: { id: existing.id } })
    const candidate = { schemaVersion: 1, assignments: { cognitive: snapshot } }
    const restored = decryptUnifiedRuntimePayload<any>(encryptUnifiedRuntimePayload(candidate))
    expect(canonicalHash(restored)).toBe(canonicalHash(candidate))
    // createCognitiveChild consumes only copied.id, attaching the current
    // already-authorized config separately; historical timestamps are unused.
    const persisted = await persistPreparedTeacherPublishedAssignment(db as any, restored.assignments.cognitive)
    expect(persisted).toEqual({ id: existing.id })
    expect(db.cognitiveAssignment.create).not.toHaveBeenCalled()
    expect(existing.publishedAt).toBe(publication)
    expect(existing.createdAt).toBe(publication)
  })

  it('keeps canonical Date rejection and does not silently omit a missing create field', async () => {
    expect(() => canonicalHash({ publishedAt: publication })).toThrow(CanonicalJsonError)
    const prepared = await prepareTeacherPublishedAssignment(db as any, input)
    const incomplete = { data: { ...prepared.data!, instruction: undefined } }
    expect(() => freezeTrainingFlowAssignment(incomplete)).toThrow('instruction must not be undefined')
    expect(db.cognitiveAssignment.create).not.toHaveBeenCalled()
  })

  it('rejects an invalid publication date before encoding the deferred wrapper', async () => {
    const prepared = await prepareTeacherPublishedAssignment(db as any, input)
    expect(() => freezeTrainingFlowAssignment({ data: { ...prepared.data!, publishedAt: new Date(NaN) } })).toThrow('publication time is invalid')
    expect(db.cognitiveAssignment.create).not.toHaveBeenCalled()
  })
})
