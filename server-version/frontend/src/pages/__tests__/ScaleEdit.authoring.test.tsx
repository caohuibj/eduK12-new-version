import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), upload: vi.fn(), csrf: vi.fn() }))
const presentation = vi.hoisted(() => ({ training: false }))
vi.mock('../../training/context', async importOriginal => ({ ...await importOriginal<typeof import('../../training/context')>(), isTrainingHost: () => presentation.training }))
vi.mock('../../api/client', () => ({ default: api, ensureCsrfToken: api.csrf, sessionAxios: { post: api.upload } }))
vi.mock('react-router-dom', async () => ({ ...await vi.importActual('react-router-dom'), useParams: () => ({ id: 'scale-1' }) }))
import ScaleEdit from '../ScaleEdit'
const fixture = () => ({
  schemaVersion: 2,
  responseSets: [{ key: 'likert', options: [{ value: 'never', label: '从不', score: 0 }, { value: 'always', label: '总是', score: 1 }] }],
  items: ['Q1', 'Q2'].map((itemCode, index) => ({ itemCode, content: itemCode, type: 'single', required: true, sortOrder: index + 1, responseSetKey: 'likert', randomizeOptions: false })),
  scoring: { itemRules: ['Q1', 'Q2'].map(itemCode => ({ itemCode, transform: { type: 'identity' } })), scores: [{ key: 'total', type: 'total', label: '总分', canonical: true, direction: 'descriptive', source: { type: 'items', aggregation: 'sum', items: [{ itemCode: 'Q1', weight: 1 }, { itemCode: 'Q2', weight: 1 }] } }] },
  report: { interpretations: [{ scoreKey: 'total', headline: '总分', summary: '原解释', source: { type: 'score_only' }, bands: [], guidance: [] }] },
})
let stored: any
beforeEach(() => {
  vi.clearAllMocks(); presentation.training = false; stored = fixture()
  api.get.mockImplementation(async () => ({ code: 0, data: { id: 'scale-1', code: 'custom', name: '量表', status: 'DRAFT', instrumentClass: 'CUSTOM_DESCRIPTIVE', definition: structuredClone(stored) } }))
  api.put.mockImplementation(async (_path, body) => { stored = structuredClone(body.definition); return { code: 0, data: { updatedAt: undefined } } })
})
describe('Training scale authoring additions', () => {
  it.each([
    [true, '/scales/scale-1', '返回工具', '/toolkit'],
    [true, '/scales/scale-1?courseId=course-1', '返回当前课程', '/courses/course-1/detail?section=assessments'],
    [false, '/scales/scale-1', '返回量表列表', '/scales'],
  ] as const)('retains the appropriate return destination for %s / %s', async (training, path, label, target) => {
    presentation.training = training
    render(<MemoryRouter initialEntries={[path]}><ScaleEdit /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: label })).toHaveAttribute('href', target)
  })
  it('orders and duplicates using new identity without changing existing scoring membership', async () => {
    const user = userEvent.setup(); render(<MemoryRouter><ScaleEdit /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '题目' }))
    await user.click(await screen.findByRole('button', { name: '下移 Q1' }))
    await user.click(screen.getByRole('button', { name: '复制 Q2' }))
    await user.click(screen.getByRole('button', { name: '保存题目' }))
    await waitFor(() => expect(stored.items).toHaveLength(3))
    expect(stored.items.map((item: any) => item.itemCode)[0]).toBe('Q2')
    expect(stored.items[1].itemCode).not.toBe('Q2')
    expect(stored.items[2].itemCode).toBe('Q1')
    expect(stored.items.map((item: any) => item.sortOrder)).toEqual([1, 2, 3])
    expect(stored.scoring.scores[0].source.items.map((item: any) => item.itemCode)).toEqual(['Q1', 'Q2'])
  })
  it('shares Likert options and persists quality items only outside score selection', async () => {
    const user = userEvent.setup(); render(<MemoryRouter><ScaleEdit /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '题目' }))
    await user.click(await screen.findByText('更多录入方式与辅助题'))
    await user.click(screen.getByRole('button', { name: '插入注意力题' }))
    await user.click(screen.getByRole('button', { name: '插入社会赞许性题（测谎题）' }))
    const target = screen.getByRole('combobox', { name: /目标选项/ })
    await user.selectOptions(target, screen.getByRole('option', { name: /^总是$/ }))
    await user.click(screen.getByRole('button', { name: '保存题目' }))
    await waitFor(() => expect(stored.items).toHaveLength(4))
    const attention = stored.items[2], social = stored.items[3]
    expect(attention).toMatchObject({ purpose: 'ATTENTION_CHECK', attentionTarget: 'always', responseSetKey: 'likert' })
    expect(social).toMatchObject({ purpose: 'SOCIAL_DESIRABILITY', content: '我从不撒谎', responseSetKey: 'likert' })
    expect(stored.scoring.itemRules).toHaveLength(2)
    await screen.findByText(/已保存，并重新读取确认/)
    await user.click(screen.getByRole('button', { name: '计分' }))
    expect(screen.queryByRole('button', { name: attention.itemCode })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: social.itemCode })).not.toBeInTheDocument()
    expect(screen.getByText(/已纳入 2\/2 题/)).toBeInTheDocument()
  })
  it('does not confirm a readback that silently strips quality item metadata', async () => {
    api.put.mockImplementation(async (_path, body) => {
      stored = structuredClone(body.definition)
      stored.items = stored.items.map((item: any) => { const next = { ...item }; delete next.purpose; delete next.attentionTarget; return next })
      return { code: 0, data: {} }
    })
    const user = userEvent.setup(); render(<MemoryRouter><ScaleEdit /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '题目' }))
    await user.click(screen.getByText('更多录入方式与辅助题'))
    await user.click(screen.getByRole('button', { name: '插入注意力题' }))
    await user.click(screen.getByRole('button', { name: '保存题目' }))
    await screen.findByText(/保存后的题型或反馈配置与当前编辑不一致/)
    expect(screen.getByRole('combobox', { name: /目标选项/ })).toBeInTheDocument()
    expect(screen.queryByText(/已保存，并重新读取确认/)).not.toBeInTheDocument()
  })
  it('blocks save and publication until feedback image upload settles', async () => {
    let finish!: (value: unknown) => void
    api.csrf.mockResolvedValue('csrf')
    api.upload.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const user = userEvent.setup(); render(<MemoryRouter><ScaleEdit /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '报告文案' }))
    await user.click(screen.getByRole('button', { name: '增加原始分反馈区间' }))
    await user.type(screen.getByRole('textbox', { name: 'total 区间 1 反馈文字' }), '反馈')
    await user.upload(screen.getByLabelText('上传反馈图片'), new File(['png'], 'feedback.png', { type: 'image/png' }))
    await waitFor(() => expect(api.upload).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: '保存报告定义' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '发布自用（描述性量表）' })).toBeDisabled()
    finish({ data: { code: 0, data: { assetId: 'asset-1', contentHash: 'a'.repeat(64), mimeType: 'image/png' } } })
    await waitFor(() => expect(screen.getByRole('button', { name: '保存报告定义' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '保存报告定义' }))
    await waitFor(() => expect(stored.report.rawScoreFeedback.rules[0].ranges[0].images[0].asset.assetId).toBe('asset-1'))
  })
  it('validates raw feedback before save and keeps simulation separate from server preview', async () => {
    const user = userEvent.setup(); render(<MemoryRouter><ScaleEdit /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '报告文案' }))
    await user.click(screen.getByRole('button', { name: '增加原始分反馈区间' }))
    expect(screen.getByRole('button', { name: '计分预览' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '保存报告定义' }))
    expect(api.put).not.toHaveBeenCalled()
    await user.type(screen.getByRole('textbox', { name: 'total 区间 1 反馈文字' }), '描述性区间反馈')
    await user.type(screen.getByRole('spinbutton', { name: /模拟原始分/ }), '0.5')
    expect(screen.getAllByText('描述性区间反馈').length).toBeGreaterThan(0)
    expect(api.post).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '保存报告定义' }))
    await waitFor(() => expect(stored.report.rawScoreFeedback?.rules[0].ranges[0].text).toBe('描述性区间反馈'))
  })
})
