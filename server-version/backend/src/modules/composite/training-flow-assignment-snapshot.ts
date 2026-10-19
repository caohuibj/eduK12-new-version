import { canonicalHash } from '../assessment-runtime/canonical'
import type { prepareTeacherPublishedAssignment } from '../cognitive/assignment.service'

type PreparedAssignment = Awaited<ReturnType<typeof prepareTeacherPublishedAssignment>>

/** Private flow-candidate wire format, not a general Prisma/JSON serializer.
 * An existing wrapper is consumed only for its id by createCognitiveChild.
 * A deferred wrapper retains the exact create fields; Prisma accepts its ISO
 * DateTime when the reached child calls persistPreparedTeacherPublishedAssignment.
 * Do not store a whole Prisma row or silently discard undefined values. */
export const freezeTrainingFlowAssignment = (prepared: PreparedAssignment) => {
  if (prepared.existing) {
    const snapshot = { existing: { id: prepared.existing.id } }
    canonicalHash(snapshot)
    return snapshot
  }
  const data = prepared.data
  if (!data || !(data.publishedAt instanceof Date) || !Number.isFinite(data.publishedAt.getTime())) {
    throw new Error('Prepared training-flow assignment publication time is invalid')
  }
  const course = data.courseSnapshot as { id: string; title: string; courseCode: string } | null
  if (!course) throw new Error('Prepared training-flow assignment course snapshot is missing')
  const snapshot = { data: {
    courseId: data.courseId,
    configId: data.configId,
    createdBy: data.createdBy,
    title: data.title,
    instruction: data.instruction,
    status: data.status,
    publishedAt: data.publishedAt.toISOString(),
    listedStandalone: data.listedStandalone,
    required: data.required,
    maxAttempts: data.maxAttempts,
    quotaSourceAssignmentId: data.quotaSourceAssignmentId,
    courseSnapshot: { id: course.id, title: course.title, courseCode: course.courseCode },
    profile: data.profile,
    profileDefinitionVersion: data.profileDefinitionVersion,
    resolvedConfigSnapshotEncrypted: data.resolvedConfigSnapshotEncrypted,
    resolvedConfigHash: data.resolvedConfigHash,
    resolvedReportSnapshotEncrypted: data.resolvedReportSnapshotEncrypted,
  } }
  // Keep the global canonical contract strict, including undefined, unexpected
  // non-JSON nested values and invalid numeric fields in this explicit DTO.
  canonicalHash(snapshot)
  return snapshot
}
