import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
vi.mock('../../api/client', () => ({ default: api }))
vi.mock('react-router-dom', async () => ({
  ...await vi.importActual('react-router-dom'), useParams: () => ({ id: 'scale-1' }),
}))
import ScaleEdit from '../ScaleEdit'

const definition = (selected: string[] = []) => ({
  schemaVersion: 2, items: ['Q1', 'Q2', 'Q3'].map((itemCode, index) => ({
    itemCode, content: itemCode, required: true, sortOrder: index + 1, type: 'single', responseSetKey: 'default',
  })),
  scoring: { scores: selected.length ? [{
    key: 'total_1', type: 'total', label: '总分', canonical: true, direction: 'descriptive',
    source: { type: 'items', aggregation: 'sum', items: selected.map(itemCode => ({ itemCode, weight: 1 })) },
  }] : [] },
})
const scale = (value: unknown) => ({ id: 'scale-1', code: 's1', name: '测试量表', status: 'DRAFT', instrumentClass: 'CUSTOM_DESCRIPTIVE', definition: value })

beforeEach(() => { vi.clearAllMocks() })

describe('计分定义保存与回读', () => {
  it('shows included items and matches the unweighted mean range even with historical weights', async () => {
    const stored: any = definition(['Q1', 'Q2', 'Q3'])
    stored.responseSets = [{ key: 'default', options: [{ value: 'a', label: 'A', score: 1 }, { value: 'b', label: 'B', score: 5 }] }]
    stored.scoring.scores[0].source.aggregation = 'mean'
    stored.scoring.scores[0].source.items.forEach((item: any) => { item.weight = 2 })
    api.get.mockResolvedValue({ code: 0, data: scale(stored) })
    const user = userEvent.setup()
    render(<MemoryRouter><ScaleEdit /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '计分' }))
    expect(screen.getByText(/已纳入 3\/3 题 · 预计范围 1.0–5.0/)).toBeInTheDocument()
  })
  it('explicitly selects all three items, persists them, and keeps them selected after reopening', async () => {
    let stored: any = definition()
    api.get.mockImplementation(async () => ({ code: 0, data: scale(structuredClone(stored)) }))
    api.put.mockImplementation(async (_url, body) => { stored = structuredClone(body.definition); return { code: 0, data: scale(stored) } })
    const user = userEvent.setup()
    const view = render(<MemoryRouter><ScaleEdit /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '计分' }))
    await user.click(screen.getByRole('button', { name: '+ 总分' }))
    for (const code of ['Q1', 'Q2', 'Q3']) {
      expect(screen.getByRole('button', { name: code })).toHaveAttribute('aria-pressed', 'false')
      await user.click(screen.getByRole('button', { name: code }))
    }
    await user.click(screen.getByRole('button', { name: '保存计分定义' }))
    await screen.findByText(/已保存，并重新读取确认/)
    expect(stored.scoring.scores[0].source.items.map((item: any) => item.itemCode)).toEqual(['Q1', 'Q2', 'Q3'])
    view.unmount()
    render(<MemoryRouter><ScaleEdit /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '计分' }))
    for (const code of ['Q1', 'Q2', 'Q3']) expect(screen.getByRole('button', { name: code })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps a newly selected Q1 when repairing a Q2/Q3 definition', async () => {
    let stored: any = definition(['Q2', 'Q3'])
    api.get.mockImplementation(async () => ({ code: 0, data: scale(structuredClone(stored)) }))
    api.put.mockImplementation(async (_url, body) => { stored = structuredClone(body.definition); return { code: 0, data: scale(stored) } })
    const user = userEvent.setup()
    render(<MemoryRouter><ScaleEdit /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '计分' }))
    await user.click(screen.getByRole('button', { name: 'Q1' }))
    await user.click(screen.getByRole('button', { name: '保存计分定义' }))
    await waitFor(() => expect(stored.scoring.scores[0].source.items).toHaveLength(3))
    await screen.findByText(/已保存，并重新读取确认/)
    expect(screen.getByRole('button', { name: 'Q1' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reports a mismatched readback and retains the unsaved selection', async () => {
    api.get.mockResolvedValue({ code: 0, data: scale(definition(['Q2', 'Q3'])) })
    api.put.mockResolvedValue({ code: 0, data: {} })
    const user = userEvent.setup()
    render(<MemoryRouter><ScaleEdit /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '计分' }))
    await user.click(screen.getByRole('button', { name: 'Q1' }))
    await user.click(screen.getByRole('button', { name: '保存计分定义' }))
    await screen.findByText(/保存后的计分题目与当前选择不一致/)
    expect(screen.getByRole('button', { name: 'Q1' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/已保存，并重新读取确认/)).not.toBeInTheDocument()
  })
})
