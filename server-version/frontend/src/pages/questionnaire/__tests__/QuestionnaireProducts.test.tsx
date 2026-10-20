import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const capabilities = vi.hoisted(() => ({ enabled: true }))
vi.mock('../../../contexts/CapabilitiesContext', () => ({ useCognitiveEnabled: () => capabilities.enabled }))
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: api }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teacher-1', role: 'TEACHER' } }) }))
vi.mock('../../../components/PublicDeliveryManager', () => ({
  PublicDeliveryManager: () => null,
}))
import { QuestionnaireProductEdit } from '../QuestionnaireProducts'
function mount(id = 'new', search = '') {
  render(
    <MemoryRouter initialEntries={['/questionnaire-products/' + id + search]}>
      <Routes>
        <Route
          path="/questionnaire-products/:id"
          element={<QuestionnaireProductEdit />}
        />
      </Routes>
    </MemoryRouter>,
  )
}
describe('questionnaire draft feedback', () => {
  beforeEach(() => {
    capabilities.enabled = true
    vi.resetAllMocks()
    api.get.mockResolvedValue({
      code: 0,
      data: {
        scales: [],
        cognitive: [],
        situational: [],
        courses: [{ id: 'c', title: '课程' }],
      },
    })
  })
  it('hides the cognitive authoring type while disabled and preserves stored cognitive content', async () => {
    capabilities.enabled = false
    const row = { name: '历史认知问卷', status: 'DRAFT', revision: 1, questionnaireType: 'COURSE', questionnaireCourses: [], items: [{ id:'cog', type:'COGNITIVE', position:0, cognitiveAssignment:{ title:'历史认知任务' } }], formSections: [], publicEnabled:false }
    api.get.mockImplementation(async path => ({ code:0, data:path.endsWith('/resources') ? { scales:[], cognitive:[], situational:[], courses:[] } : row }))
    mount('saved')
    await screen.findByDisplayValue('历史认知问卷')
    expect(screen.queryByRole('option', { name:'认知测验' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '配置第 1 项：1. 历史认知任务' })).toBeInTheDocument()
  })

  it('exposes the active composition section to keyboard and screen-reader users', async () => {
    mount()
    const steps = screen.getByRole('navigation', { name: '编制步骤' })
    const basic = steps.querySelector('a[href="#questionnaire-basic"]')!
    const delivery = steps.querySelector('a[href="#questionnaire-delivery"]')!
    expect(basic).toHaveAttribute('aria-current', 'step')
    fireEvent.click(delivery)
    expect(delivery).toHaveAttribute('aria-current', 'step')
    expect(basic).not.toHaveAttribute('aria-current')
  })

  it('prefills only an authorized course passed by the Training course route', async () => {
    mount('new', '?courseId=c')
    const courseCheck = await screen.findByRole('checkbox', { name: '课程' })
    await waitFor(() => expect(courseCheck).toBeChecked())
  })

  it('does not preselect an unlisted course from a tampered URL', async () => {
    mount('new', '?courseId=outside')
    const courseCheck = await screen.findByRole('checkbox', { name: '课程' })
    expect(courseCheck).not.toBeChecked()
  })

  it('discards a previous questionnaire response after switching pages', async () => {
    let resolveOld!: (value: unknown) => void
    const oldRequest = new Promise(resolve => { resolveOld = resolve })
    const row = (name: string) => ({ name, status: 'DRAFT', revision: 1, questionnaireType: 'COURSE', questionnaireCourses: [], items: [], formSections: [], publicEnabled: false })
    api.get.mockImplementation(async path => path.endsWith('/resources')
      ? { code: 0, data: { scales: [], cognitive: [], situational: [], courses: [] } }
      : path.endsWith('/old') ? oldRequest : { code: 0, data: row('当前问卷') })
    render(<MemoryRouter initialEntries={['/questionnaire-products/old']}><Link to="/questionnaire-products/current">切换问卷</Link><Routes><Route path="/questionnaire-products/:id" element={<QuestionnaireProductEdit />} /></Routes></MemoryRouter>)
    await userEvent.setup().click(screen.getByRole('link', { name: '切换问卷' }))
    await screen.findByDisplayValue('当前问卷')
    await act(async () => { resolveOld({ code: 0, data: row('迟到的旧问卷') }); await oldRequest })
    expect(screen.getByLabelText('测评名称')).toHaveValue('当前问卷')
  })
  it('offers publication for a saved draft while preserving the revision guard', async () => {
    const row = { name: '待发布测评', status: 'DRAFT', revision: 7, questionnaireType: 'COURSE', questionnaireCourses: [], items: [], formSections: [], publicEnabled: false }
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? { scales: [], cognitive: [], situational: [], courses: [] } : row }))
    api.post.mockResolvedValue({ code: 0, data: { ...row, status: 'PUBLISHED', revision: 8 } })
    mount('saved')
    const publish = await screen.findByRole('button', { name: '发布组合测评' })
    expect(publish.closest('section')).toHaveAttribute('aria-label', '正式发布')
    await userEvent.setup().click(publish)
    expect(api.post).toHaveBeenCalledWith('/questionnaire-products/saved/publish', { revision: 7 })
    await waitFor(() => expect(screen.queryByRole('button', { name: '发布组合测评' })).not.toBeInTheDocument())
  })

  it('identifies and focuses an empty name without sending a request', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: '创建草稿' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请填写测评名称')
    expect(screen.getByLabelText('测评名称')).toHaveFocus()
    expect(screen.getByLabelText('测评名称')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(api.post).not.toHaveBeenCalled()
  })
  it('preserves API message objects and permits course-less drafts under the actual rule', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValue({ message: '该名称暂不可用' })
    mount()
    await user.type(screen.getByLabelText('测评名称'), '合成问卷')
    await user.click(screen.getByRole('button', { name: '创建草稿' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('该名称暂不可用')
    expect(api.post).toHaveBeenCalledWith(
      '/questionnaire-products',
      expect.objectContaining({ courseIds: [], name: '合成问卷' }),
    )
    expect(screen.getByLabelText('测评名称')).toHaveValue('合成问卷')
  })
  it('shows a field-level deadline requirement for public drafts', async () => {
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByLabelText('测评名称'), '公开问卷')
    await user.selectOptions(screen.getByLabelText('投放方式'), 'GENERAL')
    await user.click(screen.getByRole('button', { name: '创建草稿' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      '公开问卷需要设置截止时间',
    )
    expect(screen.getByLabelText('截止时间')).toHaveFocus()
    expect(api.post).not.toHaveBeenCalled()
  })
  it('rejects a deadline earlier than the opening time before saving', async () => {
    mount()
    fireEvent.change(screen.getByLabelText('测评名称'), { target: { value: '时间校验' } })
    fireEvent.change(screen.getByLabelText('开始时间'), { target: { value: '2026-10-20T09:00' } })
    fireEvent.change(screen.getByLabelText('截止时间'), { target: { value: '2026-10-19T18:00' } })
    fireEvent.click(screen.getByRole('button', { name: '创建草稿' }))
    expect(screen.getByRole('alert')).toHaveTextContent('截止时间不能早于开始时间')
    expect(screen.getByLabelText('截止时间')).toHaveFocus()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('blocks publication and hides stale checks after editing delivery settings', async () => {
    const row = { name: '投放测评', status: 'DRAFT', revision: 7, questionnaireType: 'COURSE', questionnaireCourses: [], items: [], formSections: [], publicEnabled: false }
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? { scales: [], cognitive: [], situational: [], courses: [] } : row }))
    api.post.mockResolvedValue({ code: 0, data: { revision: 7, ok: true, checks: [] } })
    mount('saved')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '发布前自检' }))
    await screen.findByRole('heading', { name: '当前草稿自检通过' })
    fireEvent.change(screen.getByLabelText('开始时间'), { target: { value: '2026-10-20T09:00' } })
    expect(screen.getByRole('button', { name: '发布组合测评' })).toBeDisabled()
    expect(screen.queryByRole('heading', { name: '当前草稿自检通过' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存投放设置' })).toBeEnabled()
  })

  it('rejects incomplete and invalid calendar dates before creating a public draft', async () => {
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByLabelText('测评名称'), '公开问卷')
    await user.selectOptions(screen.getByLabelText('投放方式'), 'GENERAL')
    fireEvent.change(screen.getByLabelText('截止时间'), { target: { value: '2026-02' } })
    expect(screen.getByLabelText('截止时间')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('截止时间'), { target: { value: '2026-02-31T23:59' } })
    await user.click(screen.getByRole('button', { name: '创建草稿' }))
    expect(screen.getByRole('alert')).toHaveTextContent('公开问卷需要设置截止时间')
    expect(screen.getByLabelText('截止时间')).toHaveFocus()
    expect(api.post).not.toHaveBeenCalled()
  })
  it('authors an ordinary optional Form with the original revision and no context binding', async () => {
    const row = { name: '普通表单', status: 'DRAFT', revision: 7, questionnaireType: 'COURSE', questionnaireCourses: [], items: [], formSections: [], publicEnabled: false }
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? { scales: [], cognitive: [], situational: [], courses: [] } : row }))
    api.post.mockResolvedValue({ code: 0, data: { ...row, revision: 8 } })
    mount('saved')
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('测评类型'), 'FORM')
    await user.type(screen.getByLabelText('题目文字'), '选填意见')
    await user.click(screen.getByRole('checkbox', { name: '必填' }))
    await user.click(screen.getByRole('button', { name: '添加到测评' }))
    expect(api.post).toHaveBeenCalledWith('/questionnaire-products/saved/items', { revision: 7, item: expect.objectContaining({ type: 'FORM', required: false, contextKey: null, formLabel: '选填意见' }) })
  })

})

