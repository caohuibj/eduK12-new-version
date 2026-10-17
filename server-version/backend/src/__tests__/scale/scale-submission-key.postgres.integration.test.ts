import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'
import { persistScaleFactRecords, type ScaleFactRecord } from '../../modules/assessment-runtime/scale-fact-records'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
let db: PrismaClient, userId: string, scaleId: string
const ids: string[] = [], winnerKey = randomUUID()
const fact = (id: string, submissionId: string): ScaleFactRecord => ({ id, attemptEpoch: 1, submissionId,
  submissionPayloadHash: 'a'.repeat(64), sourceResultHash: 'b'.repeat(64), canonicalResultHash: null,
  factsEncrypted: 'SYNTHETIC_TEST_ONLY', rawAnswersEncrypted: 'SYNTHETIC_TEST_ONLY', rawReceiptAttemptId: null,
  completedAt: new Date('2026-01-01T00:00:00.000Z'), totalTime: 10 })
const save = (rows: ScaleFactRecord[]) => db.$transaction(tx => persistScaleFactRecords(tx, rows))

suite('precise compact submission key conflict on isolated PostgreSQL', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    db = new PrismaClient({ datasources: { db: { url: url! } } })
    userId = (await db.user.create({ data: { username: 'synthetic-key-' + randomUUID(), passwordHash: 'disabled', role: 'STUDENT' } })).id
    scaleId = (await db.scale.create({ data: { code: 'synthetic-key-' + randomUUID(), name: 'Synthetic constraint fixture', creatorId: userId } })).id
    for (let i = 0; i < 8; i++) ids.push((await db.assessment.create({ data: { userId: null, scaleId } })).id)
    await save([fact(ids[0], winnerKey)])
  })
  afterAll(async () => {
    if (db) {
      await db.assessment.deleteMany({ where: { id: { in: ids } } })
      if (scaleId) await db.scale.delete({ where: { id: scaleId } })
      if (userId) await db.user.delete({ where: { id: userId } })
      await db.$disconnect()
    }
  })
  it('rejects another assessment key without changing the winner', async () => {
    const before = await db.assessmentResultFact.findUniqueOrThrow({ where: { submissionId: winnerKey } })
    await expect(save([fact(ids[1], winnerKey)])).rejects.toMatchObject({ code: 'SUBMISSION_PAYLOAD_CONFLICT', statusCode: 409 })
    expect(await db.assessmentResultFact.count({ where: { assessmentId: ids[1] } })).toBe(0)
    expect(await db.assessmentResultFact.findUniqueOrThrow({ where: { submissionId: winnerKey } })).toEqual(before)
  })
  it('rolls back successful rows preceding a conflict in a mixed batch', async () => {
    await expect(save([fact(ids[2], randomUUID()), fact(ids[3], winnerKey)])).rejects.toBeInstanceOf(InstrumentFinalSubmitError)
    expect(await db.assessmentResultFact.count({ where: { assessmentId: { in: [ids[2], ids[3]] } } })).toBe(0)
  })
  it('does not mask another constraint: same primary key with a different submission ID', async () => {
    await expect(save([fact(ids[0], randomUUID())])).rejects.toMatchObject({ code: 'P2010', meta: { code: '23505' } })
    expect(await db.assessmentResultFact.count({ where: { assessmentId: ids[0] } })).toBe(1)
  })
  it('one concurrent key winner persists and the other transaction reports controlled conflict', async () => {
    const key = randomUUID()
    const results = await Promise.allSettled([save([fact(ids[4], key)]), save([fact(ids[5], key)])])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toMatchObject({ code: 'SUBMISSION_PAYLOAD_CONFLICT', statusCode: 409 })
    expect(await db.assessmentResultFact.count({ where: { submissionId: key } })).toBe(1)
    expect(await db.assessmentResultFact.count({ where: { assessmentId: { in: [ids[4], ids[5]] } } })).toBe(1)
  })
  it('still persists an ordinary unique batch completely', async () => {
    await save([fact(ids[6], randomUUID()), fact(ids[7], randomUUID())])
    expect(await db.assessmentResultFact.count({ where: { assessmentId: { in: [ids[6], ids[7]] } } })).toBe(2)
  })
})
