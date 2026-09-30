import { matchesClassTarget } from '../assessment-policy/target'
import { currentClassDeliverySql } from '../organization/deliveryPolicy'
import { createRunPendingConsent } from './consent'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { validateOrganizationRelationalSnapshot } from '../assessment-relational/organization-contract'
import type {
  RelationalActorRoleV1,
  RelationalRelationshipKindV1,
  RelationalRelationshipSnapshotV1,
} from '../assessment-relational/types'
import {
  type RunResourceAuthorityRegistry,
  type RunResourcePolicy,
  type RunTrackNarrowingRequest,
  assertRunTrackNarrowing,
  productionRunResourceAuthorityRegistry,
} from './resourceAuthority'
import {
  AssessmentRunRepositoryError,
  insertRunActorSnapshot,
  insertRunExecution,
  insertRunRelationshipSnapshot,
  type RunActorRole,
} from './repository'
import { getOrCreateOrganizationEpisodeAllocationInTransaction } from './episodeAllocation'

type Tx = Prisma.TransactionClient

export type RunPopulationSelectorV1 =
  | { kind: 'ALL_CURRENT' }
  | { kind: 'MEMBERSHIP_IDS'; membershipIds: string[] }
  | { kind: 'CLASS_UNITS'; classUnitIds: string[] }
  | { kind: 'LABELS'; labelIds: string[]; match: 'ANY' | 'ALL' }
  | { kind: 'RELATED_PARENT' }

type DraftTrack = {
  id: string
  organizationId: string
  runId: string
  resourceFamily: 'BUNDLE' | 'SCALE' | 'FORM' | 'SITUATIONAL' | 'COGNITIVE'
  resourceKey: string
  resourceVersion: string
  subjectSelector: RunPopulationSelectorV1
  respondentSelector: RunPopulationSelectorV1
  requestedPolicy: RunTrackNarrowingRequest
}

type FrozenMemberActor = {
  provenanceKind: 'ORG_MEMBER'
  userId: string
  membershipId: string
  actorRole: Exclude<RunActorRole, 'PARENT'>
  personaGrantId: string
}

type FrozenParentActor = {
  provenanceKind: 'EXTERNAL_PARENT'
  userId: string
  membershipId: null
  actorRole: 'PARENT'
  parentRelationshipId: string
}

type PairActor = FrozenMemberActor | FrozenParentActor

type PopulationPair = {
  subject: PairActor
  respondent: PairActor
  relationshipKind: RelationalRelationshipKindV1
  relationshipRef: string | null
  scopeClassUnitIds: string[]
  facts: Record<string, string | boolean | null>
}

type PreparedTrack = DraftTrack & { resourcePolicy: RunResourcePolicy }

type PublisherAuthority = {
  membershipId: string
  isOrgAdmin: boolean
  teacherPersona: boolean
  counselorPersona: boolean
  teacherClassIds: Set<string>
  teacherStudentMembershipIds: Set<string>
  counselorClientMembershipIds: Set<string>
}

export class RunPublishError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 409) {
    super(message)
    this.name = 'RunPublishError'
  }
}

const requireSingle = <T extends string>(values: readonly T[], field: string): T => {
  if (values.length !== 1) throw new RunPublishError('RUN_TRACK_NOT_DETERMINISTIC', `${field} must contain exactly one value for V1 publish`, 409)
  return values[0]
}

const parseSelector = (value: unknown): RunPopulationSelectorV1 => {
  if (!value || typeof value !== 'object') throw new RunPublishError('RUN_SELECTOR_INVALID', 'population selector must be an object', 400)
  const selector = value as Record<string, unknown>
  if (selector.kind === 'ALL_CURRENT' || selector.kind === 'RELATED_PARENT') return { kind: selector.kind }
  if (selector.kind === 'MEMBERSHIP_IDS') {
    if (!Array.isArray(selector.membershipIds) || selector.membershipIds.length === 0 || selector.membershipIds.some((id) => typeof id !== 'string' || !id.trim())) {
      throw new RunPublishError('RUN_SELECTOR_INVALID', 'MEMBERSHIP_IDS requires non-empty membershipIds', 400)
    }
    return { kind: 'MEMBERSHIP_IDS', membershipIds: [...new Set(selector.membershipIds as string[])] }
  }
  if (selector.kind === 'CLASS_UNITS') {
    if (!Array.isArray(selector.classUnitIds) || selector.classUnitIds.length === 0 || selector.classUnitIds.some((id) => typeof id !== 'string' || !id.trim())) {
      throw new RunPublishError('RUN_SELECTOR_INVALID', 'CLASS_UNITS requires non-empty classUnitIds', 400)
    }
    return { kind: 'CLASS_UNITS', classUnitIds: [...new Set(selector.classUnitIds as string[])] }
  }
  if (selector.kind === 'LABELS') {
    if (!Array.isArray(selector.labelIds) || selector.labelIds.length === 0 || selector.labelIds.some((id) => typeof id !== 'string' || !id.trim())) {
      throw new RunPublishError('RUN_SELECTOR_INVALID', 'LABELS requires non-empty labelIds', 400)
    }
    if (selector.match !== 'ANY' && selector.match !== 'ALL') throw new RunPublishError('RUN_SELECTOR_INVALID', 'LABELS match must be ANY or ALL', 400)
    return { kind: 'LABELS', labelIds: [...new Set(selector.labelIds as string[])], match: selector.match }
  }
  throw new RunPublishError('RUN_SELECTOR_INVALID', `unsupported selector kind: ${String(selector.kind)}`, 400)
}

const readDraftTracks = async (runId: string, organizationId: string): Promise<DraftTrack[]> => {
  const rows = await prisma.$queryRaw<Array<{
    id: string
    organizationId: string
    runId: string
    resourceFamily: DraftTrack['resourceFamily']
    resourceKey: string
    resourceVersion: string
    subjectSelector: unknown
    respondentSelector: unknown
    requestedPolicy: RunTrackNarrowingRequest
  }>>`
    SELECT "id", "organization_id" AS "organizationId", "run_id" AS "runId",
      "resource_family" AS "resourceFamily", "resource_key" AS "resourceKey", "resource_version" AS "resourceVersion",
      "subject_selector" AS "subjectSelector", "respondent_selector" AS "respondentSelector",
      "requested_policy" AS "requestedPolicy"
    FROM "assessment_run_tracks"
    WHERE "organization_id" = ${organizationId} AND "run_id" = ${runId}
    ORDER BY "created_at", "id"
  `
  return rows.map((row) => ({ ...row, subjectSelector: parseSelector(row.subjectSelector), respondentSelector: parseSelector(row.respondentSelector) }))
}

