import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { parseScaleItemPaste } from '../../modules/assessment-core/scale/authoringInput'
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }))
vi.mock('../../api/client', () => ({ default: api }))
vi.mock('react-router-dom', async () => ({ ...await vi.importActual('react-router-dom'), useParams: () => ({ id: 'scale-1' }) }))
import ScaleEdit from '../ScaleEdit'

let stored: any
const fixture = () => ({ id: 'scale-1', code: 'STABLE', name: '粘贴录入量表', status: 'DRAFT', instrumentClass: 'CUSTOM_DESCRIPTIVE', definition: {
  schemaVersion: 2,
  responseSets: [{ key: 'shared', options: [{ value: 1, label: '原选项一', score: 7 }, { value: '1', label: '原选项二', score: 9 }] }, { key: 'other', options: [{ value: 'a', label: 'A', score: 0 }, { value: 'b', label: 'B', score: 1 }] }],
  items: [{ itemCode: 'original', content: '原有题目', type: 'single', required: true, sortOrder: 1, responseSetKey: 'shared' }],
  scoring: { itemRules: [{ itemCode: 'original', transform: { type: 'identity' } }], scores: [{ key: 'total', label: '总分', type: 'total', canonical: true, direction: 'descriptive', source: { type: 'items', aggregation: 'sum', items: [{ itemCode: 'original', weight: 1 }] } }] },
} })
const mount = () => render(<MemoryRouter><ScaleEdit /></MemoryRouter>)
beforeEach(() => {
  vi.clearAllMocks(); stored = fixture()
  api.get.mockImplementation(async () => ({ code: 0, data: structuredClone(stored) }))
  api.put.mockImplementation(async (_url, body) => { stored.definition = structuredClone(body.definition); return { code: 0, data: structuredClone(stored) } })
})

describe('Scale plain-text authoring', () => {
  it('appends required items with explicit reverse markers and preserves old identities and score membership', async () => {
    const user = userEvent.setup(); mount()
    await user.click(await screen.findByRole('button', { name: '题目' }))
    fireEvent.change(screen.getByLabelText('题干批量内容'), { target: { value: '新题一\r\n\n新题二 [反向]\n(R) 新题三' } })
    expect(screen.getByText(/将追加 3 题，其中 2 题反向计分/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '追加题目' }))
    expect(api.put).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '保存题目' }))
    await screen.findByText(/已保存，并重新读取确认/)
    const items = stored.definition.items
    expect(items.map((item: any) => item.content)).toEqual(['原有题目', '新题一', '新题二', '新题三'])
    expect(items.every((item: any) => item.required)).toBe(true)
    expect(new Set(items.map((item: any) => item.itemCode)).size).toBe(4)
    expect(items[0].itemCode).toBe('original')
    expect(items.map((item: any) => item.sortOrder)).toEqual([1, 2, 3, 4])
    expect(stored.definition.scoring.itemRules.map((rule: any) => rule.transform.type)).toEqual(['identity', 'identity', 'reverse', 'reverse'])
    expect(stored.definition.scoring.scores[0].source.items).toEqual([{ itemCode: 'original', weight: 1 }])
  })

  it('pastes labels without changing numeric/string identities, existing scores, or another response set', async () => {
    const other = structuredClone(stored.definition.responseSets[1])
    const user = userEvent.setup(); mount()
    await user.click(await screen.findByRole('button', { name: '响应选项' }))
    expect(screen.queryByPlaceholderText('稳定 value')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('选项批量内容'), { target: { value: '不同意\n一般\n同意' } })
    await user.click(screen.getByRole('button', { name: '应用选项文字' }))
    await user.click(screen.getByRole('button', { name: '保存响应集' }))
    await screen.findByText(/已保存，并重新读取确认/)
    const options = stored.definition.responseSets[0].options
    expect(options.slice(0, 2)).toEqual([{ value: 1, label: '不同意', score: 7 }, { value: '1', label: '一般', score: 9 }])
    expect(options[2]).toMatchObject({ label: '同意', score: 10 })
    expect(stored.definition.responseSets[1]).toEqual(other)
  })

  it('fills common labels and supports explicit option count changes', async () => {
    const user = userEvent.setup(); mount()
    await user.click(await screen.findByRole('button', { name: '响应选项' }))
    await user.click(screen.getByRole('button', { name: '5级同意程度' }))
    expect(screen.getByLabelText('选项数量')).toHaveValue('5')
    expect(screen.getByLabelText('选项 1 文字')).toHaveValue('非常不同意')
    expect(screen.getByLabelText('选项 5 文字')).toHaveValue('非常同意')
    await user.selectOptions(screen.getByLabelText('选项数量'), '3')
    expect(screen.queryByLabelText('选项 4 文字')).not.toBeInTheDocument()
    expect(screen.getByLabelText('选项 1 分值')).toHaveValue(7)
  })

  it('does not remove an attention target through bulk resizing', async () => {
    stored.definition.responseSets[0].options.push({ value: 'target', label: '指定目标', score: 10 })
    stored.definition.items.push({ itemCode: 'attention', content: '请选择指定目标', type: 'single', required: true, sortOrder: 2, responseSetKey: 'shared', purpose: 'ATTENTION_CHECK', attentionTarget: 'target' })
    const user = userEvent.setup(); mount()
    await user.click(await screen.findByRole('button', { name: '响应选项' }))
    await user.selectOptions(screen.getByLabelText('选项数量'), '2')
    expect(screen.getByRole('alert')).toHaveTextContent('请先修改目标答案')
    expect(screen.getByLabelText('选项数量')).toHaveValue('3')
    expect(api.put).not.toHaveBeenCalled()
  })

  it('omits bulk editing on frozen versions', async () => {
    stored.status = 'PUBLISHED'
    const user = userEvent.setup(); mount()
    await user.click(await screen.findByRole('button', { name: '题目' }))
    expect(screen.queryByLabelText('题干批量内容')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '响应选项' }))
    expect(screen.queryByLabelText('选项批量内容')).not.toBeInTheDocument()
    expect(screen.getByLabelText('选项 1 文字')).toBeDisabled()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('adds an explicit reverse rule for an existing item with an implicit forward default', async () => {
    stored.definition.scoring.itemRules = []
    const user = userEvent.setup(); mount()
    await user.click(await screen.findByRole('button', { name: '题目' }))
    await user.click(screen.getByRole('checkbox', { name: '反向计分' }))
    await user.click(screen.getByRole('button', { name: '保存题目' }))
    await screen.findByText(/已保存，并重新读取确认/)
    expect(stored.definition.scoring.itemRules).toEqual([{ itemCode: 'original', transform: { type: 'reverse' } }])
  })

  it('keeps literal marker-like text and rejects empty markers or excessive rows', () => {
    expect(parseScaleItemPaste('保留 R&D 与 (R) 中间内容\n普通题')).toEqual([{ content: '保留 R&D 与 (R) 中间内容', reverse: false }, { content: '普通题', reverse: false }])
    expect(() => parseScaleItemPaste('[反向]')).toThrow('填写题干')
    expect(() => parseScaleItemPaste(Array(201).fill('题目').join('\n'))).toThrow('最多录入 200')
  })
})