describe('C04 typed authoring', () => {
  it.each(['number', 'long_text', 'date', 'time'])('creates %s using the public Form definition without a client itemKey', async type => {
    capabilities.enabled = true
    vi.resetAllMocks()
    const row = { name: '基础题型', status: 'DRAFT', revision: 4, questionnaireType: 'COURSE', questionnaireCourses: [], items: [], formSections: [], publicEnabled: false }
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? { scales: [], cognitive: [], situational: [], courses: [] } : row }))
    api.post.mockResolvedValue({ code: 0, data: { ...row, revision: 5 } })
    mount('typed')
    await screen.findByDisplayValue('基础题型')
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('测评类型'), 'FORM')
    await user.type(screen.getByLabelText('题目文字'), '合成题')
    await user.selectOptions(screen.getByLabelText('题型'), type)
    await user.click(screen.getByLabelText('必填'))
    if (type === 'number') {
      await user.type(screen.getByLabelText('最小值'), '0')
      await user.type(screen.getByLabelText('最大值'), '100')
      await user.type(screen.getByLabelText('最大小数位（留空表示不限制）'), '2')
    }
    if (type === 'time') await user.selectOptions(screen.getByLabelText('时间时区'), 'UTC')
    if (type === 'long_text') await user.type(screen.getByLabelText('字数上限'), '500')
    await user.click(screen.getByRole('button', { name: '添加到测评' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/questionnaire-products/typed/items')
    expect(body.revision).toBe(4)
    expect(body.item).toMatchObject({ type: 'FORM', formType: type, formLabel: '合成题', required: false, contextKey: null,
      formDefinition: { type: type.toUpperCase(), prompt: '合成题', required: false, options: [], rows: [] } })
    expect(body.item.formDefinition).not.toHaveProperty('itemKey')
    if (type === 'number') expect(body.item.formDefinition).toMatchObject({ min: 0, max: 100, precision: 2 })
    if (type === 'time') expect(body.item.formDefinition.timeZone).toBe('UTC')
    if (type === 'long_text') expect(body.item.formDefinition.maxLength).toBe(500)
  })
})

