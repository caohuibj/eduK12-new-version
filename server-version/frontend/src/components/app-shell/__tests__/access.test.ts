import { describe, expect, it, afterEach } from 'vitest'
import { internalReturnTo, parentReturnTo, returnAfterLogin, shellModeFor, rememberReauthReturn, readReauthReturn } from '../access'
import { activeNavigation, navigationFor } from '../navigation'

afterEach(() => sessionStorage.clear())
describe('safe access and return context', () => {
  it.each(['https://evil.test', '//evil.test', '/\\evil.test', '/%2f%2fevil.test', '/%5cevil.test', '/bad\npath'])('rejects unsafe target %s', (target) => expect(internalReturnTo(target)).toBeNull())
  it('retains exact nested query values without double decoding', () => {
    const path = '/student/cognitive/sessions/s1?returnTo=%2Fstudent%2Fcomposite%2Fattempts%2Fa%3Fx%3D1#ready'
    expect(returnAfterLogin(path, 'STUDENT')).toBe(path)
  })
  it('rejects role escalation and authentication loops', () => {
    expect(returnAfterLogin('/users', 'TEACHER')).toBe('/dashboard')
    expect(returnAfterLogin('/dashboard', 'STUDENT')).toBe('/student')
    expect(returnAfterLogin('/student/scales/1', 'ADMIN')).toBe('/student/scales/1')
    expect(returnAfterLogin('/student/login?returnTo=/users', 'STUDENT')).toBe('/student')
    expect(returnAfterLogin('/scale-library/key/1', 'STUDENT')).toBe('/scale-library/key/1')
    expect(returnAfterLogin('/dashboard', 'PARENT')).toBe('/parent')
    expect(returnAfterLogin('/relational/tasks', 'PARENT')).toBe('/relational/tasks')
    expect(returnAfterLogin('/student/scales/1', 'PARENT')).toBe('/student/scales/1')
    expect(returnAfterLogin('/organizations/org-1/reporting?wave=2', 'TEACHER')).toBe('/organizations/org-1/reporting?wave=2')
    expect(returnAfterLogin('/organization-tasks', 'STUDENT')).toBe('/organization-tasks')
    expect(returnAfterLogin('/organizations/org-1/reporting?tab=group', 'TEACHER')).toBe('/organizations/org-1/reporting?tab=group')
    expect(returnAfterLogin('/organization-tasks', 'ADMIN')).toBe('/organization-tasks')
  })
  it('restricts child returns to the matching public/authenticated parent family', () => {
    expect(parentReturnTo('/student/composite/attempts/1?slot=a', false, '/')).toBe('/student/composite/attempts/1?slot=a')
    expect(parentReturnTo('/student/composite/attempts/1', true, '/')).toBe('/')
    expect(parentReturnTo('/relational/attempts/1?slot=a', false, '/')).toBe('/relational/attempts/1?slot=a')
    expect(parentReturnTo('/users', false, '/')).toBe('/')
  })
  it('stores only an identity and return hint for reauthentication', () => {
    rememberReauthReturn({ id: 'user-1', role: 'STUDENT' }, '/student/scales/1')
    expect(readReauthReturn()).toEqual({ userId: 'user-1', role: 'STUDENT', target: '/student/scales/1' })
  })
  it('resolves modes without mistaking history/results for players', () => {
    expect(shellModeFor('/student/situational/history')).toBe('standard')
    expect(shellModeFor('/student/situational/test')).toBe('focused')
    expect(shellModeFor('/public/cognitive/sessions/1')).toBe('focused')
    expect(shellModeFor('/public/cognitive/sessions/1/result')).toBe('public')
    expect(shellModeFor('/relational/attempts/1')).toBe('focused')
    expect(shellModeFor('/relational/cognitive/sessions/1')).toBe('focused')
    expect(shellModeFor('/bigscreen/1')).toBe('display')
  })
})
describe('role navigation', () => {
  it('has one active item at nested student routes', () => {
    const items = navigationFor('STUDENT', true)
    expect(activeNavigation(items, '/student/cognitive/history')?.path).toBe('/student/cognitive')
    expect(activeNavigation(items, '/student/profile')?.path).toBe('/student/profile')
    expect(activeNavigation(items, '/student/courses/1')?.path).toBe('/student')
    expect(activeNavigation(items, '/student/cognitive-other')).toBeUndefined()
  })
  it('keeps parent navigation isolated from staff and student surfaces', () => {
    const items = navigationFor('PARENT', true, true)
    expect(items.map((item) => item.path)).toEqual(['/my-assessments', '/parent', '/parent/profile', '/relational/tasks'])
    expect(activeNavigation(items, '/relational/attempts/attempt-1')?.path).toBe('/relational/tasks')
  })
  it('keeps admin and disabled capability items out of other menus', () => {
    expect(navigationFor('TEACHER', false).some((item) => item.path === '/users' || item.path === '/cognitive-assignments')).toBe(false)
    expect(navigationFor('ADMIN', true).some((item) => item.path === '/admin/instrument-authorizations')).toBe(true)
  })
  it('groups staff navigation by task without changing route destinations', () => {
    const teacher = navigationFor('TEACHER', true)
    expect(teacher.find(item => item.path === '/dashboard')?.section).toBe('teaching')
    expect(teacher.find(item => item.path === '/cognitive-assignments')?.section).toBe('assessment')
    expect(teacher.find(item => item.path === '/documents')?.section).toBe('content')
    expect(teacher.find(item => item.path === '/profile')?.section).toBe('account')
    const admin = navigationFor('ADMIN', true)
    expect(admin.find(item => item.path === '/users')?.section).toBe('system')
  })
})
