import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: api }))
vi.mock('../../../training/context', () => ({ isTrainingHost: () => true }))
vi.mock('../../../contexts/CapabilitiesContext', () => ({ useCognitiveEnabled: () => true }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teacher', role: 'TEACHER' } }) }))
import { QuestionnaireProductEdit } from '../QuestionnaireProducts'
import { FormTemplatePicker } from '../FormTemplatePicker'
const row = { id: 'form', productKind: 'FORM_TEMPLATE', name: '课后反馈', status: 'DRAFT', questionnaireType: 'GENERAL', revision: 2, publicEnabled: false, items: [{ id: 'question', type: 'FORM', position: 0, formLabel: '你的感受', formType: 'text_input', required: true, contextKey: null, formSectionId: 'section', formSectionPosition: 0 }], formSections: [] as any[], questionnaireCourses: [] }
row.formSections = [{ id: 'section', title: '反馈', position: 0, contextSection: false, items: row.items }]
function mount(id = 'new') {
  render(<MemoryRouter initialEntries={['/toolkit/forms/' + id]}><Routes><Route path="/toolkit/forms/:id" element={<QuestionnaireProductEdit formTemplate/>}/></Routes></MemoryRouter>)
}
beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear(); api.get.mockResolvedValue({ code: 0, data: row }) })
afterEach(cleanup)
describe('Independent form authoring and whole-form selection', () => {
  it('creates a persistent independent form without delivery or scientific configuration', async () => {
    api.post.mockResolvedValue({ code: 0, data: row })
    mount()
    expect(await screen.findByRole('heading', { name: '编制表单' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← 返回工具 · 表单' })).toHaveAttribute('href', '/toolkit?kind=form')
    expect(screen.queryByRole('navigation', { name: '编制步骤' })).not.toBeInTheDocument()
    expect(screen.queryByText('投放设置')).not.toBeInTheDocument()
    expect(screen.queryByText('报告模板')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('表单名称'), { target: { value: '课后反馈' } })
    fireEvent.click(screen.getByRole('button', { name: '创建草稿' }))
    await screen.findByRole('heading', { name: '编辑表单' })
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/questionnaire-products/form-templates', { name: '课后反馈', description: '', instruction: '', requestId: expect.any(String) })
    expect(api.get).not.toHaveBeenCalledWith('/questionnaire-products/resources')
    expect(screen.getByRole('button', { name: '添加题目' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '发布组合测评' })).not.toBeInTheDocument()
  })
  it('loads mature form controls and saves an existing question with its revision and identity', async () => {
    api.put.mockResolvedValue({ code: 0, data: { ...row, revision: 3 } })
    mount('form')
    fireEvent.click(await screen.findByRole('button', { name: '编辑此题' }))
    expect(screen.getByLabelText('题目文字')).toHaveValue('你的感受')
    expect(screen.getByRole('option', { name: 'Likert' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '矩阵单选' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('题目文字'), { target: { value: '更新后的反馈题干' } })
    fireEvent.click(screen.getByRole('button', { name: '保存题目修改' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledExactlyOnceWith('/questionnaire-products/form/form-items/question', expect.objectContaining({ revision: 2, item: expect.objectContaining({ type: 'FORM', formLabel: '更新后的反馈题干' }) })))
    expect(api.post).not.toHaveBeenCalled()
  })
  it('searches form cards and passes only the selected source identity/revision for atomic import', async () => {
    const onImport = vi.fn()
    api.get.mockResolvedValue({ code: 0, data: { list: [{ id: 'first', name: '课前需求', kind: 'COMPOSITE', revision: 4 }, { id: 'second', name: '课后反馈', kind: 'LEGACY' }] } })
    render(<FormTemplatePicker disabled={false} onImport={onImport}/>)
    fireEvent.click(await screen.findByRole('button', { name: /选择已有表单/ }))
    fireEvent.change(screen.getByRole('textbox', { name: '检索工具' }), { target: { value: '课前' } })
    expect(screen.queryByRole('button', { name: '选择 课后反馈' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '选择 课前需求，版本 修订 4' }))
    fireEvent.click(screen.getByRole('button', { name: '整份加入当前问卷' }))
    expect(onImport).toHaveBeenCalledExactlyOnceWith({ id: 'first', kind: 'COMPOSITE', revision: 4 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('edits a stored typed question without sending its server-owned item key', async () => {
    const definition = { itemKey: 'q_server', type: 'SINGLE', prompt: '你的感受', required: true, options: [{ optionKey: 'a', label: '好' }, { optionKey: 'b', label: '一般' }], rows: [] }
    const question = { ...row.formSections[0].items[0], formType: 'single_choice', formOptions: [{ value: 'a', label: '好' }, { value: 'b', label: '一般' }], formDefinition: definition, formPolicy: { version: 3, requiredRefusal: 'BLOCK_SUBMIT', hiddenRequired: 'EXEMPT' } }
    const typed = { ...row, items: [{ id: 'question', type: 'FORM', position: 0, required: true, form: { type: 'single_choice', label: '你的感受', formDefinition: definition } }], formSections: [{ ...row.formSections[0], items: [question] }] }
    api.get.mockResolvedValue({ code: 0, data: typed }); api.put.mockResolvedValue({ code: 0, data: typed })
    mount('form')
    fireEvent.click(await screen.findByRole('button', { name: '编辑此题' }))
    fireEvent.change(screen.getByLabelText('题目文字'), { target: { value: '更新后的题干' } })
    fireEvent.click(screen.getByRole('button', { name: '保存题目修改' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledOnce())
    expect(api.put.mock.calls[0][1].item.formDefinition).not.toHaveProperty('itemKey')
    expect(api.put.mock.calls[0][1].item.formDefinition.options).toEqual(definition.options)
  })
  it('keeps failed source reads recoverable and does not import while disabled', async () => {
    const onImport = vi.fn()
    api.get.mockRejectedValueOnce(new Error('连接失败')).mockResolvedValue({ code: 0, data: { list: [] } })
    render(<FormTemplatePicker disabled onImport={onImport}/>)
    expect(await screen.findByRole('alert')).toHaveTextContent('连接失败')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '重新读取' })))
    expect(await screen.findByRole('button', { name: /选择已有表单/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: '整份加入当前问卷' })).toBeDisabled()
    expect(onImport).not.toHaveBeenCalled()
  })
})