describe('C05 structured authoring', () => {
  it.each(['likert', 'matrix', 'matrix_multiple', 'rank_order', 'slider', 'constant_sum'])('creates %s as one public FormQuestion', async type => {
    capabilities.enabled = true
    vi.resetAllMocks()
    const row = { name: '结构化题型', status: 'DRAFT', revision: 4, questionnaireType: 'COURSE', questionnaireCourses: [], items: [], formSections: [], publicEnabled: false }
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? { scales: [], cognitive: [], situational: [], courses: [] } : row }))
    api.post.mockResolvedValue({ code: 0, data: { ...row, revision: 5 } })
    mount('typed')
    await screen.findByDisplayValue('结构化题型')
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('测评类型'), 'FORM')
    await user.type(screen.getByLabelText('题目文字'), '结构化题')
    await user.selectOptions(screen.getByLabelText('题型'), type)
    if (type !== 'slider') await user.type(screen.getByLabelText('选项（值=标签，以逗号分隔）'), 'a=甲,b=乙')
    if (type.startsWith('matrix')) await user.type(screen.getByLabelText('矩阵行（编码=标签，以逗号分隔）'), 'r1=第一行,r2=第二行')
    if (type === 'matrix_multiple') await user.type(screen.getByLabelText('最多选择（留空不限）'), '2')
    if (type === 'constant_sum') { await user.clear(screen.getByLabelText('指定总和')); await user.type(screen.getByLabelText('指定总和'), '0') }
    await user.click(screen.getByRole('button', { name: '添加到测评' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const definition = api.post.mock.calls[0][1].item.formDefinition
    expect(definition).toMatchObject({ type: type.toUpperCase(), prompt: '结构化题', required: true })
    expect(definition).not.toHaveProperty('itemKey')
    if (type === 'slider') expect(definition).toMatchObject({ min: 0, max: 100, options: [], rows: [] })
    else expect(definition.options).toEqual([{ optionKey: 'a', label: '甲' }, { optionKey: 'b', label: '乙' }])
    if (type.startsWith('matrix')) expect(definition.rows).toEqual([{ rowKey: 'r1', label: '第一行' }, { rowKey: 'r2', label: '第二行' }])
    if (type === 'matrix_multiple') expect(definition.maxSelections).toBe(2)
    if (type === 'constant_sum') expect(definition.total).toBe(0)
  })
})

