import { createSqlRelationalAssignmentRepository } from '../assessment-relational/repository'
import { readInstance } from './instance'

/** A real, consented adult observation uses the child's course membership.
 * This exception applies only to the dedicated child episode and a pure
 * observer bundle; it never admits an adult into a child's cognitive task. */
export async function isAssignedChildBundleObserver(db: any, composite: any, identity: any, userId: string) {
  if (!identity || composite.productKind !== 'ASSESSMENT_BUNDLE' || identity.respondentUserId !== userId
    || !['PARENT', 'TEACHER'].includes(identity.respondentType) || identity.subjectUserId === userId) return false
  const repository = createSqlRelationalAssignmentRepository(db), a = await repository.findById(identity.assignmentRef)
  if (!a || a.policyDomain !== 'LEGACY_COURSE' || a.status !== 'STARTED' || a.resourceKind !== 'BUNDLE'
    || a.resourceKey !== composite.id || a.respondentUserId !== userId || a.respondentRole !== identity.respondentType
    || a.subjectUserId !== identity.subjectUserId || a.episodeId !== identity.episodeId) return false
  const episode = await db.assessmentEpisode.findUnique({ where: { id: a.episodeId } })
  if (!episode?.campaignKey?.startsWith('child_cross_method:') || episode.subjectUserId !== a.subjectUserId
    || episode.courseId !== composite.courseId || episode.initiatedByUserId !== composite.createdBy
    || a.createdByUserId !== composite.createdBy) return false
  const consent = await repository.resolveAcceptedConsent(a)
  if (!consent || consent.consentId !== identity.consentId) return false
  const instance = await db.bundleInstance.findUnique({ where: { compositeId: composite.id } })
  if (!instance) return false
  const definition = readInstance(instance).frozen.bundleSnapshot.bundleDefinition
  if (!definition.bundleKey.startsWith('child_chexi_') || definition.respondentTypes.length !== 1
    || definition.respondentTypes[0] !== identity.respondentType
    || definition.slots.some(s => s.respondentType !== identity.respondentType || !['SCALE','FORM'].includes(s.unitType))) return false
  return !!await db.courseStudent.findFirst({ where: { courseId: composite.courseId, studentId: a.subjectUserId,
    status: { in: ['ACTIVE','APPROVED'] }, course: { isLibrary: false }, student: { isActive: true, isFrozen: false, role: 'STUDENT' } } })
}
