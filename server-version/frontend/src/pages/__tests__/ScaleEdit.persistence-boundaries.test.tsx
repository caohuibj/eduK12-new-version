import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }))
vi.mock('../../api/client', () => ({ default: api }))
import ScaleEdit from '../ScaleEdit'
const definition = () => ({
  schemaVersion: 2, license: { status: 'self_authored', redistribution: 'allowed', note: '原声明' },
  responseSets: [{ key: 'mixed', options: [{ value: 1, label: '数字一', score: 1 }, { value: '1', label: '文本一', score: 2 }, { value: '', label: '空文本', score: 3 }] }],
  items: [{ itemCode: 'A', content: '请选择目标', type: 'single', required: true, sortOrder: 1, responseSetKey: 'mixed', purpose: 'ATTENTION_CHECK', attentionTarget: 1 }],
  scoring: { itemRules: [], scores: [] }, report: { interpretations: [] },
})
let stored: any
const mount = (id = 'scale-1') => render(<MemoryRouter initialEntries={['/scales/' + id]}><Routes><Route path="/scales/:id" element={<ScaleEdit />} /></Routes></MemoryRouter>)
beforeEach(() => {
  vi.clearAllMocks()
  stored = { id: 'scale-1', code: 'custom', name: '量表', description: '', instruction: '', visibility: 'HIDDEN', status: 'DRAFT', instrumentClass: 'CUSTOM_DESCRIPTIVE', definition: definition() }
  api.get.mockImplementation(async () => ({ code: 0, data: structuredClone(stored) }))
  api.put.mockImplementation(async (_path, body) => {
    if (body.definition) stored.definition = structuredClone(body.definition)
    else Object.assign(stored, body)
    return { code: 0, data: structuredClone(stored) }
  })
  api.post.mockImplementation(async (_path, body) => { Object.assign(stored, body); return { code: 0, data: structuredClone(stored) } })
})
describe('Training scale persistence boundaries', () => {
  it('only accepts persistable metadata before creation, then enables definition authoring', async () => {
    const user = userEvent.setup(); mount('new')
    for (const name of ['响应选项', '题目', '计分', '报告文案']) {
      const tab = screen.getByRole('button', { name: new RegExp('^' + name + '$') })
      expect(tab).toBeDisabled(); await user.click(tab)
    }
    expect(screen.getByText(/此步骤仅保存基本元数据/)).toBeInTheDocument()
    expect(screen.queryByLabelText('自有内容 / 授权声明')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '增加题目' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存报告定义' })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('量表编码'), 'new-code')
    await user.type(screen.getByLabelText('量表名称'), '新量表')
    await user.type(screen.getByLabelText('作答指导'), '新指导')
    await user.click(screen.getByRole('button', { name: '保存基本信息' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/scales', expect.objectContaining({ code: 'new-code', name: '新量表', instruction: '新指导' })))
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('definition')
    expect(api.put).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: /^报告文案$/ })).toBeEnabled())
    expect(screen.getByLabelText('量表名称')).toHaveValue('新量表')
    expect(screen.getByLabelText('作答指导')).toHaveValue('新指导')
    await user.click(screen.getByRole('button', { name: /^报告文案$/ }))
    expect(await screen.findByLabelText('自有内容 / 授权声明')).toBeEnabled()
  })

  it('keeps new metadata and the creation boundary after a failed create', async () => {
    api.post.mockRejectedValue(new Error('创建暂不可用'))
    const user = userEvent.setup(); mount('new')
    await user.type(screen.getByLabelText('量表编码'), 'retained-code')
    await user.type(screen.getByLabelText('量表名称'), '保留名称')
    await user.type(screen.getByLabelText('作答指导'), '保留指导')
    await user.click(screen.getByRole('button', { name: '保存基本信息' }))
    await screen.findByText(/创建暂不可用/)
    expect(screen.getByLabelText('量表编码')).toHaveValue('retained-code')
    expect(screen.getByLabelText('量表名称')).toHaveValue('保留名称')
    expect(screen.getByLabelText('作答指导')).toHaveValue('保留指导')
    expect(screen.getByRole('button', { name: '保存基本信息' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^题目$/ })).toBeDisabled()
    expect(api.get).not.toHaveBeenCalled()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('saves the declaration only with the definition and confirms the readback', async () => {
    const user = userEvent.setup(); mount()
    await screen.findByDisplayValue('量表')
    expect(screen.queryByLabelText('自有内容 / 授权声明')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^报告文案$/ }))
    await user.clear(screen.getByLabelText('自有内容 / 授权声明'))
    await user.type(screen.getByLabelText('自有内容 / 授权声明'), '新声明：允许合成测试')
    await user.click(screen.getByRole('button', { name: /^基本信息$/ }))
    await user.click(screen.getByRole('button', { name: '保存基本信息' }))
    await screen.findByText(/基本信息已保存/)
    expect(stored.definition.license.note).toBe('原声明')
    expect(api.put.mock.calls[0][1]).not.toHaveProperty('definition')
    await user.click(screen.getByRole('button', { name: /^报告文案$/ }))
    expect(screen.getByLabelText('自有内容 / 授权声明')).toHaveValue('新声明：允许合成测试')
    await user.click(screen.getByRole('button', { name: '保存报告定义' }))
    await screen.findByText(/已保存，并重新读取确认/)
    expect(stored.definition.license.note).toBe('新声明：允许合成测试')
    expect(screen.getByLabelText('自有内容 / 授权声明')).toHaveValue('新声明：允许合成测试')
  })

  it('rejects a declaration readback that silently lost the edit', async () => {
    api.put.mockImplementation(async () => ({ code: 0, data: structuredClone(stored) }))
    const user = userEvent.setup(); mount()
    await user.click(await screen.findByRole('button', { name: /^报告文案$/ }))
    await user.clear(screen.getByLabelText('自有内容 / 授权声明'))
    await user.type(screen.getByLabelText('自有内容 / 授权声明'), '必须保存的新声明')
    await user.click(screen.getByRole('button', { name: '保存报告定义' }))
    await screen.findByText(/保存后的授权声明与当前编辑不一致/)
    expect(screen.getByLabelText('自有内容 / 授权声明')).toHaveValue('必须保存的新声明')
    expect(screen.queryByText(/已保存，并重新读取确认/)).not.toBeInTheDocument()
  })

  it('preserves numeric, string and empty-string target identities through save and readback', async () => {
    const user = userEvent.setup(); mount()
    await user.click(await screen.findByRole('button', { name: /^题目$/ }))
    const target = screen.getByRole('combobox', { name: '目标选项 A' })
    for (const [label, value] of [['文本一', '1'], ['数字一', 1], ['空文本', '']] as const) {
      await user.selectOptions(target, screen.getByRole('option', { name: new RegExp('^' + label + '$') }))
      await user.click(screen.getByRole('button', { name: '保存题目' }))
      await waitFor(() => expect(stored.definition.items[0].attentionTarget).toBe(value))
      await screen.findByText(/已保存，并重新读取确认/)
      expect(target).toHaveValue(JSON.stringify(value))
    }
    api.put.mockClear()
    await user.selectOptions(target, screen.getByRole('option', { name: /^请选择目标选项$/ }))
    await user.click(screen.getByRole('button', { name: '保存题目' }))
    await screen.findByText(/注意力目标选项已失效/)
    expect(api.put).not.toHaveBeenCalled()
    expect(target).toHaveValue('')
  })
})