describe('C05 incomplete single question stays editable', () => {
  it('retains title, options and matrix rows when the server rejects adding an incomplete question', async () => {
    capabilities.enabled = true
    vi.resetAllMocks()
    const row = { name: '结构化草稿', status: 'DRAFT', revision: 4, questionnaireType: 'COURSE', questionnaireCourses: [], items: [], formSections: [], publicEnabled: false }
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? { scales: [], cognitive: [], situational: [], courses: [] } : row }))
    api.post.mockResolvedValue({ code: 400, message: '矩阵题至少需要一行' })
    mount('typed')
    await screen.findByDisplayValue('结构化草稿')
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('测评类型'), 'FORM')
    await user.type(screen.getByLabelText('题目文字'), '未完成矩阵')
    await user.selectOptions(screen.getByLabelText('题型'), 'matrix')
    await user.type(screen.getByLabelText('选项（值=标签，以逗号分隔）'), 'a=甲,b=乙')
    await user.click(screen.getByRole('button', { name: '添加到测评' }))
    expect(await screen.findByText('矩阵题至少需要一行')).toBeInTheDocument()
    expect(screen.getByLabelText('题目文字')).toHaveValue('未完成矩阵')
    expect(screen.getByLabelText('选项（值=标签，以逗号分隔）')).toHaveValue('a=甲,b=乙')
    expect(screen.getByLabelText('矩阵行（编码=标签，以逗号分隔）')).toHaveValue('')
    expect(api.post).toHaveBeenCalledTimes(1)
  })
})

