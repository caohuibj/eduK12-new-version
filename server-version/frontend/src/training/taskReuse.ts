import type { Assignment, Checkin } from '../types'

/** Only authoring fields enter a new task. Never copy identity, dates, tokens,
 * publication state, submissions, grades, or participation counters. */
const array = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return structuredClone(value) as T[]
  if (typeof value === 'string') {
    try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
  }
  return []
}
export function assignmentReuseContent(source: Assignment, courseId: string) {
  return {
    courseId, title: source.title, description: source.description || '', content: source.content || '', deadline: '',
    questions: array<NonNullable<Assignment['questions']>[number]>(source.questions),
    videos: array<NonNullable<Assignment['videos']>[number]>(source.videos),
    images: array<NonNullable<Assignment['images']>[number]>(source.images),
    documents: array<NonNullable<Assignment['documents']>[number]>(source.documents),
    tags: array<string>(source.tags),
  }
}
export function checkinReuseContent(source: Checkin, courseId: string) {
  return {
    courseId, title: source.title, description: source.description || '', content: source.content || '', endTime: '',
    videos: array<NonNullable<Checkin['videos']>[number]>(source.videos),
    images: array<NonNullable<Checkin['images']>[number]>(source.images),
    documents: array<NonNullable<Checkin['documents']>[number]>(source.documents),
    allowViewOthers: source.allowViewOthers || false, tags: array<string>(source.tags),
  }
}
