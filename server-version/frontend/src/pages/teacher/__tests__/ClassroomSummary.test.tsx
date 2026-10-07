import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: { get, post } }))
import ClassroomSummary from '../ClassroomSummary'

beforeEach(() => vi.resetAllMocks())
it('preserves the production 1-based question numbers from the frozen summary', async () => {
  get.mockResolvedValue({ code: 0, data: { contentHash: 'frozen', payload: {
    name: 'Ended', frozenAt: '2026-10-07T00:00:00Z', participants: 1, meaning: 'Frozen counts',
    questions: [{ id: 'q1', ordinal: 1, title: 'First', type: 'text_input', answered: 1 }, { id: 'q2', ordinal: 2, title: 'Second', type: 'text_input', answered: 0 }],
  } } })
  render(<ClassroomSummary id="ended" />)
  expect(await screen.findByText('第 1 题 · First · 提交 1 份')).toBeInTheDocument()
  expect(screen.getByText('第 2 题 · Second · 提交 0 份')).toBeInTheDocument()
  expect(screen.queryByText(/第 3 题/)).not.toBeInTheDocument()
  expect(post).not.toHaveBeenCalled()
})
