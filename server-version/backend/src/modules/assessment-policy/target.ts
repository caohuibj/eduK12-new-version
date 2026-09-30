export const evaluationTargetModes = ['SELF', 'HOMEROOM_TEACHER', 'ALL_CLASS_TEACHERS', 'SELECTED_CLASS_TEACHERS', 'COURSE_TEACHER'] as const
export type EvaluationTargetMode = typeof evaluationTargetModes[number]
export interface EvaluationTargetRequest {
  mode: EvaluationTargetMode
  teacherMembershipIds?: string[]
  courseId?: string
}

/** Campaigns select only modes declared by the owning content. IDs narrow the
 * server-resolved relationship set; they never create a relationship. */
export function assertEvaluationTarget(
  allowed: readonly EvaluationTargetMode[] | undefined,
  request: EvaluationTargetRequest | undefined,
): void {
  if (!request || !allowed?.includes(request.mode)) throw new Error('TARGET_POLICY_NOT_ALLOWED')
  if (request.mode === 'SELECTED_CLASS_TEACHERS') {
    if (!request.teacherMembershipIds?.length || request.teacherMembershipIds.some(id => !id.trim())) throw new Error('TARGET_SELECTION_REQUIRED')
  } else if (request.teacherMembershipIds?.length) throw new Error('TARGET_SELECTION_UNEXPECTED')
  if (request.mode === 'COURSE_TEACHER') {
    if (!request.courseId?.trim()) throw new Error('TARGET_COURSE_REQUIRED')
  } else if (request.courseId) throw new Error('TARGET_COURSE_UNEXPECTED')
}

export function matchesClassTarget(request: EvaluationTargetRequest, teacherMembershipId: string, staffRole: string): boolean {
  switch (request.mode) {
    case 'HOMEROOM_TEACHER': return staffRole === 'HOMEROOM'
    case 'ALL_CLASS_TEACHERS': return staffRole === 'HOMEROOM' || staffRole === 'TEACHING'
    case 'SELECTED_CLASS_TEACHERS': return request.teacherMembershipIds?.includes(teacherMembershipId) === true
    default: return false
  }
}
