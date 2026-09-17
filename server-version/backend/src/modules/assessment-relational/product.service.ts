import type { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import {
  getAttemptState,
  startRelationalCompositeAttemptInTransaction,
} from '../composite/composite.service'
import { relationalFail } from './errors'
import { createSqlRelationalAssignmentRepository } from './repository'
import { createRelationalAssessmentService } from './service'
import type { RelationalActorRoleV1, RelationalAssignmentRecordV1 } from './types'
import {
  relationalProductRegistry,
  type RelationalProductEntryV1,
  type RelationalProductRegistryV1,
} from './product-registry'

const actorRole = (role: UserRole): RelationalActorRoleV1 => {
  if (role === 'STUDENT' || role === 'TEACHER' || role === 'PARENT') return role
  return relationalFail('RELATIONAL_PRODUCT_ROLE', 'this account role cannot participate in relational assessment')
}

const publicProduct = (entry: RelationalProductEntryV1) => ({
  resourceKind: entry.applicability.resourceKind,
  resourceKey: entry.applicability.resourceKey,
  resourceVersion: entry.applicability.resourceVersion,
  title: entry.title,
  description: entry.description,
  scienceMaturity: entry.scienceMaturity,
  perspectives: entry.applicability.perspectives,
  analysisMode: entry.applicability.analysisMode,
  minimumRespondents: entry.applicability.minimumRespondents,
})

const taskProjection = (
  assignment: RelationalAssignmentRecordV1,
  registry: RelationalProductRegistryV1,
) => {
  const entry = registry.findExact(assignment)
  const registryMatches = Boolean(
    entry
    && entry.releaseStatus === 'PUBLISHED'
    && entry.launchTarget
    && registry.applicabilityHash(entry) === assignment.applicabilityHash,
  )
  return {
    assignmentId: assignment.assignmentId,
    episodeId: assignment.episodeId,
    subjectUserId: assignment.subjectUserId,
    subjectRole: assignment.subjectRole,
    respondentRole: assignment.respondentRole,
    perspective: assignment.perspective,
    relationshipKind: assignment.relationshipKind,
    resourceKind: assignment.resourceKind,
    resourceKey: assignment.resourceKey,
    resourceVersion: assignment.resourceVersion,
    analysisMode: assignment.analysisMode,
    minimumRespondents: assignment.minimumRespondents,
    status: assignment.status,
    createdAt: assignment.createdAt,
    startedAt: assignment.startedAt,
    completedAt: assignment.completedAt,
    launchable: registryMatches && (assignment.status === 'OPEN' || assignment.status === 'STARTED'),
    product: entry && entry.releaseStatus === 'PUBLISHED' ? publicProduct(entry) : null,
  }
}

export const createRelationalProductService = (
  registry: RelationalProductRegistryV1 = relationalProductRegistry,
) => ({
  catalog(role: UserRole) {
    const relationalRole = actorRole(role)
    return registry.listReleasedForRespondent(relationalRole).map(publicProduct)
  },

  async tasks(userId: string, role: UserRole) {
    const relationalRole = actorRole(role)
    const repository = createSqlRelationalAssignmentRepository(prisma as any)
    const assignments = await repository.listForRespondent(userId)
    return assignments
      .filter((assignment) => assignment.respondentRole === relationalRole)
      .map((assignment) => taskProjection(assignment, registry))
  },

  async start(input: { assignmentId: string; userId: string; role: UserRole }) {
    const relationalRole = actorRole(input.role)
    const launched = await prisma.$transaction(async (tx) => {
      const repository = createSqlRelationalAssignmentRepository(tx as any)
      const assignment = await repository.findById(input.assignmentId)
      if (!assignment) relationalFail('RELATIONAL_ASSIGNMENT_NOT_FOUND', 'assignment not found')
      if (assignment.respondentUserId !== input.userId || assignment.respondentRole !== relationalRole) {
        relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'only the assigned respondent can start this assessment')
      }

      const entry = registry.findExact(assignment)
      if (!entry || entry.releaseStatus !== 'PUBLISHED' || !entry.launchTarget) {
        relationalFail('RELATIONAL_PRODUCT_UNAVAILABLE', 'relational product is not released or launchable')
      }
      if (registry.applicabilityHash(entry) !== assignment.applicabilityHash) {
        relationalFail('RELATIONAL_PRODUCT_CONTRACT', 'assignment applicability does not match the released product contract')
      }

      const existing = await tx.compositeAssessmentAttempt.findFirst({
        where: { assignmentRef: assignment.assignmentId },
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          compositeAssessmentId: true,
          userId: true,
          subjectUserId: true,
          respondentUserId: true,
          episodeId: true,
          assignmentRef: true,
          consentId: true,
        },
      })
      if (existing) {
        if (
          existing.compositeAssessmentId !== entry.launchTarget.compositeAssessmentId
          || existing.userId !== input.userId
          || existing.subjectUserId !== assignment.subjectUserId
          || existing.respondentUserId !== assignment.respondentUserId
          || existing.episodeId !== assignment.episodeId
          || existing.assignmentRef !== assignment.assignmentId
        ) {
          relationalFail('RELATIONAL_RUNTIME_BINDING', 'existing runtime attempt does not match the relational assignment')
        }
        if (assignment.status === 'OPEN') {
          relationalFail('RELATIONAL_RUNTIME_BINDING', 'runtime attempt exists while relational assignment is still OPEN')
        }
        return { assignment, attemptId: existing.id, replayed: true }
      }
      if (assignment.status !== 'OPEN') {
        relationalFail('RELATIONAL_RUNTIME_BINDING', 'started relational assignment is missing its runtime attempt')
      }

      const relational = createRelationalAssessmentService(repository)
      const started = await relational.start({
        assignmentId: assignment.assignmentId,
        actorUserId: input.userId,
      })
      const attempt = await startRelationalCompositeAttemptInTransaction(tx as any, {
        compositeAssessmentId: entry.launchTarget.compositeAssessmentId,
        respondentUserId: input.userId,
        attemptIdentity: started.attemptIdentity,
      })
      return { assignment: started.assignment, attemptId: attempt.id, replayed: false }
    })

    return {
      assignment: taskProjection(launched.assignment, registry),
      attempt: await getAttemptState(launched.attemptId, { userId: input.userId }),
      replayed: launched.replayed,
    }
  },
})

export const relationalProductService = createRelationalProductService()