const prepareTracks = async (
  runId: string,
  organizationId: string,
  registry: RunResourceAuthorityRegistry,
): Promise<PreparedTrack[]> => {
  const tracks = await readDraftTracks(runId, organizationId)
  if (tracks.length === 0) throw new RunPublishError('RUN_TRACK_REQUIRED', 'Run requires at least one Track', 409)
  return Promise.all(tracks.map(async (track) => {
    registry.assertStartSupported(track.resourceFamily)
    const resourcePolicy = await registry.resolveExact({ family: track.resourceFamily, key: track.resourceKey, version: track.resourceVersion })
    assertRunTrackNarrowing(resourcePolicy, track.requestedPolicy)
    requireSingle(track.requestedPolicy.subjectRoles, 'subjectRoles')
    requireSingle(track.requestedPolicy.respondentRoles, 'respondentRoles')
    requireSingle(track.requestedPolicy.relationshipKinds, 'relationshipKinds')
    requireSingle(track.requestedPolicy.perspectives, 'perspectives')
    if (track.resourceFamily === 'COGNITIVE') {
      throw new RunPublishError('RUN_RESOURCE_UNSUPPORTED', 'COGNITIVE does not use the relational assignment bridge in PR2 V1', 409)
    }
    return { ...track, resourcePolicy }
  }))
}

const actorFromMember = (row: { userId: string; membershipId: string; personaGrantId: string }, role: Exclude<RunActorRole, 'PARENT'>): FrozenMemberActor => ({
  provenanceKind: 'ORG_MEMBER', userId: row.userId, membershipId: row.membershipId, actorRole: role, personaGrantId: row.personaGrantId,
})

const selectorMembershipFilter = async (
  tx: Tx,
  organizationId: string,
  selector: RunPopulationSelectorV1,
): Promise<Set<string> | null> => {
  if (selector.kind === 'ALL_CURRENT' || selector.kind === 'CLASS_UNITS' || selector.kind === 'RELATED_PARENT') return null
  if (selector.kind === 'MEMBERSHIP_IDS') return new Set(selector.membershipIds)
  const rows = selector.match === 'ANY'
    ? await tx.$queryRaw<Array<{ membershipId: string }>>`
        SELECT DISTINCT a."membership_id" AS "membershipId"
        FROM "organization_label_assignments" a
        JOIN "organization_memberships" m
          ON m."organization_id" = a."organization_id" AND m."id" = a."membership_id"
        WHERE a."organization_id" = ${organizationId}
          AND a."valid_until" IS NULL AND m."valid_until" IS NULL
          AND a."label_id" IN (${Prisma.join(selector.labelIds)})
      `
    : await tx.$queryRaw<Array<{ membershipId: string }>>`
        SELECT a."membership_id" AS "membershipId"
        FROM "organization_label_assignments" a
        JOIN "organization_memberships" m
          ON m."organization_id" = a."organization_id" AND m."id" = a."membership_id"
        WHERE a."organization_id" = ${organizationId}
          AND a."valid_until" IS NULL AND m."valid_until" IS NULL
          AND a."label_id" IN (${Prisma.join(selector.labelIds)})
        GROUP BY a."membership_id"
        HAVING COUNT(DISTINCT a."label_id") = ${selector.labelIds.length}
      `
  return new Set(rows.map((row) => row.membershipId))
}

const selectorAllows = (
  selector: RunPopulationSelectorV1,
  membershipFilter: Set<string> | null,
  actor: PairActor,
  pair: PopulationPair,
): boolean => {
  if (selector.kind === 'RELATED_PARENT') return actor.actorRole === 'PARENT'
  if (actor.provenanceKind !== 'ORG_MEMBER') return false
  if (membershipFilter && !membershipFilter.has(actor.membershipId)) return false
  if (selector.kind === 'CLASS_UNITS') return pair.scopeClassUnitIds.some((id) => selector.classUnitIds.includes(id))
  return true
}

const resolveSelfPairs = async (tx: Tx, organizationId: string, role: Exclude<RunActorRole, 'PARENT'>): Promise<PopulationPair[]> => {
  const rows = await tx.$queryRaw<Array<{ userId: string; membershipId: string; personaGrantId: string; classUnitId: string | null }>>`
    SELECT m."user_id" AS "userId", m."id" AS "membershipId", pg."id" AS "personaGrantId",
      sc."class_unit_id" AS "classUnitId"
    FROM "organization_memberships" m
    JOIN "organization_persona_grants" pg
      ON pg."organization_id" = m."organization_id" AND pg."membership_id" = m."id"
      AND pg."persona" = ${role} AND pg."revoked_at" IS NULL
    LEFT JOIN "organization_student_class_assignments" sc
      ON sc."organization_id" = m."organization_id" AND sc."membership_id" = m."id"
      AND sc."valid_until" IS NULL
    WHERE m."organization_id" = ${organizationId} AND m."valid_until" IS NULL
    ORDER BY m."id", sc."class_unit_id" NULLS LAST
  `
  const byMembership = new Map<string, PopulationPair>()
  for (const row of rows) {
    const existing = byMembership.get(row.membershipId)
    if (existing) {
      if (row.classUnitId && !existing.scopeClassUnitIds.includes(row.classUnitId)) existing.scopeClassUnitIds.push(row.classUnitId)
      continue
    }
    const actor = actorFromMember(row, role)
    byMembership.set(row.membershipId, {
      subject: actor,
      respondent: actor,
      relationshipKind: 'SELF',
      relationshipRef: null,
      scopeClassUnitIds: row.classUnitId ? [row.classUnitId] : [],
      facts: { source: 'organization-membership-self' },
    })
  }
  return [...byMembership.values()]
}

