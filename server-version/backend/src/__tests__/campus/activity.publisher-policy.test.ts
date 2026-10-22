import { describe, expect, it } from 'vitest'
import { permitsOwnSchoolActivityPair, type OwnSchoolActivityPair } from '../../modules/campus/activity.publisher-policy'

const student = { provenanceKind: 'ORG_MEMBER', actorRole: 'STUDENT', userId: 'student', membershipId: 'student-member' }
function pair(kind: 'SELF' | 'PARENT_CHILD' | 'CLASS_TEACHER_STUDENT'): OwnSchoolActivityPair {
  if (kind === 'SELF') return { subject: { ...student }, respondent: { ...student }, relationshipKind: kind, relationshipRef: null, facts: {} }
  if (kind === 'PARENT_CHILD') return { subject: { ...student }, respondent: { provenanceKind: 'EXTERNAL_PARENT', actorRole: 'PARENT', userId: 'parent', membershipId: null, parentRelationshipId: 'parent-link' }, relationshipKind: kind, relationshipRef: 'parent-link', facts: { parentStudentRelationshipId: 'parent-link', studentMembershipId: student.membershipId } }
  return { subject: { ...student }, respondent: { provenanceKind: 'ORG_MEMBER', actorRole: 'TEACHER', userId: 'teacher', membershipId: 'teacher-member' }, relationshipKind: kind, relationshipRef: 'class:class:student:student-assignment:staff:staff-assignment', facts: { staffRole: 'HOMEROOM', classUnitId: 'class', studentClassAssignmentId: 'student-assignment', staffClassAssignmentId: 'staff-assignment' } }
}
const modes = ['CLASS_ASSIGN', 'RELATED_OBSERVER_ASSIGN']
describe('Own School activity psychology publisher pair/policy intersection', () => {
  it.each(['SELF', 'PARENT_CHILD', 'CLASS_TEACHER_STUDENT'] as const)('allows only the corresponding content initiation policy for %s', kind => {
    const p = pair(kind)
    const required = kind === 'SELF' ? 'CLASS_ASSIGN' : 'RELATED_OBSERVER_ASSIGN'
    expect(permitsOwnSchoolActivityPair(p, [required])).toBe(true)
    expect(permitsOwnSchoolActivityPair(p, required === 'CLASS_ASSIGN' ? ['RELATED_OBSERVER_ASSIGN'] : ['CLASS_ASSIGN'])).toBe(false)
    expect(permitsOwnSchoolActivityPair(p, ['ORG_ASSIGN'])).toBe(false)
    expect(permitsOwnSchoolActivityPair(p)).toBe(false)
  })
  it('rejects non-student or external subjects and reverse teacher evaluation', () => {
    const p = pair('CLASS_TEACHER_STUDENT')
    expect(permitsOwnSchoolActivityPair({ ...p, subject: p.respondent, respondent: p.subject }, modes)).toBe(false)
    expect(permitsOwnSchoolActivityPair({ ...p, subject: { ...p.subject, provenanceKind: 'EXTERNAL_PARENT' } }, modes)).toBe(false)
    expect(permitsOwnSchoolActivityPair({ ...p, subject: { ...p.subject, membershipId: null } }, modes)).toBe(false)
  })
  it('rejects course teachers and non-homeroom class teachers even with an otherwise valid class pair', () => {
    const p = pair('CLASS_TEACHER_STUDENT')
    expect(permitsOwnSchoolActivityPair({ ...p, relationshipKind: 'COURSE_TEACHER_STUDENT' }, modes)).toBe(false)
    expect(permitsOwnSchoolActivityPair({ ...p, facts: { ...p.facts, courseId: 'course' } }, modes)).toBe(false)
    expect(permitsOwnSchoolActivityPair({ ...p, facts: { ...p.facts, staffRole: 'TEACHING' } }, modes)).toBe(false)
    expect(permitsOwnSchoolActivityPair({ ...p, facts: { ...p.facts, staffClassAssignmentId: 'other-assignment' } }, modes)).toBe(false)
  })
  it('rejects unrelated parent provenance or a link for a different student', () => {
    const p = pair('PARENT_CHILD')
    expect(permitsOwnSchoolActivityPair({ ...p, respondent: { ...p.respondent, parentRelationshipId: 'unrelated' } }, modes)).toBe(false)
    expect(permitsOwnSchoolActivityPair({ ...p, respondent: { ...p.respondent, provenanceKind: 'ORG_MEMBER', membershipId: 'parent-member' } }, modes)).toBe(false)
    expect(permitsOwnSchoolActivityPair({ ...p, facts: { ...p.facts, studentMembershipId: 'outside-student' } }, modes)).toBe(false)
    expect(permitsOwnSchoolActivityPair({ ...p, relationshipRef: null }, modes)).toBe(false)
  })
  it('does not turn another student into self or allow a subject to observe themselves', () => {
    const p = pair('SELF')
    expect(permitsOwnSchoolActivityPair({ ...p, respondent: { ...p.respondent, userId: 'other' } }, modes)).toBe(false)
    const observer = pair('CLASS_TEACHER_STUDENT')
    expect(permitsOwnSchoolActivityPair({ ...observer, respondent: { ...observer.respondent, userId: observer.subject.userId } }, modes)).toBe(false)
  })
})
