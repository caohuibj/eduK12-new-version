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

it.each(['/general-questionnaires/q', '/questionnaires/q'])('loads all mixed units once and submits their full order at %s', async basePath => {
  const mixed = [
    { id: 'second-scale', type: 'scale', label: 'Second scale', position: 3, contextSection: false },
    { id: 'context', type: 'form-section', label: '背景信息', position: 0, itemCount: 1, contextSection: true },
    { id: 'first-scale', type: 'scale', label: 'First scale', position: 1, contextSection: false },
    { id: 'second-section', type: 'form-section', label: 'Second section', position: 2, itemCount: 0, contextSection: false },
  ]
  get.mockResolvedValue({ code: 0, data: { list: [section], units: mixed } })
  render(<FormSectionManager basePath={basePath} />)
  await screen.findByText('First scale')
  expect(get).toHaveBeenCalledExactlyOnceWith(`${basePath}/form-sections?include=units`)
  const rows = Array.from(screen.getByText('First scale').closest('ol')!.children)
  expect(rows.map(row => row.textContent)).toEqual([
    expect.stringContaining('背景信息'), expect.stringContaining('First scale'), expect.stringContaining('Second section'), expect.stringContaining('Second scale'),
  ])
  await userEvent.click(rows[1].querySelectorAll('button')[1])
  await waitFor(() => expect(post).toHaveBeenCalledWith(`${basePath}/content/reorder`, { units: [
    { type: 'form-section', id: 'context', position: 0 },
    { type: 'form-section', id: 'second-section', position: 1 },
    { type: 'scale', id: 'first-scale', position: 2 },
    { type: 'scale', id: 'second-scale', position: 3 },
  ] }))
})
