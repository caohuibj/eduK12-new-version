import apiClient from '../api/client'
import type { Course } from '../types'
import { isTrainingHost } from './context'

/**
 * The regular course pickers load the first page of the generic /courses API.
 * A trainer may own more than 100 courses. A course-context link may suggest
 * the exact course, but we must verify its *current owner* and real access
 * before appending that one row to a picker.
 *
 * Presentation convenience only: the original mutation endpoint rechecks
 * ownership and publication authority. No broad 1000-course fetch is needed.
 */
export async function resolveTrainingCoursePrefill(input: {
  courseId: string | null
  userId: string | undefined
  knownIds: readonly string[]
}): Promise<Course | null> {
  const { courseId, userId, knownIds } = input
  if (!isTrainingHost() || !userId || !courseId || !/^[a-zA-Z0-9_-]{1,100}$/.test(courseId)) return null
  if (knownIds.includes(courseId)) return null
  try {
    const result = await apiClient.get<Course>('/courses/' + encodeURIComponent(courseId))
    const item = result.data
    if (result.code !== 0 || !item || item.id !== courseId || item.creatorId !== userId || item.isLibrary) return null
    return item
  } catch {
    // A changed grant, removed course or stale URL may fail. Do not silently
    // accept the caller's requested course id as a selectable option.
    return null
  }
}
