import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createMembership, createOrganization, grantPersona } from '../../modules/organization/service'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { readAssessmentRunProgress } from '../../modules/assessment-run/progress'
import {
  assertCurrentRunPublisherBoundary,
  assertRunExecutionParent,
} from '../../modules/assessment-run/resourceBoundary'
import {
  RunResourceAuthorityRegistry,
  type RunResourceAuthorityAdapter,
} from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const key = (label: string) => `run-boundary-${label}-${suffix}-${randomUUID()}`

const requestedPolicy = {
  subjectRoles: ['STUDENT'],
  respondentRoles: ['STUDENT'],
  relationshipKinds: ['SELF'],
  perspectives: ['SELF_REPORT'],
  analysisMode: 'INDIVIDUAL_ONLY',
  visibilityPolicyKey: 'ORG_SELF_V1',
  minimumRespondents: null,
}

const testAdapter: RunResourceAuthorityAdapter = {
  family: 'BUNDLE',
  capabilities: {
    transactionMode: 'TRANSACTIONAL_DB',
    startMode: 'TRANSACTIONAL',
    supportsLookupByOperationKey: false,
    supportsSafeCancel: false,
    finalAuthority: 'CANONICAL_RUNTIME',
    runtimeBindingKind: 'COMPOSITE',
    runV1Enabled: true,
  },
  async resolveExact(ref) {
    return {
      family: ref.family,
      key: ref.key,
      version: ref.version,
      scientificMaturity: 'PILOT',
      applicabilityHash: canonicalHash({ ref, requestedPolicy }),
      subjectRoles: ['STUDENT'],
      respondentRoles: ['STUDENT'],
      relationshipKinds: ['SELF'],
      perspectives: ['SELF_REPORT'],
      analysisMode: 'INDIVIDUAL_ONLY',
      visibilityPolicyKey: 'ORG_SELF_V1',
      minimumRespondents: null,
      runtimeLaunchTarget: { kind: 'COMPOSITE', ref: 'test-composite' },
    }
  },
}
const registry = new RunResourceAuthorityRegistry([testAdapter])

async function createUser(label: string, role: UserRole) {
  return db.user.create({
    data: {
      username: `run-boundary-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role,
    },
    select: { id: true },
  })
}

suite('Assessment Run HTTP resource boundaries (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })
  afterAll(async () => db.$disconnect())

  it('rejects cross-tenant progress, wrong START parent tuple, and non-member publish replay authority', async () => {
    const ownerA = await createUser('owner-a', UserRole.TEACHER)
    const ownerB = await createUser('owner-b', UserRole.TEACHER)
    const studentB = await createUser('student-b', UserRole.STUDENT)

    const orgA = await createOrganization({
      name: `boundary A ${suffix}`,
      meta: { actorUserId: ownerA.id, commandKey: key('org-a') },
    })
    const orgB = await createOrganization({
      name: `boundary B ${suffix}`,
      meta: { actorUserId: ownerB.id, commandKey: key('org-b') },
    })
    const membershipB = await createMembership({
      organizationId: orgB.organization.id,
      userId: studentB.id,
      meta: { actorUserId: ownerB.id, commandKey: key('member-b') },
    })
    await grantPersona({
      organizationId: orgB.organization.id,
      membershipId: membershipB.id,
      persona: 'STUDENT',
      meta: { actorUserId: ownerB.id, commandKey: key('persona-b') },
    })

    const runB = await createAssessmentRunDraft({
      organizationId: orgB.organization.id,
      name: 'boundary run B',
      createdByUserId: ownerB.id,
    })
    await addAssessmentRunTrackDraft({
      organizationId: orgB.organization.id,
      runId: runB.id,
      resource: { family: 'BUNDLE', key: 'boundary-bundle', version: '1.0.0' },
      subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [membershipB.id] },
      respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [membershipB.id] },
      requestedPolicy,
    })
    await publishAssessmentRun({
      organizationId: orgB.organization.id,
      runId: runB.id,
      actorUserId: ownerB.id,
      expectedVersion: 2,
      resourceRegistry: registry,
    })

    const executions = await db.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM assessment_run_executions WHERE organization_id=$1 AND run_id=$2`,
      orgB.organization.id,
      runB.id,
    )
    const executionId = executions[0].id

    await expect(readAssessmentRunProgress(orgA.organization.id, runB.id))
      .rejects.toMatchObject({ code: 'RUN_NOT_FOUND', statusCode: 404 })

    await expect(assertRunExecutionParent({
      organizationId: orgA.organization.id,
      runId: runB.id,
      executionId,
    })).rejects.toMatchObject({ code: 'RUN_EXECUTION_NOT_FOUND', statusCode: 404 })

    await expect(assertRunExecutionParent({
      organizationId: orgB.organization.id,
      runId: 'wrong-run-id',
      executionId,
    })).rejects.toMatchObject({ code: 'RUN_EXECUTION_NOT_FOUND', statusCode: 404 })

    await expect(assertCurrentRunPublisherBoundary({
      organizationId: orgB.organization.id,
      runId: runB.id,
      actorUserId: ownerA.id,
    })).rejects.toMatchObject({ code: 'RUN_PUBLISH_FORBIDDEN', statusCode: 403 })
  })
})
