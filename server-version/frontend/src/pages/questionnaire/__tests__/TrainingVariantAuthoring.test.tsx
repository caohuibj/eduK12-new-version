import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTrainingVariants } from '../trainingVariants'
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: api }))
vi.mock('../../../contexts/CapabilitiesContext', () => ({ useCognitiveEnabled: () => true }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teacher-1', role: 'TEACHER' } }) }))
vi.mock('../../../components/PublicDeliveryManager', () => ({ PublicDeliveryManager: () => null }))
import { QuestionnaireProductEdit } from '../QuestionnaireProducts'
const authoringUnits = [
  { id: 'context', type: 'FORM_SECTION', label: '共同背景', contextSection: true },
  { id: 'scale', type: 'SCALE', label: '量表甲' },
  { id: 'form', type: 'FORM_SECTION', label: '完整表单乙' },
]
const context = { id: 'context-field', type: 'FORM', formLabel: '背景单题不得分拆', position: 0 }
const form = { id: 'form-field', type: 'FORM', formLabel: '普通单题不得分拆', position: 2 }
const trainingCourse = { id: 'training', title: '培训课程', courseType: 'TRAINING_COURSE' }
function draft(extra: Record<string, unknown> = {}) {
  return {
    id: 'saved', productKind: 'QUESTIONNAIRE', name: '培训问卷', status: 'DRAFT', revision: 7, questionnaireType: 'COURSE',
    questionnaireCourses: [{ courseId: 'training' }], publicEnabled: false, maxAttempts: 1,
    trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null,
    items: [context, { id: 'scale', type: 'SCALE', scale: { name: '量表甲' }, position: 1 }, form],
    formSections: [
      { id: 'context', title: '共同背景', position: 0, contextSection: true, items: [context] },
      { id: 'form', title: '完整表单乙', position: 2, contextSection: false, items: [form] },
    ], ...extra,
  }
}
function mount(row = draft(), courses: Array<Record<string, unknown>> = [trainingCourse], id = 'saved') {
  api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? { scales: [], cognitive: [], situational: [], courses } : row }))
  render(<MemoryRouter initialEntries={['/questionnaire-products/' + id]}><Routes><Route path="/questionnaire-products/:id" element={<QuestionnaireProductEdit />} /></Routes></MemoryRouter>)
}
async function enable() {
  await userEvent.setup().click(await screen.findByRole('checkbox', { name: '启用按权重随机分组' }))
  return screen.getByRole('region', { name: '按权重随机分组' })
}
beforeEach(() => { vi.resetAllMocks() })
describe('Training weighted variants authoring', () => {
  it('requires explicit opt-in after a draft exists and preserves ordinary null behavior', async () => {
    mount()
    expect(await screen.findByRole('checkbox', { name: '启用按权重随机分组' })).not.toBeChecked()
    expect(screen.queryByLabelText('最多作答次数')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发布组合测评' })).toBeEnabled()
    expect(api.post).not.toHaveBeenCalled()
  })
  it.each([
    ['unknown catalog type', [{ id: 'training', title: '培训课程' }], {}],
    ['legacy course', [{ ...trainingCourse, courseType: 'LEGACY' }], {}],
    ['library course', [{ ...trainingCourse, isLibrary: true }], {}],
    ['mixed courses', [trainingCourse, { id: 'legacy', title: '旧课程', courseType: 'LEGACY' }], { questionnaireCourses: [{ courseId: 'training' }, { courseId: 'legacy' }] }],
    ['standalone', [trainingCourse], { questionnaireType: 'GENERAL' }],
    ['report package', [trainingCourse], { reportPackage: { key: 'package' } }],
    ['public multi-course', [trainingCourse, { ...trainingCourse, id: 'second' }], { publicEnabled: true, questionnaireCourses: [{ courseId: 'training' }, { courseId: 'second' }] }],
  ])('does not expose opt-in for %s', async (_label, courses, extra) => {
    mount(draft(extra), courses)
    await screen.findByDisplayValue('培训问卷')
    expect(screen.queryByRole('region', { name: '按权重随机分组' })).not.toBeInTheDocument()
  })
  it('does not expose opt-in before creating a draft', async () => {
    mount(draft(), [trainingCourse], 'new')
    await screen.findByRole('checkbox', { name: '培训课程' })
    expect(screen.queryByRole('checkbox', { name: '启用按权重随机分组' })).not.toBeInTheDocument()
  })
  it('allows an optional public link on one real Training course', async () => {
    mount(draft({ publicEnabled: true, expiresAt: '2026-12-31T12:00:00.000Z' }))
    expect(await screen.findByRole('checkbox', { name: '启用按权重随机分组' })).toBeEnabled()
  })
  it('saves full sections, required context, editable labels and guarded weighted configuration', async () => {
    const row = draft()
    api.post.mockImplementation(async (_path, body) => ({ code: 0, data: { ...row, revision: 8, trainingVariantDraft: body.config, maxAttempts: body.maxAttempts } }))
    mount(row)
    const region = await enable()
    expect(within(region).getByText(/权重代表概率，不保证精确人数或配额/)).toBeInTheDocument()
    expect(within(region).getByText(/取消作答也会消耗一次/)).toBeInTheDocument()
    expect(within(region).queryByRole('checkbox', { name: /单题不得分拆/ })).not.toBeInTheDocument()
    within(region).getAllByRole('checkbox', { name: /共同背景/ }).forEach(checkbox => { expect(checkbox).toBeChecked(); expect(checkbox).toBeDisabled() })
    fireEvent.change(screen.getByLabelText('分组 1 名称'), { target: { value: '教师命名甲' } })
    fireEvent.change(screen.getByLabelText('分组 2 权重'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('最多作答次数'), { target: { value: '4' } })
    fireEvent.click(within(region).getAllByRole('checkbox', { name: '量表甲' })[1])
    fireEvent.click(within(region).getAllByRole('checkbox', { name: '完整表单乙（完整表单区段）' })[0])
    expect(screen.getByRole('button', { name: '发布组合测评' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '添加到测评' })).toBeDisabled()
    await userEvent.setup().click(screen.getByRole('button', { name: '保存分组设置' }))
    expect(api.post).toHaveBeenCalledWith('/questionnaire-products/saved/training-variants', {
      revision: 7, maxAttempts: 4, config: { schemaVersion: 1, groups: [
        { variantKey: 'group_1', label: '教师命名甲', weight: 1, units: [{ type: 'FORM_SECTION', id: 'context' }, { type: 'ITEM', id: 'scale' }] },
        { variantKey: 'group_2', label: '分组 2', weight: 3, units: [{ type: 'FORM_SECTION', id: 'context' }, { type: 'FORM_SECTION', id: 'form' }] },
      ] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '发布组合测评' })).toBeEnabled())
    expect(screen.getByLabelText('分组 1 名称')).toHaveValue('教师命名甲')
    expect(api.put).not.toHaveBeenCalled()
  })
  it('blocks missing coverage, invalid weights and excessive attempt counts before sending', async () => {
    mount()
    const region = await enable()
    within(region).getAllByRole('checkbox', { name: '完整表单乙（完整表单区段）' }).forEach(checkbox => fireEvent.click(checkbox))
    fireEvent.click(screen.getByRole('button', { name: '保存分组设置' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('尚未选择：完整表单乙')
    fireEvent.click(within(region).getAllByRole('checkbox', { name: '完整表单乙（完整表单区段）' })[0])
    fireEvent.change(screen.getByLabelText('分组 1 权重'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '保存分组设置' }))
    expect(screen.getByRole('alert')).toHaveTextContent('权重须为 1–100')
    fireEvent.change(screen.getByLabelText('分组 1 权重'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('最多作答次数'), { target: { value: '101' } })
    fireEvent.click(screen.getByRole('button', { name: '保存分组设置' }))
    expect(screen.getByRole('alert')).toHaveTextContent('最多作答次数须为 1–100')
    expect(api.post).not.toHaveBeenCalled()
  })
  it('adds/removes groups within 2–8 and preserves surviving labels', async () => {
    mount()
    await enable()
    expect(screen.getByRole('button', { name: '移除分组 1' })).toBeDisabled()
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: '添加分组（最多 8 组）' }))
    expect(screen.getByRole('button', { name: '添加分组（最多 8 组）' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('分组 3 名称'), { target: { value: '保留名称' } })
    fireEvent.click(screen.getByRole('button', { name: '移除分组 2' }))
    expect(screen.getByLabelText('分组 2 名称')).toHaveValue('保留名称')
    expect(screen.getByRole('button', { name: '添加分组（最多 8 组）' })).toBeEnabled()
  })
  it('saves null without maxAttempts and restores ordinary flow', async () => {
    const row = draft({ trainingVariantDraft: createTrainingVariants(authoringUnits), maxAttempts: 5 })
    api.post.mockResolvedValue({ code: 0, data: { ...row, revision: 8, trainingVariantDraft: null } })
    mount(row)
    await userEvent.setup().click(await screen.findByRole('checkbox', { name: '启用按权重随机分组' }))
    await userEvent.setup().click(screen.getByRole('button', { name: '保存分组设置' }))
    expect(api.post).toHaveBeenCalledWith('/questionnaire-products/saved/training-variants', { revision: 7, config: null })
    expect(screen.queryByLabelText('最多作答次数')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '发布组合测评' })).toBeEnabled())
  })
  it('disables the config before saving a delivery change outside Training', async () => {
    const row = draft({ trainingVariantDraft: createTrainingVariants(authoringUnits), maxAttempts: 5 })
    api.post.mockResolvedValue({ code: 0, data: { ...row, revision: 8, trainingVariantDraft: null } })
    api.put.mockResolvedValue({ code: 0, data: { ...row, revision: 9, trainingVariantDraft: null, questionnaireCourses: [{ courseId: 'legacy' }] } })
    mount(row, [trainingCourse, { id: 'legacy', title: '旧课程', courseType: 'LEGACY' }])
    await userEvent.setup().click(await screen.findByRole('checkbox', { name: '启用按权重随机分组' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '培训课程' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '旧课程' }))
    await userEvent.setup().click(screen.getByRole('button', { name: '保存全部设置' }))
    expect(api.post).toHaveBeenCalledWith('/questionnaire-products/saved/training-variants', { revision: 7, config: null })
    expect(api.put).toHaveBeenCalledWith('/questionnaire-products/saved', expect.objectContaining({ revision: 8, courseIds: ['legacy'] }))
    await waitFor(() => expect(screen.queryByRole('region', { name: '按权重随机分组' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: '发布组合测评' })).toBeEnabled()
  })
  it('uses a new metadata revision and preserves group edits on partial save failure', async () => {
    const row = draft()
    api.put.mockResolvedValue({ code: 0, data: { ...row, name: '新名称', revision: 8 } })
    api.post.mockResolvedValueOnce({ code: 409, message: '版本冲突，请刷新后重试' }).mockImplementation(async (_path, body) => ({ code: 0, data: { ...row, name: '新名称', revision: 9, trainingVariantDraft: body.config, maxAttempts: body.maxAttempts } }))
    mount(row)
    await enable()
    fireEvent.change(screen.getByLabelText('测评名称'), { target: { value: '新名称' } })
    fireEvent.change(screen.getByLabelText('分组 1 名称'), { target: { value: '未丢失的编辑' } })
    await userEvent.setup().click(screen.getByRole('button', { name: '保存全部设置' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('版本冲突')
    expect(api.put).toHaveBeenCalledWith('/questionnaire-products/saved', expect.objectContaining({ name: '新名称', revision: 7 }))
    expect(api.post).toHaveBeenLastCalledWith('/questionnaire-products/saved/training-variants', expect.objectContaining({ revision: 8 }))
    expect(screen.getByLabelText('分组 1 名称')).toHaveValue('未丢失的编辑')
    expect(screen.getByRole('button', { name: '发布组合测评' })).toBeDisabled()
    await userEvent.setup().click(screen.getByRole('button', { name: '保存分组设置' }))
    expect(api.put).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole('button', { name: '发布组合测评' })).toBeEnabled())
  })
  it('guards repeated pending saves and hydrates conflict reload state', async () => {
    let finish!: (response: unknown) => void
    api.post.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const row = draft()
    mount(row)
    await enable()
    const save = screen.getByRole('button', { name: '保存分组设置' })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(save).toBeDisabled()
    expect(screen.getByLabelText('分组 1 名称')).toBeDisabled()
    await act(async () => { finish({ code: 409, message: '版本冲突' }) })
    row.revision = 11
    await userEvent.setup().click(screen.getByRole('button', { name: '刷新问卷' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: '启用按权重随机分组' })).not.toBeChecked())
    expect(screen.getByRole('button', { name: '发布组合测评' })).toBeEnabled()
  })
  it('renders only a frozen summary and does not leak allocation internals', async () => {
    const config = createTrainingVariants(authoringUnits)
    config.groups[0].label = '发布名称甲'
    const frozen = { ...config, configDigest: 'PRIVATE_CONFIG_DIGEST', unionDigest: 'PRIVATE_UNION_DIGEST', groups: config.groups.map(group => ({ ...group, selectedItemIds: ['PRIVATE_ITEM_ID'], selectedSectionIds: ['PRIVATE_SECTION_ID'] })) }
    mount(draft({ status: 'PUBLISHED', trainingVariantDraft: config, trainingVariantFrozen: frozen, trainingVariantDigest: 'PRIVATE_CONFIG_DIGEST', maxAttempts: 6 }))
    const region = await screen.findByRole('region', { name: '按权重随机分组' })
    expect(within(region).getByText(/分组、权重、内容与作答次数已冻结/)).toBeInTheDocument()
    expect(within(region).getByText('每位作答者最多作答 6 次。')).toBeInTheDocument()
    expect(within(region).getByText('发布名称甲')).toBeInTheDocument()
    expect(within(region).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(region).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(region).queryByRole('button')).not.toBeInTheDocument()
    expect(region).not.toHaveTextContent('PRIVATE_')
  })
  it('leaves published ordinary Training questions unchanged', async () => {
    mount(draft({ status: 'PUBLISHED' }))
    await screen.findByDisplayValue('培训问卷')
    expect(screen.queryByRole('region', { name: '按权重随机分组' })).not.toBeInTheDocument()
  })
})