const resolveParentSelfPairs = async (tx: Tx, organizationId: string): Promise<PopulationPair[]> => {
  const rows = await tx.$queryRaw<Array<{
    parentUserId: string
    relationshipId: string
    classUnitId: string | null
  }>>`
    SELECT r."parent_user_id" AS "parentUserId", r."id" AS "relationshipId",
      sc."class_unit_id" AS "classUnitId"
    FROM "parent_student_relationships" r
    JOIN "organization_memberships" m
      ON m."organization_id" = ${organizationId}
      AND m."user_id" = r."student_user_id"
      AND m."valid_until" IS NULL
    JOIN "organization_persona_grants" pg
      ON pg."organization_id" = m."organization_id"
      AND pg."membership_id" = m."id"
      AND pg."persona" = 'STUDENT'
      AND pg."revoked_at" IS NULL
    LEFT JOIN "organization_student_class_assignments" sc
      ON sc."organization_id" = m."organization_id"
      AND sc."membership_id" = m."id"
      AND sc."valid_until" IS NULL
    WHERE r."status" = 'ACTIVE' AND r."approved_at" IS NOT NULL
    ORDER BY r."parent_user_id", r."id", sc."class_unit_id" NULLS LAST
  `
  const byParent = new Map<string, PopulationPair>()
  for (const row of rows) {
    const existing = byParent.get(row.parentUserId)
    if (existing) {
      if (row.classUnitId && !existing.scopeClassUnitIds.includes(row.classUnitId)) existing.scopeClassUnitIds.push(row.classUnitId)
      continue
    }
    const parent: FrozenParentActor = {
      provenanceKind: 'EXTERNAL_PARENT',
      userId: row.parentUserId,
      membershipId: null,
      actorRole: 'PARENT',
      parentRelationshipId: row.relationshipId,
    }
    byParent.set(row.parentUserId, {
      subject: parent,
      respondent: parent,
      relationshipKind: 'SELF',
      relationshipRef: null,
      scopeClassUnitIds: row.classUnitId ? [row.classUnitId] : [],
      facts: {
        source: 'active-parent-relationship-self',
        parentOrganizationRelationshipId: row.relationshipId,
      },
    })
  }
  return [...byParent.values()]
}

const resolveClassPairs = async (tx: Tx, organizationId: string, subjectRole: RunActorRole, respondentRole: RunActorRole): Promise<PopulationPair[]> => {
  if (!new Set([subjectRole, respondentRole]).has('TEACHER') || !new Set([subjectRole, respondentRole]).has('STUDENT')) {
    throw new RunPublishError('RUN_RELATIONSHIP_ROLE', 'CLASS_TEACHER_STUDENT requires TEACHER + STUDENT', 409)
  }
  const rows = await tx.$queryRaw<Array<{
    studentUserId: string; studentMembershipId: string; studentPersonaGrantId: string; studentAssignmentId: string
    teacherUserId: string; teacherMembershipId: string; teacherPersonaGrantId: string; staffAssignmentId: string
    classUnitId: string; staffRole: string
  }>>`
    SELECT sm."user_id" AS "studentUserId", sm."id" AS "studentMembershipId", sp."id" AS "studentPersonaGrantId",
      sc."id" AS "studentAssignmentId", tm."user_id" AS "teacherUserId", tm."id" AS "teacherMembershipId",
      tp."id" AS "teacherPersonaGrantId", sa."id" AS "staffAssignmentId", sa."staff_role" AS "staffRole", sc."class_unit_id" AS "classUnitId"
    FROM "organization_student_class_assignments" sc
    JOIN "organization_staff_class_assignments" sa
      ON sa."organization_id" = sc."organization_id" AND sa."class_unit_id" = sc."class_unit_id" AND sa."valid_until" IS NULL
    JOIN "organization_memberships" sm
      ON sm."organization_id" = sc."organization_id" AND sm."id" = sc."membership_id" AND sm."valid_until" IS NULL
    JOIN "organization_memberships" tm
      ON tm."organization_id" = sa."organization_id" AND tm."id" = sa."membership_id" AND tm."valid_until" IS NULL
    JOIN "organization_persona_grants" sp
      ON sp."organization_id" = sm."organization_id" AND sp."membership_id" = sm."id" AND sp."persona" = 'STUDENT' AND sp."revoked_at" IS NULL
    JOIN "organization_persona_grants" tp
      ON tp."organization_id" = tm."organization_id" AND tp."membership_id" = tm."id" AND tp."persona" = 'TEACHER' AND tp."revoked_at" IS NULL
    WHERE sc."organization_id" = ${organizationId} AND sc."valid_until" IS NULL
  `
  return rows.map((row) => {
    const student = actorFromMember({ userId: row.studentUserId, membershipId: row.studentMembershipId, personaGrantId: row.studentPersonaGrantId }, 'STUDENT')
    const teacher = actorFromMember({ userId: row.teacherUserId, membershipId: row.teacherMembershipId, personaGrantId: row.teacherPersonaGrantId }, 'TEACHER')
    return {
      subject: subjectRole === 'STUDENT' ? student : teacher,
      respondent: respondentRole === 'STUDENT' ? student : teacher,
      relationshipKind: 'CLASS_TEACHER_STUDENT' as const,
      relationshipRef: `class:${row.classUnitId}:student:${row.studentAssignmentId}:staff:${row.staffAssignmentId}`,
      scopeClassUnitIds: [row.classUnitId],
      facts: { staffRole: row.staffRole, classUnitId: row.classUnitId, studentClassAssignmentId: row.studentAssignmentId, staffClassAssignmentId: row.staffAssignmentId },
    }
  })
}