describe('C06 stable policy authoring',()=>{
 it('adds a conditional question to the chosen existing section using its stable source key',async()=>{
  vi.resetAllMocks()
  const source={id:'db-source',position:0,formSectionId:'section',formType:'single_choice',formLabel:'先前选择',formDefinition:{itemKey:'q_stable_source',type:'SINGLE',options:[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'}]}}
  const row={name:'策略问卷',status:'DRAFT',revision:9,questionnaireType:'COURSE',questionnaireCourses:[],items:[source],formSections:[{id:'section',title:'连续表单',items:[source],contextSection:false}],publicEnabled:false}
  api.get.mockImplementation(async path=>({code:0,data:path.endsWith('/resources')?{scales:[],cognitive:[],situational:[],courses:[]}:row}));api.post.mockResolvedValue({code:0,data:{...row,revision:10}})
  mount('policy');await screen.findByDisplayValue('策略问卷');const user=userEvent.setup()
  await user.selectOptions(screen.getByLabelText('测评类型'),'FORM');await user.type(screen.getByLabelText('题目文字'),'后续文本')
  await user.click(screen.getByLabelText('启用新表单策略（V3）'));await user.selectOptions(screen.getByLabelText('加入表单区段'),'section');await user.selectOptions(screen.getByLabelText('显示条件'),'q_stable_source');await user.selectOptions(screen.getByLabelText('文本格式'),'EMAIL')
  await user.click(screen.getByRole('button',{name:'添加到测评'}));await waitFor(()=>expect(api.post).toHaveBeenCalled())
  expect(api.post.mock.calls[0][1]).toMatchObject({revision:9,formSectionId:'section',item:{formPolicy:{version:3,requiredRefusal:'BLOCK_SUBMIT',hiddenRequired:'EXEMPT'},formDefinition:{type:'SHORT_TEXT',textValidation:'EMAIL',displayIf:{itemKey:'q_stable_source',operator:'EQUALS',optionKey:'yes'}}}})
 })
})

it('shows typed export actions from the actual nested teacher form DTO',async()=>{
  const row={id:'typed-export',name:'导出问卷',status:'PUBLISHED',revision:1,questionnaireType:'COURSE',questionnaireCourses:[],publicEnabled:false,formSections:[],items:[{id:'number',type:'FORM',position:0,required:false,form:{type:'number',label:'数值',formDefinition:{itemKey:'q_number',type:'NUMBER',prompt:'数值',required:false,options:[],rows:[]}}}]}
  api.get.mockImplementation(async path=>({code:0,data:path.endsWith('/resources')?{scales:[],cognitive:[],situational:[],courses:[]}:row}))
  mount('typed-export');expect(await screen.findByRole('button',{name:'完整表单与字段字典（ZIP）'})).toBeTruthy();expect(screen.getByText(/暂不支持 SAV/)).toBeTruthy()
})

describe('C19 Training conditional flow authoring', () => {
  const section = { id: 'section-1', title: '筛选', position: 0, contextSection: false, items: [{ id: 'form-1', type: 'FORM', formLabel: '资格', formDefinition: { itemKey: 'eligible', type: 'SINGLE', prompt: '资格', options: [{ optionKey: 'yes', label: '是' }, { optionKey: 'no', label: '否' }], rows: [], required: true } }] }
  const row = { name: '课程条件流程', status: 'DRAFT', productKind: 'QUESTIONNAIRE', revision: 7, questionnaireType: 'COURSE', questionnaireCourses: [{ courseId: 'training-course' }], items: [{ id: 'scale-1', type: 'SCALE', position: 1, required: true, scale: { name: '量表' } }], formSections: [section], publicEnabled: false, trainingFlowDraft: null }
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? { scales: [], cognitive: [], situational: [], courses: [{ id: 'training-course', title: 'Training 课程', courseType: 'TRAINING_COURSE', isLibrary: false }] } : row }))
  })
  it('saves with the latest revision after metadata and blocks publication until successful', async () => {
    api.put.mockImplementation(async (_path, body) => ({ code: 0, data: { ...row, name: body.name, revision: 8 } }))
    api.post.mockImplementation(async (_path, body) => ({ code: 0, data: { ...row, name: '已改名', revision: 9, trainingFlowDraft: body.config } }))
    mount('flow')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('checkbox', { name: '启用跨工具条件流程' }))
    fireEvent.change(screen.getByLabelText('测评名称'), { target: { value: '已改名' } })
    expect(screen.getByRole('button', { name: '发布组合测评' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '添加条件结束模板' }))
    await user.click(screen.getByRole('button', { name: '添加材料模板' }))
    await user.click(screen.getByRole('button', { name: '保存流程设置' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/questionnaire-products/flow/training-flow', { revision: 8, config: expect.objectContaining({ schemaVersion: 1, blocks: expect.arrayContaining([expect.objectContaining({ kind: 'END', termination: 'SCREEN_OUT' }), expect.objectContaining({ kind: 'MATERIAL' })]) }) }))
    await waitFor(() => expect(screen.getByRole('button', { name: '发布组合测评' })).toBeEnabled())
  })
  it('focuses invalid flow JSON and keeps unsaved edits after server conflict', async () => {
    mount('flow')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('checkbox', { name: '启用跨工具条件流程' }))
    const input = screen.getByLabelText('流程 JSON（高级编辑）')
    const valid = (input as HTMLTextAreaElement).value
    fireEvent.change(input, { target: { value: '{broken' } })
    await user.click(screen.getByRole('button', { name: '保存流程设置' }))
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: valid } })
    api.post.mockRejectedValue(new Error('草稿修订号已变化，请重新读取'))
    await user.click(screen.getByRole('button', { name: '保存流程设置' }))
    await waitFor(() => expect(screen.getAllByText('草稿修订号已变化，请重新读取').length).toBeGreaterThan(0))
    expect(input).toHaveValue(valid)
    expect(screen.getByRole('button', { name: '发布组合测评' })).toBeDisabled()
  })
})

