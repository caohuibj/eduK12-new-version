import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import TrainingContextBack from './TrainingContextBack'

describe('Training deep-page return context', () => {
  const mount = (url: string, role: 'STUDENT' | 'TEACHER') =>
    render(<MemoryRouter initialEntries={[url]}><TrainingContextBack role={role} /></MemoryRouter>)

  it('returns to the exact course from its authorized authoring link', () => {
    mount('/assignments?create=true&courseId=course-1', 'TEACHER')
    expect(screen.getByRole('link', { name: /返回当前课程/ })).toHaveAttribute('href', '/courses/course-1/detail')
  })
  it('retains course-specific return for a learner submitted task', () => {
    mount('/student/assignments/a-1?courseId=course-1', 'STUDENT')
    expect(screen.getByRole('link', { name: /返回当前课程/ })).toHaveAttribute('href', '/student/courses/course-1')
  })
  it('rejects malformed course hint and uses the proper home', () => {
    mount('/assignments?courseId=bad%2Fother', 'TEACHER')
    expect(screen.getByRole('link', { name: /返回我的课程/ })).toHaveAttribute('href', '/dashboard')
  })
  it('does not duplicate the existing course-level back navigation', () => {
    mount('/student/courses/course-1', 'STUDENT')
    expect(screen.queryByRole('link')).toBeNull()
  })
})