const resolveCounselorPairs = async (tx: Tx, organizationId: string, subjectRole: RunActorRole, respondentRole: RunActorRole): Promise<PopulationPair[]> => {
  const roles = new Set([subjectRole, respondentRole])
  if (!(roles.has('COUNSELOR') && roles.has('CLIENT'))) throw new RunPublishError('RUN_RELATIONSHIP_ROLE', 'COUNSELOR_CLIENT requires COUNSELOR + CLIENT', 409)
  const rows = await tx.$queryRaw<Array<{
    relationshipId: string
    counselorUserId: string; counselorMembershipId: string; counselorPersonaGrantId: string
    clientUserId: string; clientMembershipId: string; clientPersonaGrantId: string
  }>>`
    SELECT r."id" AS "relationshipId", cm."user_id" AS "counselorUserId", cm."id" AS "counselorMembershipId",
      cp."id" AS "counselorPersonaGrantId", lm."user_id" AS "clientUserId", lm."id" AS "clientMembershipId",
      lp."id" AS "clientPersonaGrantId"
    FROM "organization_counselor_client_relationships" r
    JOIN "organization_memberships" cm
      ON cm."organization_id" = r."organization_id" AND cm."id" = r."counselor_membership_id" AND cm."valid_until" IS NULL
    JOIN "organization_memberships" lm
      ON lm."organization_id" = r."organization_id" AND lm."id" = r."client_membership_id" AND lm."valid_until" IS NULL
    JOIN "organization_persona_grants" cp
      ON cp."organization_id" = cm."organization_id" AND cp."membership_id" = cm."id" AND cp."persona" = 'COUNSELOR' AND cp."revoked_at" IS NULL
    JOIN "organization_persona_grants" lp
      ON lp."organization_id" = lm."organization_id" AND lp."membership_id" = lm."id" AND lp."persona" = 'CLIENT' AND lp."revoked_at" IS NULL
    WHERE r."organization_id" = ${organizationId} AND r."valid_until" IS NULL
  `
  return rows.map((row) => {
    const counselor = actorFromMember({ userId: row.counselorUserId, membershipId: row.counselorMembershipId, personaGrantId: row.counselorPersonaGrantId }, 'COUNSELOR')
    const client = actorFromMember({ userId: row.clientUserId, membershipId: row.clientMembershipId, personaGrantId: row.clientPersonaGrantId }, 'CLIENT')
    return {
      subject: subjectRole === 'COUNSELOR' ? counselor : client,
      respondent: respondentRole === 'COUNSELOR' ? counselor : client,
      relationshipKind: 'COUNSELOR_CLIENT' as const,
      relationshipRef: row.relationshipId,
      scopeClassUnitIds: [],
      facts: { counselorClientRelationshipId: row.relationshipId },
    }
  })
}