describe('C20 material flow editor and attempt budget', () => {
  const config = { schemaVersion: 2, experiment: { experimentKey: 'lesson', linkedPolicy: 'KEEP_LINKED', groups: [
    { groupKey: 'a', weight: 1, materialTitle: 'A', materialBody: '正文 A' },
    { groupKey: 'b', weight: 2, materialTitle: 'B', materialBody: '正文 B' },
  ] }, blocks: [{ blockKey: 'tool_1', kind: 'INSTRUMENT', instrumentKey: 'item_scale_1' }] }
  const row = { id: 'materials', name: '材料实验', status: 'DRAFT', productKind: 'QUESTIONNAIRE', revision: 3, maxAttempts: 4, questionnaireType: 'COURSE', questionnaireCourses: [{ courseId: 'training-course' }], items: [{ id: 'scale-1', type: 'SCALE', position: 0, required: true, scale: { name: '量表' } }], formSections: [], publicEnabled: false, trainingFlowDraft: config }
  const resources = { scales: [], cognitive: [], situational: [], courses: [{ id: 'training-course', title: 'Training 课程', courseType: 'TRAINING_COURSE', isLibrary: false }] }
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? resources : row }))
    api.post.mockImplementation(async (_path, body) => ({ code: 0, data: { ...row, revision: 4, trainingFlowDraft: body.config, maxAttempts: body.maxAttempts } }))
  })
  it('loads the saved budget and sends budget-only changes with V2 config', async () => {
    mount('materials')
    const input = await screen.findByLabelText('最多作答次数（材料实验）')
    expect(input).toHaveValue(4)
    expect(screen.getByRole('button', { name: '保存流程设置' })).toBeDisabled()
    fireEvent.change(input, { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: '保存流程设置' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/questionnaire-products/materials/training-flow', { revision: 3, config, maxAttempts: 8 }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存流程设置' })).toBeDisabled())
    expect(screen.getByText(/SCREEN_OUT 不退还配额/)).toBeInTheDocument()
    expect(screen.getByText(/新链接不代表同一关联身份/)).toBeInTheDocument()
  })
  it('upgrades the existing V1 blocks only explicitly and adds an editable quota sample', async () => {
    const v1 = { schemaVersion: 1, blocks: config.blocks }
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? resources : { ...row, trainingFlowDraft: v1 } }))
    mount('materials')
    const input = await screen.findByLabelText('流程 JSON（高级编辑）')
    expect(screen.queryByLabelText('最多作答次数（材料实验）')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '启用两组材料实验' }))
    const upgraded = JSON.parse((input as HTMLTextAreaElement).value)
    expect(upgraded.schemaVersion).toBe(2)
    expect(upgraded.blocks).toEqual(config.blocks)
    expect(upgraded.quotaPolicy).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: '添加配额示例' }))
    expect(JSON.parse((input as HTMLTextAreaElement).value).quotaPolicy).toEqual({ schemaVersion: 1, groupLimits: { group_a: 100, group_b: 100 } })
    fireEvent.change(screen.getByLabelText('最多作答次数（材料实验）'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '保存流程设置' }))
    expect(api.post).not.toHaveBeenCalled()
    expect(input).toHaveFocus()
    expect(screen.getByText('最多作答次数须为 1–100 的整数。')).toBeInTheDocument()
  })
  it('hydrates copied V2 config and budget from the returned draft detail', async () => {
    const published = { ...row, status: 'PUBLISHED', trainingFlowDraft: null, trainingFlowFrozen: config }
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? resources : path.endsWith('/copied') ? { ...row, id: 'copied' } : published }))
    api.post.mockResolvedValue({ code: 0, data: { id: 'copied' } })
    mount('materials')
    await screen.findByText('每位作答者最多作答 4 次。')
    fireEvent.click(screen.getByRole('button', { name: '复制为新草稿' }))
    expect(await screen.findByLabelText('最多作答次数（材料实验）')).toHaveValue(4)
    expect(JSON.parse((screen.getByLabelText('流程 JSON（高级编辑）') as HTMLTextAreaElement).value)).toEqual(config)
  })
})

