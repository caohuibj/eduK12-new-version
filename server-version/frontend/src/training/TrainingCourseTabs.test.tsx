import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { expect, it } from 'vitest'
import TrainingCourseTabs from './TrainingCourseTabs'
import { trainingCourseContext } from './courseNavigation'

it.each([
  ['/assignments?courseId=c', 'assignments'], ['/checkins?courseId=c', 'checkins'],
  ['/questionnaire-products/new?courseId=c', 'assessments'], ['/scales/s?courseId=c', 'assessments'],
  ['/courses/c/students', 'management'], ['/courses/c/detail?section=analysis', 'assessments'],
])('keeps the same course and active section for %s', (target, section) => {
  const url = new URL(target, 'https://training.invalid')
  expect(trainingCourseContext(url.pathname, url.search)).toMatchObject({ courseId: 'c', section })
})

it.each(['/assignments?courseId=bad%2Fid', '/profile?courseId=c', '/questionnaire-products/q',
  '/scales/s?courseId=c&returnTo=%2Fcourses%2Fother%2Fdetail', '/scales/s?returnTo=https%3A%2F%2Fevil.test%2Fcourses%2Fc%2Fdetail',
])('does not invent a course context for %s', target => {
  const url = new URL(target, 'https://training.invalid')
  expect(trainingCourseContext(url.pathname, url.search)).toBeNull()
})

it('restores course context from a safe return link and preserves its per-section filters', () => {
  const parent = '/courses/c/detail?section=assessments&assessments_page=3&assessments_tags=前测'
  const context = trainingCourseContext('/questionnaire-products/q', '?returnTo=' + encodeURIComponent(parent))!
  function Target() { const location = useLocation(); return <p data-testid="target">{location.pathname + location.search}</p> }
  render(<MemoryRouter><TrainingCourseTabs {...context} /><Target /></MemoryRouter>)
  const nav = screen.getByRole('navigation', { name: '课程管理内容' })
  expect(within(nav).getAllByRole('link')).toHaveLength(4)
  expect(within(nav).queryByRole('link', { name: '信息统计' })).toBeNull()
  expect(within(nav).getByRole('link', { name: '测评' })).toHaveAttribute('aria-current', 'page')
  fireEvent.click(within(nav).getByRole('link', { name: '打卡' }))
  const destination = new URL(screen.getByTestId('target').textContent!, 'https://training.invalid')
  expect(destination.pathname).toBe('/courses/c/detail')
  expect(destination.searchParams.get('section')).toBe('checkins')
  expect(destination.searchParams.get('assessments_page')).toBe('3')
  expect(destination.searchParams.get('assessments_tags')).toBe('前测')
})
