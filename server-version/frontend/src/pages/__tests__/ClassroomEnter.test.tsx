import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams()],
  }
})

import ClassroomEnter from '../student/ClassroomEnter'

describe('ClassroomEnter input capability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows physical-keyboard entry without removing the touch keypad', async () => {
    const user = userEvent.setup()
    render(<ClassroomEnter />)

    const input = screen.getByLabelText('课堂码')
    await user.type(input, '123456')
    expect(input).toHaveValue('123456')
    expect(screen.getByRole('button', { name: '输入数字 1' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '进入课堂' }))
    expect(mockNavigate).toHaveBeenCalledWith('/student/classroom/join/123456')
  })

  it('filters non-digits and keeps entry disabled until six digits are present', async () => {
    const user = userEvent.setup()
    render(<ClassroomEnter />)

    const input = screen.getByLabelText('课堂码')
    await user.type(input, '12a3')
    expect(input).toHaveValue('123')
    expect(screen.getByRole('button', { name: '进入课堂' })).toBeDisabled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