describe('Training persistence authoring', () => {
  beforeEach(() => { vi.resetAllMocks(); capabilities.enabled=true; api.get.mockResolvedValue({code:0,data:{scales:[],cognitive:[],situational:[],courses:[]}}) })
  it('starts both independent retention controls off',async()=>{mount();await screen.findByRole('checkbox',{name:'启用服务器草稿'});expect(screen.getByRole('checkbox',{name:'启用服务器草稿'})).not.toBeChecked();expect(screen.getByRole('checkbox',{name:'启用认知任务本机草稿到期清理'})).not.toBeChecked();fireEvent.click(screen.getByRole('checkbox',{name:'启用服务器草稿'}));expect(screen.getByLabelText('服务器草稿保留小时数')).toHaveValue(24);expect(screen.queryByLabelText('认知本机草稿保留小时数')).not.toBeInTheDocument()})
  it('freezes both settings after publication',async()=>{const row={name:'冻结策略',status:'PUBLISHED',revision:1,questionnaireType:'COURSE',questionnaireCourses:[],items:[],formSections:[],publicEnabled:false,trainingPersistencePolicy:{schemaVersion:1,checkpoint:{enabled:true,ttlHours:48},localCognitive:{enabled:true,ttlHours:1}}};api.get.mockImplementation(async path=>({code:0,data:path.endsWith('/resources')?{scales:[],cognitive:[],situational:[],courses:[]}:row}));mount('saved');await screen.findByDisplayValue('冻结策略');expect(screen.getByRole('checkbox',{name:'启用服务器草稿'})).toBeDisabled();expect(screen.getByLabelText('服务器草稿保留小时数')).toHaveValue(48);expect(screen.getByLabelText('认知本机草稿保留小时数')).toHaveValue(1);expect(screen.getByLabelText('认知本机草稿保留小时数')).toBeDisabled()})
})

