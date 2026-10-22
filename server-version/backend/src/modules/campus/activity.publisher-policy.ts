/** Shape/policy intersection only. This does not authorize an actor: publish.ts
 * first resolves the current owner psychology permission, selected approved
 * school students and real, current relationship rows in the same transaction.
 * Never call this with request-provided actors or relationship facts. */
export type OwnSchoolActivityPair = {
  subject: { provenanceKind: string; actorRole: string; userId: string; membershipId: string | null }
  respondent: { provenanceKind: string; actorRole: string; userId: string; membershipId: string | null; parentRelationshipId?: string }
  relationshipKind: string
  relationshipRef: string | null
  facts: Record<string, string | boolean | null>
}

export function permitsOwnSchoolActivityPair(pair: OwnSchoolActivityPair, initiationModes?: readonly string[]): boolean {
  const { subject, respondent, facts } = pair
  if (subject.provenanceKind !== 'ORG_MEMBER' || subject.actorRole !== 'STUDENT'
    || !subject.membershipId || !subject.userId || !respondent.userId) return false
  if (pair.relationshipKind === 'SELF') return Boolean(initiationModes?.includes('CLASS_ASSIGN')
    && respondent.provenanceKind === 'ORG_MEMBER' && respondent.actorRole === 'STUDENT'
    && subject.membershipId === respondent.membershipId && subject.userId === respondent.userId)
  if (!initiationModes?.includes('RELATED_OBSERVER_ASSIGN') || subject.userId === respondent.userId) return false
  if (pair.relationshipKind === 'PARENT_CHILD') return Boolean(
    respondent.provenanceKind === 'EXTERNAL_PARENT' && respondent.actorRole === 'PARENT'
    && respondent.membershipId === null && pair.relationshipRef
    && respondent.parentRelationshipId === pair.relationshipRef
    && facts.parentStudentRelationshipId === pair.relationshipRef
    && facts.studentMembershipId === subject.membershipId)
  if (pair.relationshipKind === 'CLASS_TEACHER_STUDENT') return Boolean(
    respondent.provenanceKind === 'ORG_MEMBER' && respondent.actorRole === 'TEACHER' && respondent.membershipId
    && facts.staffRole === 'HOMEROOM' && !facts.courseId
    && typeof facts.classUnitId === 'string' && facts.classUnitId
    && typeof facts.studentClassAssignmentId === 'string' && facts.studentClassAssignmentId
    && typeof facts.staffClassAssignmentId === 'string' && facts.staffClassAssignmentId
    && pair.relationshipRef === `class:${facts.classUnitId}:student:${facts.studentClassAssignmentId}:staff:${facts.staffClassAssignmentId}`)
  return false
}
