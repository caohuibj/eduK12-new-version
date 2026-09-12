import { matchPath } from 'react-router-dom'
import type { User } from '../../types'

export type Role = User['role']
export type ShellMode = 'standard' | 'focused' | 'public' | 'display'
export const homeFor = (role?: Role) => role === 'STUDENT' ? '/student' : role ? '/dashboard' : '/'
export const loginFor = (role?: Role) => role === 'ADMIN' ? '/admin/login' : role === 'TEACHER' ? '/teacher/account-login' : '/student/login'
export const isPublicAssessmentPath = (pathname: string) => pathname.startsWith('/public/')

// Presentation metadata only; route guards and API authorization remain authoritative.
const focusedPaths = [
  '/student/scales/:scaleId', '/student/questionnaires/:questionnaireId',
  '/student/cognitive/sessions/:sessionId', '/public/cognitive/sessions/:sessionId',
  '/student/situational/:instrumentKey', '/student/composite/situational/:attemptId',
  '/public/composite/situational/:attemptId', '/student/composite/:assessmentId',
  '/student/composite/attempts/:attemptId', '/public/composite/:token',
  '/public/composite/attempts/:attemptId', '/public/questionnaire/:token/assessment',
]
export const isAuthPath = (pathname: string) => /^\/(admin\/login|teacher\/(login|account-login|register)|student\/(login|course-login|register))$/.test(pathname)
export function shellModeFor(pathname: string): ShellMode {
  if (pathname.startsWith('/bigscreen/')) return 'display'
  if (pathname !== '/student/situational/history' && focusedPaths.some((path) => matchPath(path, pathname))) return 'focused'
  if (pathname === '/' || isAuthPath(pathname) || isPublicAssessmentPath(pathname)) return 'public'
  return 'standard'
}

/** URLSearchParams already decodes query values. Never decode a return URL twice. */
export function internalReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || [...value].some((char) => char === '\\' || char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return null
  try {
    const url = new URL(value, 'https://huisurvey.invalid')
    if (url.origin !== 'https://huisurvey.invalid') return null
    if (/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(url.pathname)) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return null }
}
const staffRoots = ['dashboard', 'courses', 'students', 'assignments', 'checkins', 'scales', 'questionnaires', 'general-questionnaires', 'composite-assessments', 'cognitive-assignments', 'videos', 'images', 'documents', 'profile']
const adminRoots = ['users', 'teacher-codes', 'admin/material-grants', 'admin/instrument-authorizations']
const inRoot = (pathname: string, root: string) => pathname === `/${root}` || pathname.startsWith(`/${root}/`)
export function returnAfterLogin(value: string | null | undefined, role: Role): string {
  const target = internalReturnTo(value)
  if (!target) return homeFor(role)
  const pathname = new URL(target, 'https://huisurvey.invalid').pathname
  if (isAuthPath(pathname)) return homeFor(role)
  const allowed = inRoot(pathname, 'scale-library') || (role === 'STUDENT' ? inRoot(pathname, 'student')
    : staffRoots.some((root) => inRoot(pathname, root)) || inRoot(pathname, 'teacher/classrooms') || (role === 'ADMIN' && adminRoots.some((root) => inRoot(pathname, root))))
  return allowed ? target : homeFor(role)
}
export function loginUrl(role: Role | undefined, destination: string) {
  return `${loginFor(role)}?returnTo=${encodeURIComponent(destination)}`
}

// Reauthentication hint only, never credentials or draft data.
const resumeKey = 'huisurvey:reauth-return'
export type ReauthReturn = { userId: number | string; target: string; role: Role }
export function readReauthReturn(): ReauthReturn | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(resumeKey) || 'null')
    return value && ['number', 'string'].includes(typeof value.userId) && ['STUDENT', 'TEACHER', 'ADMIN'].includes(value.role) && internalReturnTo(value.target) ? value : null
  } catch { return null }
}
export function rememberReauthReturn(user: Pick<User, 'id' | 'role'>, target: string) {
  try { sessionStorage.setItem(resumeKey, JSON.stringify({ userId: user.id, role: user.role, target })) } catch { /* Optional hint; never change draft persistence. */ }
}
export function parentReturnTo(value: string | null, isPublic: boolean, fallback: string): string {
  const target = internalReturnTo(value)
  if (!target) return fallback
  const pathname = new URL(target, 'https://huisurvey.invalid').pathname
  return pathname.startsWith(isPublic ? '/public/composite/' : '/student/composite/') ? target : fallback
}

export function sameReturnPage(left: string | undefined, right: string): boolean {
  const a = internalReturnTo(left)
  const b = internalReturnTo(right)
  return Boolean(a && b && new URL(a, 'https://huisurvey.invalid').pathname === new URL(b, 'https://huisurvey.invalid').pathname)
}
