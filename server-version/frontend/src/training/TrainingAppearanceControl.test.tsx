import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: undefined }) }))
vi.mock('./context', () => ({ isTrainingHost: () => true }))
import { TrainingAppearanceProvider } from './TrainingAppearance'
import TrainingAppearanceControl from './TrainingAppearanceControl'

afterEach(() => { localStorage.clear(); vi.useRealTimers() })

it('uses one icon button, cycles all three modes and updates the explanatory hint', () => {
  localStorage.clear()
  render(<TrainingAppearanceProvider><TrainingAppearanceControl /></TrainingAppearanceProvider>)
  expect(screen.getAllByRole('button')).toHaveLength(1)
  const button = screen.getByRole('button', { name: '外观：自动，点击切换为浅色' })
  expect(button.textContent).toBe('')
  expect(button).toHaveAccessibleDescription(/外观：自动.*点击切换为浅色/)
  fireEvent.click(button)
  expect(button).toHaveAccessibleName('外观：浅色，点击切换为深色')
  expect(button).toHaveAccessibleDescription(/外观：浅色.*点击切换为深色/)
  fireEvent.click(button)
  expect(button).toHaveAccessibleName('外观：深色，点击切换为自动')
  expect(button).toHaveAccessibleDescription(/外观：深色.*点击切换为自动/)
  fireEvent.click(button)
  expect(button).toHaveAccessibleName('外观：自动，点击切换为浅色')
})

it('dismisses the clicked hint while focus remains and restarts its timeout for a new click', () => {
  vi.useFakeTimers()
  render(<TrainingAppearanceProvider><TrainingAppearanceControl /></TrainingAppearanceProvider>)
  const button = screen.getByRole('button')
  const control = button.closest('.training-appearance-control')!
  act(() => button.focus())
  fireEvent.click(button)
  expect(control).toHaveAttribute('data-hint-open', 'true')
  act(() => vi.advanceTimersByTime(1000))
  fireEvent.click(button)
  act(() => vi.advanceTimersByTime(1000))
  expect(control).toHaveAttribute('data-hint-open', 'true')
  act(() => vi.advanceTimersByTime(600))
  expect(control).toHaveAttribute('data-hint-open', 'false')
  expect(button).toHaveFocus()
  fireEvent.pointerEnter(control, { pointerType: 'mouse' })
  expect(control).toHaveAttribute('data-hint-open', 'true')
  fireEvent.pointerLeave(control, { pointerType: 'mouse' })
  expect(control).toHaveAttribute('data-hint-open', 'false')
  fireEvent.click(button)
  fireEvent.keyDown(button, { key: 'Escape' })
  expect(control).toHaveAttribute('data-hint-open', 'false')
})