describe('C22 Training feedback release authoring', () => {
  const resources = { scales: [], cognitive: [], situational: [], courses: [
    { id: 'training-course', title: 'Training 课程', courseType: 'TRAINING_COURSE', isLibrary: false },
    { id: 'other-course', title: '其他课程', courseType: 'NORMAL_COURSE', isLibrary: false },
  ] }
  const row = { id: 'feedback', name: '学员反馈设置', status: 'DRAFT', revision: 7, questionnaireType: 'COURSE', productKind: 'QUESTIONNAIRE', questionnaireCourses: [{ courseId: 'training-course' }], items: [], formSections: [], publicEnabled: false }
  const configure = (detail: Record<string, unknown> = row) => {
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? resources : detail }))
    api.put.mockImplementation(async (_path, body) => ({ code: 0, data: { ...detail, ...body, revision: 8 } }))
    api.post.mockImplementation(async (_path, body) => ({ code: 0, data: { ...detail, ...body } }))
  }
  beforeEach(() => { vi.resetAllMocks(); capabilities.enabled = true; configure() })

  it('defaults a newly bound Training questionnaire to immediate feedback after completion and generation', async () => {
    mount('new', '?courseId=training-course')
    expect(await screen.findByRole('radio', { name: '整份测评完成且报告生成后即可查看（默认）' })).toBeChecked()
    fireEvent.change(screen.getByLabelText('测评名称'), { target: { value: '新课程问卷' } })
    fireEvent.click(screen.getByRole('button', { name: '创建草稿' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/questionnaire-products', expect.objectContaining({
      trainingFeedbackPolicy: { schemaVersion: 1, mode: 'IMMEDIATE' }, courseIds: ['training-course'],
    })))
  })

  it('requires a valid release time before saving scheduled feedback', async () => {
    mount('feedback')
    fireEvent.click(await screen.findByRole('radio', { name: '预设时间开放' }))
    fireEvent.click(screen.getByRole('button', { name: '保存投放设置' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请选择有效的报告开放时间。')
    expect(screen.getByLabelText('报告开放时间')).toHaveFocus()
    expect(screen.getByLabelText('报告开放时间')).toHaveAttribute('aria-invalid', 'true')
    expect(api.put).not.toHaveBeenCalled()
  })

  it('defaults to immediate feedback when a course-less draft first binds Training', async () => {
    configure({ ...row, questionnaireCourses: [] })
    mount('feedback')
    await screen.findByDisplayValue('学员反馈设置')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Training 课程' }))
    expect(screen.getByRole('radio', { name: '整份测评完成且报告生成后即可查看（默认）' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: '保存投放设置' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/questionnaire-products/feedback', expect.objectContaining({
      revision: 7, trainingFeedbackPolicy: { schemaVersion: 1, mode: 'IMMEDIATE' }, courseIds: ['training-course'],
    })))
  })

  it('saves the scheduled device-local time as an ISO timestamp with the current revision', async () => {
    mount('feedback')
    fireEvent.click(await screen.findByRole('radio', { name: '预设时间开放' }))
    fireEvent.change(screen.getByLabelText('报告开放时间'), { target: { value: '2026-10-21T09:30' } })
    expect(screen.getByRole('button', { name: '发布组合测评' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '保存投放设置' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/questionnaire-products/feedback', expect.objectContaining({
      revision: 7, trainingFeedbackPolicy: { schemaVersion: 1, mode: 'SCHEDULED', releaseAt: new Date('2026-10-21T09:30').toISOString() },
    })))
  })

  it('allows returning an existing scheduled draft to immediate feedback without a stale timestamp', async () => {
    configure({ ...row, trainingFeedbackPolicy: { schemaVersion: 1, mode: 'SCHEDULED', releaseAt: '2026-10-21T09:30:00.000Z' } })
    mount('feedback')
    fireEvent.click(await screen.findByRole('radio', { name: '整份测评完成且报告生成后即可查看（默认）' }))
    expect(screen.queryByLabelText('报告开放时间')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存投放设置' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/questionnaire-products/feedback', expect.objectContaining({
      revision: 7, trainingFeedbackPolicy: { schemaVersion: 1, mode: 'IMMEDIATE' },
    })))
  })

  it('keeps published policy and timestamp read-only', async () => {
    configure({ ...row, status: 'PUBLISHED', trainingFeedbackPolicy: { schemaVersion: 1, mode: 'SCHEDULED', releaseAt: '2026-10-21T09:30:00.000Z' } })
    mount('feedback')
    const scheduled = await screen.findByRole('radio', { name: '预设时间开放' })
    expect(scheduled).toBeChecked()
    expect(scheduled).toBeDisabled()
    expect(screen.getByRole('radio', { name: '整份测评完成且报告生成后即可查看（默认）' })).toBeDisabled()
    expect(screen.getByLabelText('报告开放时间')).toBeDisabled()
    expect(screen.getByText('仅在统一讲解或保护测评过程时选择预设时间。教师原有的报告查看、分析和导出不受此设置影响。')).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('preserves an unconfigured legacy policy while saving unrelated metadata', async () => {
    mount('feedback')
    await screen.findByRole('radio', { name: '预设时间开放' })
    fireEvent.change(screen.getByLabelText('测评名称'), { target: { value: '改名保持原反馈' } })
    fireEvent.click(screen.getByRole('button', { name: '保存投放设置' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(api.put.mock.calls[0][1]).not.toHaveProperty('trainingFeedbackPolicy')
  })

  it('clears a configured draft policy when its author changes delivery out of Training scope', async () => {
    configure({ ...row, trainingFeedbackPolicy: { schemaVersion: 1, mode: 'SCHEDULED', releaseAt: '2026-10-21T09:30:00.000Z' } })
    mount('feedback')
    await screen.findByRole('radio', { name: '预设时间开放' })
    fireEvent.click(screen.getByRole('checkbox', { name: '其他课程' }))
    expect(screen.getByText('当前投放已不符合 Training 课程范围，保存时将清除学员报告开放设置。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存投放设置' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/questionnaire-products/feedback', expect.objectContaining({
      revision: 7, trainingFeedbackPolicy: null, courseIds: ['training-course', 'other-course'],
    })))
  })

  it('does not add Training feedback to a non-Training creation', async () => {
    mount('new', '?courseId=other-course')
    await waitFor(() => expect(screen.getByRole('checkbox', { name: '其他课程' })).toBeChecked())
    expect(screen.queryByRole('radio', { name: '预设时间开放' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('测评名称'), { target: { value: '普通课程问卷' } })
    fireEvent.click(screen.getByRole('button', { name: '创建草稿' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('trainingFeedbackPolicy')
  })
})
