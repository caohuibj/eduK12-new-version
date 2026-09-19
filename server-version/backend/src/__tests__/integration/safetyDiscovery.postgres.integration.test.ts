import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { buildReportingFixture } from './reporting-fixture'
import { parseStoredCanonicalUnitResult } from '../../modules/assessment-runtime/persistence'
import { listOrganizationSafetyCases } from '../../modules/assessment-safety/organization-discovery'
import {
  createMembership,
  denyOrganizationAccess,
  grantCapability,
  grantPersona,
  resumeOrganization,
  revokeCapability,
  suspendOrganization,
} from '../../modules/organization/service'

const DB_URL = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL')
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const meta = (userId: string) => ({ actorUserId: userId, commandKey: randomUUID() })

suite('PR5 Safety product discovery (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('lists only exact currently authorized cases and never leaks subject or trigger identity', async () => {
    const fixture = await buildReportingFixture(db, 3)
    const owner = await db.user.update({
      where: { id: fixture.ownerId },
      data: { platformRole: 'SYSTEM_ADMIN' },
    })
    const organizationId = fixture.organizationId
    const principal = { userId: owner.id, platformRole: 'SYSTEM_ADMIN' as const }
    const membership = await createMembership({
      organizationId,
      userId: owner.id,
      orgRole: 'ORG_ADMIN',
      meta: meta(owner.id),
    })

    const snapshot = await db.assessmentUnitSnapshot.findFirstOrThrow({
      where: { compositeAttemptId: fixture.members[0].attemptId },
    })
    const canonical = parseStoredCanonicalUnitResult(snapshot.canonicalResultEncrypted!)
    const safetyCase = await db.safetyCase.create({
      data: {
        policyKey: 'pr5-discovery',
        policyVersion: '1.0.0',
        subjectUserId: fixture.members[0].userId,
        primaryOwnerUserId: owner.id,
        backupOwnerUserIds: [],
        triggerSourceKind: 'CANONICAL_UNIT_RESULT',
        triggerSourceRecordId: snapshot.id,
        triggerSourceHash: canonical.resultHash,
        triggerNotesJson: ['must not appear in discovery'],
        idempotencyKey: randomUUID(),
        ackDueAt: new Date(Date.now() + 60_000),
        disposeDueAt: new Date(Date.now() + 120_000),
      },
    })

    const summary = await listOrganizationSafetyCases({ principal, organizationId })
    const summaryItem = summary.list.find((item) => item.caseId === safetyCase.id)
    expect(summaryItem).toMatchObject({ projection: 'SUMMARY', status: safetyCase.status })
    expect(summaryItem).not.toHaveProperty('subjectUserId')
    expect(summaryItem).not.toHaveProperty('triggerSourceHash')
    expect(summaryItem).not.toHaveProperty('primaryOwnerUserId')
    expect(summaryItem).not.toHaveProperty('ackDueAt')

    await grantPersona({ organizationId, membershipId: membership.id, persona: 'TEACHER', meta: meta(owner.id) })
    const action = await listOrganizationSafetyCases({ principal, organizationId })
    expect(action.list.find((item) => item.caseId === safetyCase.id)).toMatchObject({ projection: 'ACTION' })
    expect(action.list.find((item) => item.caseId === safetyCase.id)).toHaveProperty('ackDueAt')

    await grantCapability({ organizationId, membershipId: membership.id, capability: 'PSYCHOLOGY_STAFF', meta: meta(owner.id) })
    const full = await listOrganizationSafetyCases({ principal, organizationId })
    expect(full.list.find((item) => item.caseId === safetyCase.id)).toMatchObject({ projection: 'FULL' })

    await suspendOrganization({ organizationId, meta: meta(owner.id) })
    expect((await listOrganizationSafetyCases({ principal, organizationId })).list.find((item) => item.caseId === safetyCase.id)?.projection).toBe('FULL')
    await revokeCapability({ organizationId, membershipId: membership.id, capability: 'PSYCHOLOGY_STAFF', meta: meta(owner.id) })
    expect((await listOrganizationSafetyCases({ principal, organizationId })).list.find((item) => item.caseId === safetyCase.id)?.projection).toBe('ACTION')

    await db.safetyCase.update({
      where: { id: safetyCase.id },
      data: { primaryOwnerUserId: fixture.members[1].userId },
    })
    expect((await listOrganizationSafetyCases({ principal, organizationId })).list.some((item) => item.caseId === safetyCase.id)).toBe(false)

    await resumeOrganization({ organizationId, meta: meta(owner.id) })
    expect((await listOrganizationSafetyCases({ principal, organizationId })).list.find((item) => item.caseId === safetyCase.id)?.projection).toBe('SUMMARY')

    await denyOrganizationAccess({
      organizationId,
      userId: owner.id,
      permission: 'SAFETY_READ',
      reason: 'test Safety discovery revocation',
      meta: meta(owner.id),
    })
    await expect(listOrganizationSafetyCases({ principal, organizationId }))
      .rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
  })
})
