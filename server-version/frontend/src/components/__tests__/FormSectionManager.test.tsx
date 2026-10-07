import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FormSectionManager from '../FormSectionManager'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../../api/client', () => ({ default: { get, post } }))
const section = { id: 'context', title: '背景信息', position: 2, contextSection: true, items: [{ id: 'grade', contextKey: 'gradeLevel', formLabel: '年级' }] }
const initial = [
  { id: 'scale', type: 'scale', label: '量表', position: 0, contextSection: false },
  { id: 'cognitive', type: 'cognitive', label: '认知任务', position: 1, contextSection: false },
  { id: 'context', type: 'form-section', label: '背景信息', position: 2, itemCount: 1, contextSection: true },
]
let units = initial
beforeEach(() => {
  vi.clearAllMocks()
  units = initial
  get.mockImplementation(async (path: string) => ({ code: 0, data: path.endsWith('/content') ? { units } : { list: path.endsWith('/form-items') ? section.items : [section] } }))
  post.mockResolvedValue({ code: 0 })
})

describe('content order management', () => {
  it('repairs a trailing context in one complete final order request', async () => {
    render(<FormSectionManager basePath="/composite-assessments/example" />)
    await userEvent.click(await screen.findByRole('button', { name: '置顶' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/composite-assessments/example/content/reorder', { units: [
      { type: 'form-section', id: 'context', position: 0 }, { type: 'scale', id: 'scale', position: 1 }, { type: 'cognitive', id: 'cognitive', position: 2 },
    ] }))
    expect(post).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('shows a plain API validation error instead of a generic failure', async () => {
    post.mockRejectedValue({ status: 400, message: '排序必须包含全部内容单元，请刷新后重试' })
    render(<FormSectionManager basePath="/composite-assessments/example" />)
    await userEvent.click(await screen.findByRole('button', { name: '置顶' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('排序必须包含全部内容单元，请刷新后重试')
  })

  it('refreshes the canonical unit list after the parent removes a module', async () => {
    const { rerender } = render(<FormSectionManager basePath="/composite-assessments/example" refreshKey={0} />)
    await screen.findByText('量表')
    units = initial.filter(unit => unit.id !== 'scale')
    rerender(<FormSectionManager basePath="/composite-assessments/example" refreshKey={1} />)
    await waitFor(() => expect(screen.queryByText('量表')).not.toBeInTheDocument())
  })
})