const resolveParentPairs = async (tx: Tx, organizationId: string, subjectRole: RunActorRole, respondentRole: RunActorRole): Promise<PopulationPair[]> => {
  const roles = new Set([subjectRole, respondentRole])
  if (!(roles.has('PARENT') && roles.has('STUDENT'))) throw new RunPublishError('RUN_RELATIONSHIP_ROLE', 'PARENT_CHILD requires PARENT + STUDENT', 409)
  const rows = await tx.$queryRaw<Array<{
    relationshipId: string; parentUserId: string; studentUserId: string
    studentMembershipId: string; studentPersonaGrantId: string; classUnitId: string | null
  }>>`
    SELECT r."id" AS "relationshipId", r."parent_user_id" AS "parentUserId", r."student_user_id" AS "studentUserId",
      m."id" AS "studentMembershipId", pg."id" AS "studentPersonaGrantId", sc."class_unit_id" AS "classUnitId"
    FROM "parent_student_relationships" r
    JOIN "organization_memberships" m
      ON m."organization_id" = ${organizationId} AND m."user_id" = r."student_user_id" AND m."valid_until" IS NULL
    JOIN "organization_persona_grants" pg
      ON pg."organization_id" = m."organization_id" AND pg."membership_id" = m."id" AND pg."persona" = 'STUDENT' AND pg."revoked_at" IS NULL
    LEFT JOIN "organization_student_class_assignments" sc
      ON sc."organization_id" = m."organization_id" AND sc."membership_id" = m."id" AND sc."valid_until" IS NULL
    WHERE r."status" = 'ACTIVE' AND r."approved_at" IS NOT NULL
  `
  const seen = new Set<string>()
  const pairs: PopulationPair[] = []
  for (const row of rows) {
    const key = `${row.relationshipId}:${row.studentMembershipId}`
    const existing = pairs.find((pair) => pair.relationshipRef === row.relationshipId && pair.facts.studentMembershipId === row.studentMembershipId)
    if (existing) {
      if (row.classUnitId && !existing.scopeClassUnitIds.includes(row.classUnitId)) existing.scopeClassUnitIds.push(row.classUnitId)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    const student = actorFromMember({ userId: row.studentUserId, membershipId: row.studentMembershipId, personaGrantId: row.studentPersonaGrantId }, 'STUDENT')
    const parent: FrozenParentActor = { provenanceKind: 'EXTERNAL_PARENT', userId: row.parentUserId, membershipId: null, actorRole: 'PARENT', parentRelationshipId: row.relationshipId }
    pairs.push({
      subject: subjectRole === 'STUDENT' ? student : parent,
      respondent: respondentRole === 'STUDENT' ? student : parent,
      relationshipKind: 'PARENT_CHILD',
      relationshipRef: row.relationshipId,
      scopeClassUnitIds: row.classUnitId ? [row.classUnitId] : [],
      facts: { parentStudentRelationshipId: row.relationshipId, studentMembershipId: row.studentMembershipId },
    })
  }
  return pairs
}

const resolvePairs = async (tx: Tx, organizationId: string, track: PreparedTrack): Promise<PopulationPair[]> => {
  const subjectRole = requireSingle(track.requestedPolicy.subjectRoles, 'subjectRoles') as RunActorRole
  const respondentRole = requireSingle(track.requestedPolicy.respondentRoles, 'respondentRoles') as RunActorRole
  const relationshipKind = requireSingle(track.requestedPolicy.relationshipKinds, 'relationshipKinds') as RelationalRelationshipKindV1
  let pairs: PopulationPair[]
  if (relationshipKind === 'SELF') {
    if (subjectRole !== respondentRole) throw new RunPublishError('RUN_RELATIONSHIP_ROLE', 'SELF requires the same actor role', 409)
    pairs = subjectRole === 'PARENT'
      ? await resolveParentSelfPairs(tx, organizationId)
      : await resolveSelfPairs(tx, organizationId, subjectRole as Exclude<RunActorRole, 'PARENT'>)
  } else if (relationshipKind === 'CLASS_TEACHER_STUDENT' || relationshipKind === 'COURSE_TEACHER_STUDENT') {
    pairs = await resolveClassPairs(tx, organizationId, subjectRole, respondentRole)
    const target = track.requestedPolicy.targetPolicy
    if (target?.mode === 'COURSE_TEACHER') {
      const course = await tx.course.findUnique({ where: { id: target.courseId! }, select: { creatorId: true, status: true, endedAt: true, students: { where: { status: { in: ['ACTIVE', 'APPROVED'] } }, select: { studentId: true } } } })
      const students = new Set(course?.students.map(student => student.studentId) ?? [])
      pairs = !course || course.status !== 'PUBLISHED' || course.endedAt ? [] : pairs.filter(pair => pair.subject.userId === course.creatorId && students.has(pair.respondent.userId)).map(pair => ({ ...pair, facts: { ...pair.facts, courseId: target.courseId! } }))
    } else if (target) pairs = pairs.filter(pair => pair.subject.provenanceKind === 'ORG_MEMBER'
      && matchesClassTarget(target, pair.subject.membershipId, String(pair.facts.staffRole)))
    if (relationshipKind === 'COURSE_TEACHER_STUDENT') {
      const courses = await tx.course.findMany({ where: { status: 'PUBLISHED', endedAt: null, isLibrary: false,
        ...(target?.mode === 'COURSE_TEACHER' ? { id: target.courseId } : {}) },
        select: { id: true, creatorId: true, students: { where: { status: { in: ['ACTIVE', 'APPROVED'] } }, select: { studentId: true } } } })
      pairs = pairs.flatMap(pair => courses.filter(course => {
        const teacher = pair.subject.actorRole === 'TEACHER' ? pair.subject : pair.respondent
        const student = pair.subject.actorRole === 'STUDENT' ? pair.subject : pair.respondent
        return course.creatorId === teacher.userId && course.students.some(member => member.studentId === student.userId)
      }).map(course => ({ ...pair, relationshipKind: 'COURSE_TEACHER_STUDENT' as const, relationshipRef: course.id, facts: { ...pair.facts, courseId: course.id } })))
    }
  } else if (relationshipKind === 'COUNSELOR_CLIENT') {
    pairs = await resolveCounselorPairs(tx, organizationId, subjectRole, respondentRole)
  } else if (relationshipKind === 'PARENT_CHILD') {
    pairs = await resolveParentPairs(tx, organizationId, subjectRole, respondentRole)
  } else {
    throw new RunPublishError('RUN_RELATIONSHIP_UNSUPPORTED', 'COURSE_TEACHER_STUDENT remains legacy-only for Organization Run', 409)
  }

  const [subjectFilter, respondentFilter] = await Promise.all([
    selectorMembershipFilter(tx, organizationId, track.subjectSelector),
    selectorMembershipFilter(tx, organizationId, track.respondentSelector),
  ])
  pairs = pairs.filter((pair) => (
    selectorAllows(track.subjectSelector, subjectFilter, pair.subject, pair)
    && selectorAllows(track.respondentSelector, respondentFilter, pair.respondent, pair)
  ))
  const unique = new Map<string, PopulationPair>()
  for (const pair of pairs) {
    const key = `${pair.subject.userId}:${pair.subject.membershipId ?? pair.relationshipRef}:${pair.respondent.userId}:${pair.respondent.membershipId ?? pair.relationshipRef}`
    if (!unique.has(key)) unique.set(key, pair)
  }
  return [...unique.values()]
}

const loadPublisherAuthority = async (tx: Tx, organizationId: string, actorUserId: string): Promise<PublisherAuthority> => {
  const accountRows = await tx.$queryRaw<Array<{ usable: boolean }>>`
    SELECT (
      u."is_active" = TRUE AND u."is_frozen" = FALSE AND u."must_change_password" = FALSE
      AND (u."expires_at" IS NULL OR u."expires_at" > transaction_timestamp())
      AND (u."role" <> 'TEACHER' OR u."teacher_approved" = TRUE)
    ) AS "usable"
    FROM "users" u WHERE u."id" = ${actorUserId}
  `
  if (!accountRows[0]?.usable) throw new RunPublishError('AUTHORITY_REVOKED', 'publisher account is not usable', 403)
  const deny = await tx.$queryRaw<Array<{ permission: string }>>`
    SELECT "permission" FROM "organization_access_denies"
    WHERE "organization_id" = ${organizationId} AND "user_id" = ${actorUserId} AND "lifted_at" IS NULL
  `
  if (deny.some((row) => ['*', 'ORGANIZATION_GOVERNANCE', 'ASSESSMENT_DELIVERY', 'ASSESSMENT_RUN_PUBLISH', 'RUN_PUBLISH'].includes(row.permission))) {
    throw new RunPublishError('AUTHORITY_REVOKED', 'publisher is explicitly denied', 403)
  }
  const memberships = await tx.$queryRaw<Array<{ id: string; orgRole: string }>>`
    SELECT "id", "org_role" AS "orgRole" FROM "organization_memberships"
    WHERE "organization_id" = ${organizationId} AND "user_id" = ${actorUserId} AND "valid_until" IS NULL
    FOR SHARE
  `
  const membership = memberships[0]
  if (!membership) throw new RunPublishError('RUN_PUBLISH_FORBIDDEN', 'Organization Run publishing requires current Organization membership', 403)
  const personas = await tx.$queryRaw<Array<{ persona: string }>>`
    SELECT "persona" FROM "organization_persona_grants"
    WHERE "organization_id" = ${organizationId} AND "membership_id" = ${membership.id} AND "revoked_at" IS NULL
  `
  const teacherPersona = personas.some((row) => row.persona === 'TEACHER')
  const counselorPersona = personas.some((row) => row.persona === 'COUNSELOR')
  const teacherRows = teacherPersona ? await tx.$queryRaw<Array<{ classUnitId: string; studentMembershipId: string }>>`
    SELECT DISTINCT sa."class_unit_id" AS "classUnitId", sc."membership_id" AS "studentMembershipId"
    FROM "organization_staff_class_assignments" sa
    LEFT JOIN "organization_student_class_assignments" sc
      ON sc."organization_id" = sa."organization_id" AND sc."class_unit_id" = sa."class_unit_id" AND sc."valid_until" IS NULL
    WHERE sa."organization_id" = ${organizationId}
      AND sa."membership_id" = ${membership.id}
      AND ${currentClassDeliverySql}
  ` : []
  const clientRows = counselorPersona ? await tx.$queryRaw<Array<{ clientMembershipId: string }>>`
    SELECT "client_membership_id" AS "clientMembershipId"
    FROM "organization_counselor_client_relationships"
    WHERE "organization_id" = ${organizationId} AND "counselor_membership_id" = ${membership.id} AND "valid_until" IS NULL
  ` : []
  const authority = {
    membershipId: membership.id,
    isOrgAdmin: membership.orgRole === 'ORG_ADMIN',
    teacherPersona: teacherPersona && teacherRows.length > 0,
    counselorPersona: counselorPersona && clientRows.length > 0,
    teacherClassIds: new Set(teacherRows.map((row) => row.classUnitId)),
    teacherStudentMembershipIds: new Set(teacherRows.map((row) => row.studentMembershipId).filter(Boolean)),
    counselorClientMembershipIds: new Set(clientRows.map((row) => row.clientMembershipId)),
  }
  if (!authority.isOrgAdmin && !authority.teacherPersona && !authority.counselorPersona) {
    throw new RunPublishError('RUN_PUBLISH_FORBIDDEN', 'publisher requires ORG_ADMIN, TEACHER, or COUNSELOR authority', 403)
  }
  return authority
}

const assertPublisherScope = (authority: PublisherAuthority, actorUserId: string, pair: PopulationPair, policy?: RunResourcePolicy): void => {
  if (policy?.initiationModes) {
    const modes = policy.initiationModes
    const permitted = authority.isOrgAdmin ? modes.includes('ORG_ASSIGN') : (authority.teacherPersona && modes.includes('CLASS_ASSIGN')) || (authority.counselorPersona && modes.includes('PROFESSIONAL_ASSIGN'))
    if (!permitted) throw new RunPublishError('RUN_INITIATION_FORBIDDEN', 'Content policy does not permit this delivery authority', 403)
  }
  if (authority.isOrgAdmin) return
  let allowed = false
  if (authority.teacherPersona) {
    if (pair.relationshipKind === 'SELF') {
      const member = pair.subject.provenanceKind === 'ORG_MEMBER' ? pair.subject : null
      const parent = pair.subject.provenanceKind === 'EXTERNAL_PARENT' ? pair.subject : null
      allowed = Boolean(
        (member && (
          (member.actorRole === 'TEACHER' && member.userId === actorUserId)
          || (member.actorRole === 'STUDENT' && authority.teacherStudentMembershipIds.has(member.membershipId))
        ))
        || (parent && pair.scopeClassUnitIds.some((id) => authority.teacherClassIds.has(id)))
      )
    } else if ((pair.relationshipKind === 'CLASS_TEACHER_STUDENT' || pair.relationshipKind === 'COURSE_TEACHER_STUDENT')) {
      allowed = pair.scopeClassUnitIds.some((id) => authority.teacherClassIds.has(id))
    } else if (pair.relationshipKind === 'PARENT_CHILD') {
      const student = pair.subject.actorRole === 'STUDENT' ? pair.subject : pair.respondent
      allowed = student.provenanceKind === 'ORG_MEMBER' && authority.teacherStudentMembershipIds.has(student.membershipId)
    }
  }
  if (!allowed && authority.counselorPersona) {
    if (pair.relationshipKind === 'SELF') {
      const member = pair.subject.provenanceKind === 'ORG_MEMBER' ? pair.subject : null
      allowed = Boolean(member && (
        (member.actorRole === 'COUNSELOR' && member.userId === actorUserId)
        || (member.actorRole === 'CLIENT' && authority.counselorClientMembershipIds.has(member.membershipId))
      ))
    } else if (pair.relationshipKind === 'COUNSELOR_CLIENT') {
      const counselor = pair.subject.actorRole === 'COUNSELOR' ? pair.subject : pair.respondent
      const client = pair.subject.actorRole === 'CLIENT' ? pair.subject : pair.respondent
      allowed = counselor.userId === actorUserId && client.provenanceKind === 'ORG_MEMBER' && authority.counselorClientMembershipIds.has(client.membershipId)
    }
  }
  if (!allowed) throw new RunPublishError('RUN_PUBLISH_SCOPE', 'publisher scope does not cover frozen assignment population', 403)
}

const actorCacheKey = (actor: PairActor): string => actor.provenanceKind === 'ORG_MEMBER'
  ? `member:${actor.membershipId}:${actor.actorRole}`
  : `parent:${actor.userId}:${actor.parentRelationshipId}`

const persistActor = async (tx: Tx, input: { organizationId: string; runId: string; actor: PairActor; cache: Map<string, string> }): Promise<string> => {
  const key = actorCacheKey(input.actor)
  const existing = input.cache.get(key)
  if (existing) return existing
  const payload = input.actor.provenanceKind === 'ORG_MEMBER'
    ? { schemaVersion: 1, provenanceKind: 'ORG_MEMBER', userId: input.actor.userId, membershipId: input.actor.membershipId, actorRole: input.actor.actorRole, personaGrantId: input.actor.personaGrantId }
    : { schemaVersion: 1, provenanceKind: 'EXTERNAL_PARENT', userId: input.actor.userId, actorRole: 'PARENT', parentStudentRelationshipId: input.actor.parentRelationshipId }
  const snapshot = await insertRunActorSnapshot(tx, {
    organizationId: input.organizationId,
    runId: input.runId,
    provenanceKind: input.actor.provenanceKind,
    userId: input.actor.userId,
    membershipId: input.actor.membershipId,
    actorRole: input.actor.actorRole,
    externalRelationshipRef: input.actor.provenanceKind === 'EXTERNAL_PARENT' ? input.actor.parentRelationshipId : null,
    snapshotPayload: payload,
  })
  input.cache.set(key, snapshot.id)
  return snapshot.id
}

const insertOrganizationAssignment = async (tx: Tx, input: {
  episodeId: string
  subject: PairActor
  respondent: PairActor
  createdByUserId: string
  relationshipSnapshot: RelationalRelationshipSnapshotV1
  relationshipSnapshotHash: string
  perspective: string
  track: PreparedTrack
}): Promise<string> => {
  const consentId = await createRunPendingConsent(tx, {
    subjectUserId: input.subject.userId, respondentUserId: input.respondent.userId,
    perspective: input.perspective, respondentRole: input.respondent.actorRole, createdByUserId: input.createdByUserId,
    visibilityPolicyKey: input.track.requestedPolicy.visibilityPolicyKey,
    resourceKind: input.track.resourceFamily, resourceKey: input.track.resourceKey, resourceVersion: input.track.resourceVersion,
  })
  const assignmentId = randomUUID()
  const snapshotJson = JSON.stringify(input.relationshipSnapshot)
  await tx.$executeRaw`
    INSERT INTO "relational_assessment_assignments" (
      "id", "episode_id", "subject_user_id", "subject_role", "respondent_user_id", "respondent_role",
      "created_by_user_id", "relationship_kind", "relationship_ref", "relationship_snapshot_json",
      "relationship_snapshot_hash", "perspective", "resource_kind", "resource_key", "resource_version",
      "applicability_hash", "analysis_mode", "minimum_respondents", "consent_id", "visibility_policy_key",
      "policy_domain", "status", "updated_at"
    ) VALUES (
      ${assignmentId}, ${input.episodeId}, ${input.subject.userId}, ${input.subject.actorRole},
      ${input.respondent.userId}, ${input.respondent.actorRole}, ${input.createdByUserId},
      ${input.relationshipSnapshot.relationshipKind}, ${input.relationshipSnapshot.relationshipRef}, ${snapshotJson}::jsonb,
      ${input.relationshipSnapshotHash}, ${input.perspective}, ${input.track.resourceFamily}, ${input.track.resourceKey},
      ${input.track.resourceVersion}, ${input.track.resourcePolicy.applicabilityHash}, ${input.track.requestedPolicy.analysisMode},
      ${input.track.requestedPolicy.minimumRespondents}, ${consentId}, ${input.track.requestedPolicy.visibilityPolicyKey},
      'ORGANIZATION_RUN', 'OPEN', transaction_timestamp()
    )
  `
  return assignmentId
}

export interface PublishedRunResult {
  runId: string
  version: number
  trackCount: number
  executionCount: number
}

export const publishAssessmentRun = async (input: {
  organizationId: string
  runId: string
  actorUserId: string
  expectedVersion: number
  resourceRegistry?: RunResourceAuthorityRegistry
}): Promise<PublishedRunResult> => {
  const registry = input.resourceRegistry ?? productionRunResourceAuthorityRegistry
  const preparedTracks = await prepareTracks(input.runId, input.organizationId, registry)
  const preparedIdentity = canonicalHash(preparedTracks.map((track) => ({
    id: track.id,
    resourceFamily: track.resourceFamily,
    resourceKey: track.resourceKey,
    resourceVersion: track.resourceVersion,
    subjectSelector: track.subjectSelector,
    respondentSelector: track.respondentSelector,
    requestedPolicy: track.requestedPolicy,
    resourcePolicy: track.resourcePolicy,
  })))

  return prisma.$transaction(async (tx) => {
    const organizations = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "organizations" WHERE "id" = ${input.organizationId} FOR UPDATE
    `
    if (!organizations[0]) throw new RunPublishError('ORG_NOT_FOUND', 'Organization not found', 404)
    if (organizations[0].status !== 'ACTIVE') throw new RunPublishError('ORGANIZATION_SUSPENDED', 'Organization is suspended', 409)
    const runs = await tx.$queryRaw<Array<{ status: string; version: number; createdByUserId: string }>>`
      SELECT "status", "version", "created_by_user_id" AS "createdByUserId" FROM "assessment_runs"
      WHERE "organization_id" = ${input.organizationId} AND "id" = ${input.runId} FOR UPDATE
    `
    const run = runs[0]
    if (!run) throw new RunPublishError('RUN_NOT_FOUND', 'Run not found', 404)
    const denies = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "organization_access_denies" WHERE "organization_id" = ${input.organizationId}
        AND "user_id" = ${input.actorUserId} AND "lifted_at" IS NULL
        AND "permission" IN ('*', 'ORGANIZATION_GOVERNANCE', 'ASSESSMENT_DELIVERY', 'ASSESSMENT_RUN_PUBLISH', 'RUN_PUBLISH')
    `
    if (denies.length) throw new RunPublishError('RUN_PUBLISH_FORBIDDEN', 'explicit deny prevents Run publication', 403)
    const authority = await loadPublisherAuthority(tx, input.organizationId, input.actorUserId)
    if (!authority.isOrgAdmin && run.createdByUserId !== input.actorUserId) {
      throw new RunPublishError('RUN_PUBLISH_FORBIDDEN', 'scoped professionals may publish only their own assessment campaigns', 403)
    }
    if (run.status === 'PUBLISHED') {
      const countRows = await tx.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS "count" FROM "assessment_run_executions" WHERE "run_id" = ${input.runId}
      `
      return { runId: input.runId, version: run.version, trackCount: preparedTracks.length, executionCount: countRows[0]?.count ?? 0 }
    }
    if (run.status !== 'DRAFT' || run.version !== input.expectedVersion) {
      throw new RunPublishError('RUN_STATE_CONFLICT', 'Run state/version changed before publish ownership', 409)
    }

    const currentTrackRows = await tx.$queryRaw<Array<{
      id: string; resourceFamily: string; resourceKey: string; resourceVersion: string
      subjectSelector: unknown; respondentSelector: unknown; requestedPolicy: RunTrackNarrowingRequest
    }>>`
      SELECT "id", "resource_family" AS "resourceFamily", "resource_key" AS "resourceKey", "resource_version" AS "resourceVersion",
        "subject_selector" AS "subjectSelector", "respondent_selector" AS "respondentSelector", "requested_policy" AS "requestedPolicy"
      FROM "assessment_run_tracks"
      WHERE "organization_id" = ${input.organizationId} AND "run_id" = ${input.runId}
      ORDER BY "created_at", "id" FOR UPDATE
    `
    const currentIdentity = canonicalHash(currentTrackRows.map((track, index) => ({
      id: track.id,
      resourceFamily: track.resourceFamily,
      resourceKey: track.resourceKey,
      resourceVersion: track.resourceVersion,
      subjectSelector: parseSelector(track.subjectSelector),
      respondentSelector: parseSelector(track.respondentSelector),
      requestedPolicy: track.requestedPolicy,
      resourcePolicy: preparedTracks[index]?.resourcePolicy,
    })))
    if (currentIdentity !== preparedIdentity || currentTrackRows.length !== preparedTracks.length) {
      throw new RunPublishError('RUN_STATE_CONFLICT', 'Run Tracks changed while resource authority was being resolved', 409)
    }

    const timeRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT transaction_timestamp() AS "now"`
    const verifiedAt = timeRows[0].now.toISOString()
    const actorCache = new Map<string, string>()
    let executionCount = 0

    for (const track of preparedTracks) {
      const frozenPolicyJson = JSON.stringify(track.resourcePolicy)
      const policyHash = canonicalHash(track.resourcePolicy)
      await tx.$executeRaw`
        UPDATE "assessment_run_tracks"
        SET "frozen_resource_policy" = ${frozenPolicyJson}::jsonb, "resource_policy_hash" = ${policyHash}
        WHERE "id" = ${track.id} AND "run_id" = ${input.runId}
      `
      const pairs = await resolvePairs(tx, input.organizationId, track)
      if (pairs.length === 0) throw new RunPublishError('RUN_EMPTY_POPULATION', `Track ${track.id} resolved no eligible actor pairs`, 409)
      const perspective = requireSingle(track.requestedPolicy.perspectives, 'perspectives')
      for (const pair of pairs) {
        assertPublisherScope(authority, input.actorUserId, pair, track.resourcePolicy)
        const subjectActorSnapshotId = await persistActor(tx, { organizationId: input.organizationId, runId: input.runId, actor: pair.subject, cache: actorCache })
        const respondentActorSnapshotId = await persistActor(tx, { organizationId: input.organizationId, runId: input.runId, actor: pair.respondent, cache: actorCache })
        const relationalSnapshot = validateOrganizationRelationalSnapshot({
          schemaVersion: 1,
          relationshipKind: pair.relationshipKind,
          relationshipRef: pair.relationshipRef,
          subjectUserId: pair.subject.userId,
          subjectRole: pair.subject.actorRole as RelationalActorRoleV1,
          respondentUserId: pair.respondent.userId,
          respondentRole: pair.respondent.actorRole as RelationalActorRoleV1,
          courseId: pair.relationshipKind === 'COURSE_TEACHER_STUDENT' ? String(pair.facts.courseId) : null,
          verifiedAt,
          facts: pair.facts,
        })
        const relationshipSnapshotHash = canonicalHash({ schema: 'RelationalRelationshipSnapshotV1', snapshot: relationalSnapshot })
        const runRelationship = await insertRunRelationshipSnapshot(tx, {
          organizationId: input.organizationId,
          runId: input.runId,
          relationshipKind: pair.relationshipKind,
          relationshipRef: pair.relationshipRef,
          subjectActorSnapshotId,
          respondentActorSnapshotId,
          snapshotPayload: relationalSnapshot,
        })
        const allocation = await getOrCreateOrganizationEpisodeAllocationInTransaction(tx, {
          organizationId: input.organizationId,
          runId: input.runId,
          trackId: track.id,
          subjectActorSnapshotId,
          initiatedByUserId: input.actorUserId,
          label: `Organization Run ${input.runId}`,
        })
        const assignmentId = await insertOrganizationAssignment(tx, {
          episodeId: allocation.assessmentEpisodeId,
          subject: pair.subject,
          respondent: pair.respondent,
          createdByUserId: input.actorUserId,
          relationshipSnapshot: relationalSnapshot,
          relationshipSnapshotHash,
          perspective,
          track,
        })
        await insertRunExecution(tx, {
          organizationId: input.organizationId,
          runId: input.runId,
          trackId: track.id,
          subjectActorSnapshotId,
          respondentActorSnapshotId,
          relationshipSnapshotId: runRelationship.id,
          relationalAssignmentId: assignmentId,
        })
        executionCount += 1
      }
    }

    const version = run.version + 1
    await tx.$executeRaw`
      UPDATE "assessment_runs"
      SET "status" = 'PUBLISHED', "published_at" = transaction_timestamp(), "version" = ${version}, "updated_at" = transaction_timestamp()
      WHERE "id" = ${input.runId} AND "status" = 'DRAFT' AND "version" = ${run.version}
    `
    const auditPayload = JSON.stringify({ runId: input.runId, version, trackCount: preparedTracks.length, executionCount })
    await tx.$executeRaw`
      INSERT INTO "organization_governance_audits" (
        "id", "organization_id", "actor_user_id", "action", "target_type", "target_id", "domain_event_id", "payload"
      ) VALUES (
        ${randomUUID()}, ${input.organizationId}, ${input.actorUserId}, 'ASSESSMENT_RUN_PUBLISHED', 'AssessmentRun',
        ${input.runId}, ${randomUUID()}, ${auditPayload}::jsonb
      )
    `
    return { runId: input.runId, version, trackCount: preparedTracks.length, executionCount }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

/** Advisory, write-free population preview; publish repeats every authority check. */
export const previewAssessmentRun = async (input: {
  organizationId: string; runId: string; actorUserId: string; expectedVersion: number;
  resourceRegistry?: RunResourceAuthorityRegistry;
}) => {
  const prepared = await prepareTracks(input.runId, input.organizationId, input.resourceRegistry ?? productionRunResourceAuthorityRegistry)
  return prisma.$transaction(async tx => {
    const organizations = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "organizations" WHERE "id" = ${input.organizationId} FOR SHARE
    `
    if (organizations[0]?.status !== 'ACTIVE') throw new RunPublishError('ORGANIZATION_SUSPENDED', 'Organization is not active', 409)
    const runs = await tx.$queryRaw<Array<{ status: string; version: number; createdByUserId: string }>>`
      SELECT "status", "version", "created_by_user_id" AS "createdByUserId"
      FROM "assessment_runs" WHERE "organization_id" = ${input.organizationId} AND "id" = ${input.runId} FOR SHARE
    `
    if (runs[0]?.status !== 'DRAFT' || runs[0]?.version !== input.expectedVersion) throw new RunPublishError('RUN_STATE_CONFLICT', 'Run changed; refresh before preview', 409)
    const denies = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "organization_access_denies" WHERE "organization_id" = ${input.organizationId}
        AND "user_id" = ${input.actorUserId} AND "lifted_at" IS NULL
        AND "permission" IN ('*', 'ORGANIZATION_GOVERNANCE', 'ASSESSMENT_DELIVERY', 'ASSESSMENT_RUN_PUBLISH', 'RUN_PUBLISH')
    `
    if (denies.length) throw new RunPublishError('RUN_PUBLISH_FORBIDDEN', 'explicit deny prevents Run preview', 403)
    const authority = await loadPublisherAuthority(tx, input.organizationId, input.actorUserId)
    if (!authority.isOrgAdmin && runs[0].createdByUserId !== input.actorUserId) {
      throw new RunPublishError('RUN_PUBLISH_FORBIDDEN', 'scoped professionals may preview only their own assessment campaigns', 403)
    }
    const tracks = []
    for (const track of prepared) {
      const pairs = await resolvePairs(tx, input.organizationId, track)
      if (pairs.length === 0) throw new RunPublishError('RUN_EMPTY_POPULATION', 'Track resolved no eligible actor pairs', 409)
      for (const pair of pairs) assertPublisherScope(authority, input.actorUserId, pair, track.resourcePolicy)
      tracks.push({ trackId: track.id, executionCount: pairs.length, subjectCount: new Set(pairs.map(pair => actorCacheKey(pair.subject))).size, respondentCount: new Set(pairs.map(pair => actorCacheKey(pair.respondent))).size, resourcePolicy: track.resourcePolicy })
    }
    return { runId: input.runId, version: input.expectedVersion, tracks }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
}
