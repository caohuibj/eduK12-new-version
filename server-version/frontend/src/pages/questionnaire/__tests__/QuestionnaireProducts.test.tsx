import { cleanup, render, screen, fireEvent, act, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const trainingPresentation = vi.hoisted(() => ({ enabled: false }))
vi.mock('../../../training/context', () => ({ isTrainingHost: () => trainingPresentation.enabled }))
beforeEach(() => { trainingPresentation.enabled = false })
const capabilities = vi.hoisted(() => ({ enabled: true }))
vi.mock('../../../contexts/CapabilitiesContext', () => ({ useCognitiveEnabled: () => capabilities.enabled }))
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: api }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teacher-1', role: 'TEACHER' } }) }))
vi.mock('../../../components/PublicDeliveryManager', () => ({
  PublicDeliveryManager: () => <section aria-label="匿名作答链接管理">合成匿名链接面板</section>,
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
    sessionStorage.clear()
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

  it('explicitly publishes the current cognitive configuration using the saved revision without publishing delivery', async () => {
    const row = { id:'saved', name:'认知草稿', status:'DRAFT', revision:7, questionnaireType:'COURSE', questionnaireCourses:[], items:[{id:'cog',type:'COGNITIVE',position:0,cognitiveAssignment:{title:'认知任务'}}], formSections:[], publicEnabled:false }
    api.get.mockImplementation(async path => ({code:0,data:path.endsWith('/resources')?{scales:[],cognitive:[],situational:[],courses:[]}:row}))
    api.post.mockResolvedValue({code:0,data:{...row,revision:8}})
    mount('saved');const button=await screen.findByRole('button',{name:'发布当前认知配置版本'})
    fireEvent.change(screen.getByLabelText('测评名称'),{target:{value:'未保存'}});expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('测评名称'),{target:{value:row.name}});fireEvent.click(button)
    await screen.findByText('当前认知配置版本已发布。组合测评仍为草稿，尚未启动投放。')
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/questionnaire-products/saved/measurement-instances/publish',{revision:7})
    expect(screen.getByRole('button',{name:'发布组合测评'})).toBeInTheDocument()
  })
  it('holds an unknown cognitive publication without resending after read-only refresh', async () => {
    const row = { id:'saved', name:'认知草稿', status:'DRAFT', revision:7, questionnaireType:'COURSE', questionnaireCourses:[], items:[{id:'cog',type:'COGNITIVE',position:0,cognitiveAssignment:{title:'认知任务'}}], formSections:[], publicEnabled:false }
    api.get.mockImplementation(async path => ({code:0,data:path.endsWith('/resources')?{scales:[],cognitive:[],situational:[],courses:[]}:row}))
    api.post.mockRejectedValue(new Error('response lost'))
    mount('saved');fireEvent.click(await screen.findByRole('button',{name:'发布当前认知配置版本'}))
    await screen.findByRole('button',{name:'重新读取当前草稿'})
    expect(screen.getByRole('button',{name:'发布当前认知配置版本'})).toBeDisabled()
    api.get.mockResolvedValue({code:0,data:{...row,revision:8}})
    fireEvent.click(screen.getByRole('button',{name:'重新读取当前草稿'}));await screen.findByText('已重新读取当前草稿。请核对认知配置及发布记录；原请求仍保持未确认。')
    expect(api.post).toHaveBeenCalledOnce();expect(screen.getByRole('button',{name:'发布当前认知配置版本'})).toBeDisabled()
    api.post.mockResolvedValue({code:0,data:{...row,revision:8}})
    fireEvent.click(screen.getByRole('button',{name:'重试原修订请求'}))
    await screen.findByText('当前认知配置版本已发布。组合测评仍为草稿，尚未启动投放。')
    expect(api.post.mock.calls.map(call=>call[1])).toEqual([{revision:7},{revision:7}])
  })

  it('restores the original actor/composite revision after remount and only archives after explicit verified-pointer review', async () => {
    const row = { id:'saved', name:'认知草稿', status:'DRAFT', revision:7, questionnaireType:'COURSE', questionnaireCourses:[], items:[{id:'cog',type:'COGNITIVE',position:0,cognitiveAssignment:{title:'认知任务'}}], formSections:[], publicEnabled:false }
    let current:any=row
    api.get.mockImplementation(async path => ({code:0,data:path.endsWith('/resources')?{scales:[],cognitive:[],situational:[],courses:[]}:current}))
    api.post.mockRejectedValue(new Error('response lost'))
    mount('saved');fireEvent.click(await screen.findByRole('button',{name:'发布当前认知配置版本'}));await screen.findByRole('button',{name:'重试原修订请求'})
    const key='training-cognitive-publication:'+JSON.stringify(['teacher-1','saved'])
    expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual({actorId:'teacher-1',id:'saved',revision:7,itemIds:['cog'],hadUnknownOutcome:true})
    cleanup();current={...row,revision:8};mount('saved');await screen.findByRole('button',{name:'重试原修订请求'})
    expect(screen.queryByRole('button',{name:'已核对全部原认知项，结束恢复'})).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'重试原修订请求'}));await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(2))
    expect(api.post.mock.calls[1][1]).toEqual({revision:7})
    current={...current,items:[{...row.items[0],cognitiveAssignment:{title:'认知任务',measurementReleaseId:'exact-release'}}]}
    await waitFor(()=>expect(screen.getByRole('button',{name:'重新读取当前草稿'})).toBeEnabled())
    fireEvent.click(screen.getByRole('button',{name:'重新读取当前草稿'}))
    fireEvent.click(await screen.findByRole('button',{name:'已核对全部原认知项，结束恢复'}))
    expect(sessionStorage.getItem(key)).toBeNull();expect(api.post).toHaveBeenCalledTimes(2)
  })

  it('blocks edits while the original publication is pending and safely ends an obsolete revision without claiming success', async () => {
    const row = { id:'saved', name:'认知草稿', status:'DRAFT', revision:7, questionnaireType:'COURSE', questionnaireCourses:[], items:[{id:'cog',type:'COGNITIVE',position:0,cognitiveAssignment:{title:'认知任务'}}], formSections:[], publicEnabled:false }
    let current:any=row
    api.get.mockImplementation(async path=>({code:0,data:path.endsWith('/resources')?{scales:[],cognitive:[],situational:[],courses:[]}:current}))
    api.post.mockRejectedValue(new Error('response lost'));mount('saved')
    fireEvent.click(await screen.findByRole('button',{name:'发布当前认知配置版本'}));await screen.findByRole('button',{name:'重试原修订请求'})
    expect(screen.getByLabelText('测评名称')).toBeDisabled()
    expect(screen.getByRole('button',{name:'发布组合测评'})).toBeDisabled()
    for(const button of screen.queryAllByRole('button',{name:/移除/}))expect(button).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'发布前自检'}));await screen.findByText('请先恢复或明确结束原认知发布请求，再修改组合测评。')
    expect(api.post).toHaveBeenCalledOnce()
    current={...row,revision:8,items:[]};fireEvent.click(screen.getByRole('button',{name:'重新读取当前草稿'}))
    fireEvent.click(await screen.findByRole('button',{name:'结束已失效修订恢复（不确认成功）'}))
    expect(sessionStorage.getItem('training-cognitive-publication:'+JSON.stringify(['teacher-1','saved']))).toBeNull()
    expect(api.post).toHaveBeenCalledOnce();expect(screen.queryByText('当前认知配置版本已发布。组合测评仍为草稿，尚未启动投放。')).not.toBeInTheDocument()
    expect(screen.getByLabelText('测评名称')).toBeEnabled()
  })
  it('keeps a late publication response in its original composite scope after navigation', async () => {
    const row=(id:string)=>({id,name:id==='old'?'旧组合':'新组合',status:'DRAFT',revision:7,questionnaireType:'COURSE',questionnaireCourses:[],items:[{id:'cog',type:'COGNITIVE',position:0,cognitiveAssignment:{title:'认知任务'}}],formSections:[],publicEnabled:false})
    api.get.mockImplementation(async path=>({code:0,data:path.endsWith('/resources')?{scales:[],cognitive:[],situational:[],courses:[]}:row(path.endsWith('/old')?'old':'new-scope')}))
    let finish!: (value:unknown)=>void;api.post.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
    const newKey='training-cognitive-publication:'+JSON.stringify(['teacher-1','new-scope'])
    const newPending={actorId:'teacher-1',id:'new-scope',revision:6,itemIds:['cog']};sessionStorage.setItem(newKey,JSON.stringify(newPending))
    render(<MemoryRouter initialEntries={['/questionnaire-products/old']}><Link to="/questionnaire-products/new-scope">切换组合</Link><Routes><Route path="/questionnaire-products/:id" element={<QuestionnaireProductEdit/>}/></Routes></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button',{name:'发布当前认知配置版本'}));await waitFor(()=>expect(api.post).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('link',{name:'切换组合'}));await screen.findByDisplayValue('新组合')
    await act(async()=>finish({code:0,data:{...row('old'),revision:8}}))
    expect(screen.getByLabelText('测评名称')).toHaveValue('新组合')
    expect(JSON.parse(sessionStorage.getItem(newKey)!)).toEqual(newPending)
    expect(sessionStorage.getItem('training-cognitive-publication:'+JSON.stringify(['teacher-1','old']))).toBeNull()
    expect(screen.getByRole('button',{name:'重试原修订请求'})).toBeInTheDocument()
    expect(screen.queryByText('当前认知配置版本已发布。组合测评仍为草稿，尚未启动投放。')).not.toBeInTheDocument()
  })

  it.each([400,403,409])('unlocks a first definitive %s publication rejection for correction',async(status)=>{
    const row={id:'saved',name:'认知草稿',status:'DRAFT',revision:7,questionnaireType:'COURSE',questionnaireCourses:[],items:[{id:'cog',type:'COGNITIVE',position:0,cognitiveAssignment:{title:'认知任务'}}],formSections:[],publicEnabled:false}
    api.get.mockImplementation(async path=>({code:0,data:path.endsWith('/resources')?{scales:[],cognitive:[],situational:[],courses:[]}:row}))
    api.post.mockRejectedValue(Object.assign(new Error('definitive rejection'),{status}));mount('saved')
    fireEvent.click(await screen.findByRole('button',{name:'发布当前认知配置版本'}));await screen.findByRole('alert')
    expect(screen.getByLabelText('测评名称')).toBeEnabled();expect(screen.queryByRole('button',{name:'重试原修订请求'})).not.toBeInTheDocument()
    expect(sessionStorage.getItem('training-cognitive-publication:'+JSON.stringify(['teacher-1','saved']))).toBeNull()
  })
  it('preserves an earlier unknown outcome when its original-revision retry gets 403',async()=>{
    const row={id:'saved',name:'认知草稿',status:'DRAFT',revision:7,questionnaireType:'COURSE',questionnaireCourses:[],items:[{id:'cog',type:'COGNITIVE',position:0,cognitiveAssignment:{title:'认知任务'}}],formSections:[],publicEnabled:false}
    api.get.mockImplementation(async path=>({code:0,data:path.endsWith('/resources')?{scales:[],cognitive:[],situational:[],courses:[]}:row}))
    api.post.mockRejectedValueOnce(new Error('response lost')).mockRejectedValueOnce(Object.assign(new Error('permission changed'),{status:403}));mount('saved')
    fireEvent.click(await screen.findByRole('button',{name:'发布当前认知配置版本'}));await screen.findByRole('button',{name:'重试原修订请求'});await waitFor(()=>expect(screen.getByRole('button',{name:'重试原修订请求'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'重试原修订请求'}));await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(2));await waitFor(()=>expect(screen.getByRole('button',{name:'重试原修订请求'})).toBeEnabled())
    expect(screen.getByLabelText('测评名称')).toBeDisabled();expect(screen.getByRole('button',{name:'重试原修订请求'})).toBeInTheDocument()
    expect(JSON.parse(sessionStorage.getItem('training-cognitive-publication:'+JSON.stringify(['teacher-1','saved']))!).hadUnknownOutcome).toBe(true)
    expect(api.post.mock.calls.map(call=>call[1])).toEqual([{revision:7},{revision:7}])
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

describe('Training guided delivery settings', () => {
  let row: any
  const course = { id: 'training-course', title: '培训课程', courseType: 'TRAINING_COURSE', isLibrary: false }
  beforeEach(() => {
    trainingPresentation.enabled = true
    vi.resetAllMocks()
    row = { id: 'delivery', name: '投放演示', status: 'DRAFT', productKind: 'QUESTIONNAIRE', revision: 7, questionnaireType: 'COURSE', questionnaireCourses: [{ courseId: course.id }], publicEnabled: false, items: [{ id: 'scale', type: 'SCALE', position: 0, scale: { name: '课堂反馈量表' } }], formSections: [], trainingFeedbackPolicy: { schemaVersion: 1, mode: 'IMMEDIATE' } }
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? { scales: [], cognitive: [], situational: [], courses: [course] } : row }))
    api.put.mockImplementation(async (_path, body) => ({ code: 0, data: { ...row, ...body, revision: 8 } }))
    api.post.mockImplementation(async (_path, body) => ({ code: 0, data: { ...row, revision: 9, trainingVariantDraft: body.config } }))
  })
  const open = async () => {
    mount('delivery', '#questionnaire-delivery')
    await screen.findByRole('checkbox', { name: '培训课程' })
  }
  const disclosure = (title: string) => screen.getByText(title, { selector: 'strong' }).closest('details')!
  it('explains the three base steps and keeps optional features off without writing any settings', async () => {
    await open()
    expect(screen.getByRole('group', { name: '01 · 谁来作答' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '02 · 何时开放作答' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '03 · 学员何时看报告' })).toBeInTheDocument()
    expect(disclosure('进度保存与作答时间')).not.toHaveAttribute('open')
    expect(disclosure('分组与条件路径')).not.toHaveAttribute('open')
    expect(screen.getByLabelText('启用服务器草稿')).not.toBeChecked()
    expect(screen.getByLabelText('启用认知任务本机草稿到期清理')).not.toBeChecked()
    expect(api.put).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled()
  })
  it('keeps server retention separate from local cleanup and sends the unchanged policy shape on save', async () => {
    await open()
    fireEvent.click(disclosure('进度保存与作答时间').querySelector('summary')!)
    fireEvent.click(screen.getByLabelText('启用服务器草稿'))
    expect(screen.getByLabelText('服务器草稿保留小时数')).toHaveValue(24)
    expect(screen.queryByLabelText('认知本机草稿保留小时数')).not.toBeInTheDocument()
    const permission = screen.getByLabelText('允许教师查看及导出计时')
    expect(permission).toBeDisabled()
    expect(screen.getByText('请先保存其他修改，再调整这项权限。')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '保存全部修改' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/questionnaire-products/delivery', expect.objectContaining({ trainingPersistencePolicy: { schemaVersion: 1, checkpoint: { enabled: true, ttlHours: 24 }, localCognitive: null } })))
  })
  it('shows editable group probabilities and explains the incompatible flow without changing saved groups', async () => {
    await open()
    fireEvent.click(disclosure('分组与条件路径').querySelector('summary')!)
    fireEvent.click(screen.getByRole('checkbox', { name: '启用按权重随机分组' }))
    const region = screen.getByRole('region', { name: '按权重随机分组' })
    expect(within(region).getAllByText('50%', { selector: 'strong' })).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('分组 2 权重'), { target: { value: '3' } })
    expect(within(region).getByText('25%', { selector: 'strong' })).toBeInTheDocument()
    expect(within(region).getByText('75%', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '启用跨工具条件流程' })).toBeDisabled()
    expect(screen.getByText(/已启用随机分组时，请先关闭并保存后再使用条件流程/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '保存分组设置' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/questionnaire-products/delivery/training-variants', expect.objectContaining({ revision: 7, config: expect.objectContaining({ groups: expect.arrayContaining([expect.objectContaining({ weight: 3 })]) }) })))
  })
  it('opens nested flow rules and focuses invalid JSON when saving', async () => {
    await open()
    fireEvent.click(disclosure('分组与条件路径').querySelector('summary')!)
    fireEvent.click(screen.getByRole('checkbox', { name: '启用跨工具条件流程' }))
    const input = screen.getByLabelText('流程 JSON（高级编辑）')
    expect(input.closest('details')).not.toHaveAttribute('open')
    fireEvent.change(input, { target: { value: '{broken' } })
    fireEvent.click(screen.getByRole('button', { name: '保存流程设置' }))
    await waitFor(() => expect(input).toHaveFocus())
    expect(input.closest('details')).toHaveAttribute('open')
    expect(disclosure('分组与条件路径')).toHaveAttribute('open')
    expect(api.post).not.toHaveBeenCalled()
  })
  it('keeps published retention and collection read-only while disclosure permissions remain independently controlled', async () => {
    row.status = 'PUBLISHED'
    row.trainingPersistencePolicy = { schemaVersion: 1, checkpoint: { enabled: true, ttlHours: 48 }, localCognitive: { enabled: true, ttlHours: 1 } }
    row.trainingTimingPolicy = { schemaVersion: 1 }
    await open()
    expect(screen.getByLabelText('启用服务器草稿')).toBeDisabled()
    expect(screen.getByLabelText('服务器草稿保留小时数')).toHaveValue(48)
    expect(screen.getByLabelText('认知本机草稿保留小时数')).toBeDisabled()
    expect(screen.getByLabelText('记录量表的有效前台时间')).toBeDisabled()
    expect(screen.getByLabelText('允许教师查看及导出计时')).toBeEnabled()
  })
})

describe('C04 typed authoring', () => {
  it.each(['number', 'long_text', 'date', 'time'])('creates %s using the public Form definition without a client itemKey', async type => {
    capabilities.enabled = true
    sessionStorage.clear()
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
    sessionStorage.clear()
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
    sessionStorage.clear()
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
  it('C20 guided authoring exposes delivery and advanced JSON before saving and publishing', async () => {
    trainingPresentation.enabled = true
    const user = userEvent.setup()
    let current: any = { ...row, trainingFlowDraft: null, maxAttempts: 1 }
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? resources : current }))
    api.post.mockImplementation(async (path, body) => {
      if (path.endsWith('/preflight')) return { code: 0, data: { revision: current.revision, ok: true, checks: [] } }
      if (path.endsWith('/training-flow')) current = { ...current, revision: current.revision + 1, trainingFlowDraft: body.config, maxAttempts: body.maxAttempts }
      else if (path.endsWith('/publish')) current = { ...current, status: 'PUBLISHED', trainingFlowFrozen: current.trainingFlowDraft, trainingFlowDraft: null }
      else throw new Error('Unexpected synthetic mutation')
      return { code: 0, data: current }
    })
    mount('materials')
    await screen.findByDisplayValue('材料实验')
    const steps = screen.getByRole('navigation', { name: '编制步骤' })
    // jsdom has no scrolling layout API; visibility and disclosure behavior remain real DOM.
    steps.scrollIntoView = vi.fn()
    const flowToggle = screen.getByLabelText('启用跨工具条件流程', { exact: true })
    expect(flowToggle).not.toBeVisible()
    await user.click(within(steps).getByRole('link', { name: /投放设置/ }))
    expect(flowToggle).not.toBeVisible()
    await user.click(screen.getByText('分组与条件路径', { exact: true }))
    expect(flowToggle).toBeVisible()
    await user.click(flowToggle)
    const region = screen.getByRole('region', { name: '跨工具条件流程' })
    await user.click(within(region).getByRole('button', { name: '启用两组材料实验' }))
    await user.click(within(region).getByRole('button', { name: '添加配额示例' }))
    const editor = within(region).getByLabelText('流程 JSON（高级编辑）', { exact: true })
    expect(editor).not.toBeVisible()
    await user.click(within(region).getByText('编辑流程规则（高级 JSON）', { exact: true }))
    expect(editor).toBeVisible()
    const authored = JSON.parse((editor as HTMLTextAreaElement).value)
    expect(authored.schemaVersion).toBe(2)
    authored.experiment = config.experiment
    authored.quotaPolicy = { schemaVersion: 1, groupLimits: { a: 1, b: 1 } }
    fireEvent.change(editor, { target: { value: JSON.stringify(authored) } })
    fireEvent.change(within(region).getByLabelText('最多作答次数（材料实验）'), { target: { value: '2' } })
    await user.click(within(region).getByRole('button', { name: '保存流程设置' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/questionnaire-products/materials/training-flow', { revision: 3, config: authored, maxAttempts: 2 }))
    await waitFor(() => expect(within(region).getByRole('button', { name: '保存流程设置' })).toBeDisabled())
    expect(editor).toBeVisible()
    await user.click(within(steps).getByRole('link', { name: /检查与发布/ }))
    await user.click(screen.getByRole('button', { name: '发布前自检' }))
    await screen.findByText('当前草稿自检通过', { exact: true })
    await user.click(screen.getByRole('button', { name: '发布组合测评' }))
    expect(api.post.mock.calls.some(([path]) => path.endsWith('/publish'))).toBe(false)
    await user.click(within(screen.getByRole('dialog', { name: '确认发布组合测评' })).getByRole('button', { name: '确认发布' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/questionnaire-products/materials/publish', { revision: 4 }))
    await user.click(within(steps).getByRole('link', { name: /投放设置/ }))
    expect(editor).toBeVisible()
    expect(editor).toHaveAttribute('readonly')
    expect(JSON.parse((editor as HTMLTextAreaElement).value)).toEqual(authored)
    expect(current.maxAttempts).toBe(2)
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

describe('Training questionnaire guided editor', () => {
  const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
  afterEach(() => {
    if (originalScroll) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScroll)
    else Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })
  const resources = { scales: [{ id: 'scale', name: '可用量表' }], cognitive: [], situational: [], courses: [{ id: 'course', title: '本地课程', courseType: 'TRAINING_COURSE', isLibrary: false }] }
  const row = { id: 'guided', name: '步骤测评', status: 'DRAFT', revision: 7, questionnaireType: 'COURSE', productKind: 'QUESTIONNAIRE', questionnaireCourses: [{ courseId: 'course' }], publicEnabled: false, items: [{ id: 'item', type: 'SCALE', position: 0, scale: { name: '已有量表' } }], formSections: [] }
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    trainingPresentation.enabled = true
    capabilities.enabled = true
    vi.resetAllMocks()
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? resources : row }))
    api.put.mockImplementation(async (_path, body) => ({ code: 0, data: { ...row, ...body, revision: 8 } }))
  })
  it.each([
    ['SCALE', '量表', { scaleId: 'scale' }],
    ['COGNITIVE', '认知测验', { cognitiveAssignmentId: 'cognitive' }],
    ['SITUATIONAL', '情境判断', { situationalInstrumentKey: 'sjt-key', situationalInstrumentVersion: '2.0' }],
  ] as const)('selects %s through searchable cards while keeping the existing item API', async (type, label, itemFields) => {
    const available = { ...resources, cognitive: [{ id: 'cognitive', name: '授权认知', configVersion: '1.0' }], situational: [{ id: 'situational', name: '授权情境', instrumentKey: 'sjt-key', instrumentVersion: '2.0' }] }
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? available : row }))
    api.post.mockResolvedValue({ code: 0, data: { ...row, revision: 8 } })
    mount('guided', '#questionnaire-content')
    fireEvent.click(await screen.findByRole('button', { name: label }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp('选择' + label) }))
    const dialog = screen.getByRole('dialog')
    const title = type === 'SCALE' ? '可用量表' : type === 'COGNITIVE' ? '授权认知' : '授权情境'
    fireEvent.change(within(dialog).getByRole('textbox', { name: '检索工具' }), { target: { value: title } })
    fireEvent.click(within(dialog).getByRole('button', { name: new RegExp('选择 ' + title) }))
    expect(api.post).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '添加到测评' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledExactlyOnceWith('/questionnaire-products/guided/items', { revision: 7, item: { type, required: true, ...itemFields } }))
  })
  it('keeps the cognitive type discoverable but disabled when capability is unavailable', async () => {
    capabilities.enabled = false
    mount('guided', '#questionnaire-content')
    expect(await screen.findByRole('button', { name: '认知测验' })).toBeDisabled()
    expect(screen.getByText('认知测验暂不可用，当前无法添加。已有问卷内容会保留。')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })
  it('explains an empty cognitive catalog without inventing an available task', async () => {
    mount('guided', '#questionnaire-content')
    fireEvent.click(await screen.findByRole('button', { name: '认知测验' }))
    expect(screen.getByText('暂无可加入的认知测验。需要当前账号可用、已发布的认知任务，其配置也须已发布。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加到测评' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /^选择认知测验/ }))
    expect(screen.getByRole('dialog')).toHaveTextContent('共 0 项可用工具')
    expect(api.post).not.toHaveBeenCalled()
  })
  it('keeps unsaved metadata across steps and saves through the existing revision contract', async () => {
    mount('guided')
    await screen.findByDisplayValue('步骤测评')
    fireEvent.change(screen.getByLabelText('测评名称'), { target: { value: '保留未保存修改' } })
    fireEvent.click(screen.getByRole('link', { name: /02 内容与顺序/ }))
    expect(screen.getByRole('group', { name: '内容类型' })).toBeVisible()
    expect(screen.getByRole('button', { name: '添加到测评' })).toBeDisabled()
    fireEvent.click(screen.getByRole('link', { name: /基本信息/ }))
    expect(screen.getByLabelText('测评名称')).toHaveValue('保留未保存修改')
    fireEvent.click(screen.getByRole('button', { name: '保存全部修改' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/questionnaire-products/guided', expect.objectContaining({ name: '保留未保存修改', revision: 7 })))
  })
  it('reveals and focuses an invalid feedback time when saving from another step', async () => {
    mount('guided', '#questionnaire-delivery')
    fireEvent.click(await screen.findByRole('radio', { name: '预设时间开放' }))
    fireEvent.click(screen.getByRole('link', { name: /04 检查与发布/ }))
    fireEvent.click(screen.getByRole('button', { name: '保存全部修改' }))
    const input = screen.getByLabelText('报告开放时间')
    await waitFor(() => expect(input).toBeVisible())
    await waitFor(() => expect(input).toHaveFocus())
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(api.put).not.toHaveBeenCalled()
  })
  it('opens the publish deep link and routes a server preflight issue back to its unit', async () => {
    api.post.mockResolvedValue({ code: 0, data: { revision: 7, ok: false, checks: [{ key: 'content', label: '内容资格', status: 'failed', message: '请检查对应单元', targetId: 'item' }] } })
    mount('guided', '#questionnaire-publish')
    fireEvent.click(await screen.findByRole('button', { name: '发布前自检' }))
    expect(api.post).toHaveBeenCalledWith('/questionnaire-products/guided/preflight', { revision: 7 })
    fireEvent.click(await screen.findByRole('button', { name: '配置对应单元' }))
    expect(await screen.findByRole('button', { name: '配置第 1 项：1. 已有量表' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '发布组合测评' })).not.toBeInTheDocument()
  })
  it('creates with the existing request payload and opens real content authoring', async () => {
    const created = { ...row, id: 'created', name: '新步骤测评', items: [], revision: 1 }
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? resources : created }))
    api.post.mockResolvedValue({ code: 0, data: created })
    mount('new', '?courseId=course')
    await waitFor(() => expect(screen.getByRole('checkbox', { name: '本地课程', hidden: true })).toBeChecked())
    fireEvent.change(screen.getByLabelText('测评名称'), { target: { value: '新步骤测评' } })
    fireEvent.click(screen.getByRole('button', { name: '创建草稿，继续编排' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/questionnaire-products', expect.objectContaining({ name: '新步骤测评', courseIds: ['course'], trainingFeedbackPolicy: { schemaVersion: 1, mode: 'IMMEDIATE' } })))
    expect(await screen.findByRole('group', { name: '内容类型' })).toBeVisible()
  })
})

describe('Training automatic Form stages', () => {
  const source = { id: 'source', type: 'FORM', position: 0, formSectionId: 'stage-1', formSectionPosition: 0, formType: 'single_choice', formLabel: '已有选择题', required: true, formDefinition: { itemKey: 'q_source', type: 'SINGLE', options: [{ optionKey: 'yes', label: '是' }, { optionKey: 'no', label: '否' }] } }
  const resources = { scales: [], cognitive: [], situational: [], courses: [] }
  let row: any
  beforeEach(() => {
    trainingPresentation.enabled = true
    capabilities.enabled = true
    vi.resetAllMocks()
    row = { id: 'stages', name: '阶段表单', revision: 3, status: 'DRAFT', questionnaireType: 'COURSE', publicEnabled: false, questionnaireCourses: [], items: [structuredClone(source)], formSections: [{ id: 'stage-1', title: '现有表单', position: 0, contextSection: false, items: [structuredClone(source)] }] }
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? resources : row }))
    api.post.mockImplementation(async (_path, body) => {
      const sectionId = body.formSectionId || 'stage-2'
      const item = { ...body.item, id: 'added-' + row.revision, position: row.items.length, formSectionId: sectionId }
      row = { ...row, revision: row.revision + 1, items: [...row.items, item], formSections: row.formSections.some((section: any) => section.id === sectionId)
        ? row.formSections.map((section: any) => section.id === sectionId ? { ...section, items: [...section.items, item] } : section)
        : [...row.formSections, { id: sectionId, title: '新表单', position: item.position, contextSection: false, items: [item] }] }
      return { code: 0, data: row }
    })
  })
  const openForm = async () => {
    mount('stages', '#questionnaire-content')
    await userEvent.setup().click(await screen.findByRole('button', { name: '自定义表单' }))
  }
  const openAdvanced = async () => userEvent.setup().click(screen.getByText('高级答题规则', { selector: 'summary' }))
  it('adds library materials without opening advanced rules and persists them with the typed Form policy',async()=>{
    const read=api.get.getMockImplementation()!
    const asset={id:'asset',contentHash:'a'.repeat(64),mimeType:'application/pdf',name:'已有说明文档',size:100}
    api.get.mockImplementation(async(path:any,...rest:any[])=>path.startsWith('/training-workspace/media')?{code:0,data:{list:[asset],total:1,pageSize:9}}:read(path,...rest))
    await openForm()
    expect(screen.getByText('高级答题规则',{selector:'summary'}).closest('details')).not.toHaveAttribute('open')
    fireEvent.click(screen.getByText('题目素材 · 图片、视频、文档',{selector:'summary'}))
    fireEvent.click(screen.getByRole('button',{name:'从素材库添加'}));await screen.findByText('已有说明文档')
    fireEvent.click(screen.getByRole('button',{name:'添加'}))
    fireEvent.change(screen.getByLabelText('使用依据'),{target:{value:'authorized'}})
    fireEvent.change(screen.getByLabelText('原创／授权说明'),{target:{value:'本次展示许可'}})
    fireEvent.change(screen.getByLabelText('题目文字'),{target:{value:'先阅读再回答'}})
    fireEvent.click(screen.getByRole('button',{name:'添加到测评'}))
    await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][1].item).toMatchObject({formDefinition:{type:'SHORT_TEXT',materials:[{asset:{assetId:'asset',contentHash:asset.contentHash,mimeType:asset.mimeType},rightsStatus:'authorized',rightsNote:'本次展示许可'}]},formPolicy:{version:3}})
  })
  it('hides manual grouping and automatically appends ordinary questions without enabling V3', async () => {
    await openForm()
    expect(screen.queryByRole('combobox', { name: '加入表单区段' })).not.toBeInTheDocument()
    expect(screen.getByText('高级答题规则', { selector: 'summary' }).closest('details')).not.toHaveAttribute('open')
    expect(screen.getByLabelText('启用条件显示、拒答等规则')).not.toBeVisible()
    fireEvent.change(screen.getByLabelText('题目文字'), { target: { value: '普通追加题' } })
    fireEvent.click(screen.getByRole('button', { name: '添加到测评' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/questionnaire-products/stages/items', expect.objectContaining({ revision: 3, formSectionId: 'stage-1', item: expect.objectContaining({ formLabel: '普通追加题' }) })))
    expect(api.post.mock.calls[0][1].item.formPolicy).toBeUndefined()
  })
  it('starts a new stage only on request, then appends subsequent questions to that new stage', async () => {
    await openForm(); await openAdvanced()
    await userEvent.setup().click(screen.getByRole('button', { name: '新增答题阶段' }))
    fireEvent.change(screen.getByLabelText('题目文字'), { target: { value: '新阶段首题' } })
    fireEvent.click(screen.getByRole('button', { name: '添加到测评' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('formSectionId')
    await waitFor(() => expect(screen.getByLabelText('题目文字')).toHaveValue(''))
    fireEvent.change(screen.getByLabelText('题目文字'), { target: { value: '新阶段第二题' } })
    fireEvent.click(screen.getByRole('button', { name: '添加到测评' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(api.post.mock.calls[1][1]).toMatchObject({ revision: 4, formSectionId: 'stage-2' })
  })
  it('provides same-stage condition sources and clears a condition when starting another stage', async () => {
    await openForm(); await openAdvanced()
    fireEvent.click(screen.getByRole('checkbox', { name: '启用条件显示、拒答等规则' }))
    await userEvent.setup().selectOptions(screen.getByLabelText('显示条件'), 'q_source')
    expect(screen.getByLabelText('前题选项')).toHaveValue('yes')
    fireEvent.click(screen.getByRole('button', { name: '新增答题阶段' }))
    expect(screen.getByLabelText('显示条件')).toHaveValue('')
    expect(screen.queryByRole('option', { name: '已有选择题' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('题目文字'), { target: { value: '无跨阶段引用' } })
    fireEvent.click(screen.getByRole('button', { name: '添加到测评' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][1].item.formDefinition.displayIf).toBeUndefined()
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('formSectionId')
  })
  it('sends a selected same-stage condition with the existing stable item key', async () => {
    await openForm(); await openAdvanced()
    fireEvent.click(screen.getByRole('checkbox', { name: '启用条件显示、拒答等规则' }))
    await userEvent.setup().selectOptions(screen.getByLabelText('显示条件'), 'q_source')
    fireEvent.change(screen.getByLabelText('题目文字'), { target: { value: '同阶段条件题' } })
    fireEvent.click(screen.getByRole('button', { name: '添加到测评' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/questionnaire-products/stages/items', expect.objectContaining({ formSectionId: 'stage-1', item: expect.objectContaining({ formPolicy: { version: 3, requiredRefusal: 'BLOCK_SUBMIT', hiddenRequired: 'EXEMPT' }, formDefinition: expect.objectContaining({ displayIf: { itemKey: 'q_source', operator: 'EQUALS', optionKey: 'yes' } }) }) })))
  })
  it('starts automatically after another instrument instead of appending to an earlier section', async () => {
    row.items.push({ id: 'scale', type: 'SCALE', position: 1, scale: { name: '中间量表' } })
    await openForm()
    fireEvent.change(screen.getByLabelText('题目文字'), { target: { value: '量表之后的新题' } })
    fireEvent.click(screen.getByRole('button', { name: '添加到测评' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('formSectionId')
  })
  it('keeps the special background section separate from ordinary questions', async () => {
    row.items[0].contextKey = 'gradeLevel'
    row.formSections[0].contextSection = true
    row.formSections[0].items[0].contextKey = 'gradeLevel'
    await openForm()
    fireEvent.change(screen.getByLabelText('题目文字'), { target: { value: '背景信息后的普通题' } })
    fireEvent.click(screen.getByRole('button', { name: '添加到测评' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('formSectionId')
  })

  it('saves row-based legacy options with punctuation intact and preserves them on a rejected request', async () => {
    await openForm()
    await userEvent.setup().selectOptions(screen.getByLabelText('题型'), 'single_choice')
    fireEvent.change(screen.getByLabelText('题目文字'), { target: { value: '新选择题' } })
    fireEvent.change(screen.getByLabelText('选项 1 文字'), { target: { value: '中文, English' } })
    fireEvent.change(screen.getByLabelText('选项 2 文字'), { target: { value: 'a=b' } })
    api.post.mockRejectedValueOnce(new Error('本次保存失败'))
    fireEvent.click(screen.getByRole('button', { name: '添加到测评' }))
    await screen.findByRole('alert')
    expect(api.post.mock.calls[0][1]).toMatchObject({ formSectionId: 'stage-1', item: { formOptions: [{ value: 'option_1', label: '中文, English' }, { value: 'option_2', label: 'a=b' }] } })
    expect(screen.getByLabelText('选项 1 文字')).toHaveValue('中文, English')
    expect(screen.getByLabelText('题目文字')).toHaveValue('新选择题')
  })

  it('saves bulk matrix rows and options using the existing typed definition shape', async () => {
    await openForm()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('题型'), 'matrix')
    fireEvent.change(screen.getByLabelText('题目文字'), { target: { value: '矩阵评价' } })
    fireEvent.paste(screen.getByLabelText('矩阵行 1 文字'), { clipboardData: { getData: () => '课堂内容\n教学方式' } })
    fireEvent.paste(screen.getByLabelText('选项 1 文字'), { clipboardData: { getData: () => '满意\n一般' } })
    fireEvent.click(screen.getByRole('button', { name: '添加到测评' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][1].item.formDefinition).toMatchObject({ type: 'MATRIX', options: [{ optionKey: 'option_1', label: '满意' }, { optionKey: 'option_3', label: '一般' }], rows: [{ rowKey: 'row_1', label: '课堂内容' }, { rowKey: 'row_3', label: '教学方式' }] })
  })

  it('preserves supplied background codes and requires unlinking other/exclusive roles before deleting an option', async () => {
    await openForm()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('背景字段'), 'sexAtBirth')
    fireEvent.change(screen.getByLabelText('题目文字'), { target: { value: '背景问题' } })
    fireEvent.click(screen.getByRole('button', { name: '添加到测评' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][1].item.formOptions[0]).toMatchObject({ value: 'female' })
    await user.selectOptions(screen.getByLabelText('背景字段'), '')
    await user.selectOptions(screen.getByLabelText('题型'), 'multiple_choice')
    fireEvent.change(screen.getByLabelText('选项 1 文字'), { target: { value: '其他' } })
    fireEvent.change(screen.getByLabelText('选项 2 文字'), { target: { value: '普通' } })
    await openAdvanced()
    fireEvent.click(screen.getByRole('checkbox', { name: '启用条件显示、拒答等规则' }))
    await user.selectOptions(screen.getByLabelText('其他填写选项'), 'option_1')
    fireEvent.click(screen.getByRole('checkbox', { name: '其他' }))
    fireEvent.click(screen.getByRole('button', { name: '删除选项 1' }))
    expect(screen.getByLabelText('其他填写选项')).toHaveValue('option_1')
    await user.selectOptions(screen.getByLabelText('其他填写选项'), '')
    fireEvent.click(screen.getByRole('checkbox', { name: '其他' }))
    fireEvent.click(screen.getByRole('button', { name: '删除选项 1' }))
    expect(screen.getByLabelText('其他填写选项')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('题目文字'), { target: { value: '移除高级引用' } })
    fireEvent.click(screen.getByRole('button', { name: '添加到测评' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(api.post.mock.calls[1][1].item.formDefinition.otherOptionKey).toBeUndefined()
    expect(api.post.mock.calls[1][1].item.formDefinition.exclusiveOptionKeys).toEqual([])
  })
})


describe('guided anonymous publication', () => {
 const source = { id: 'guided-public', name: '匿名课程测评', status: 'DRAFT', revision: 7, productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', publicEnabled: true, expiresAt: '2099-01-01T00:00:00Z', questionnaireCourses: [{ courseId: 'course' }], items: [{ id: 'item', type: 'SCALE', position: 0, scale: { name: '量表' } }], formSections: [] }
 const setup = (status: string, overrides: Record<string, unknown> = {}) => {
  api.post.mockClear()
  api.put.mockClear()
  trainingPresentation.enabled = true
  api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? { scales: [], cognitive: [], situational: [], courses: [{ id: 'course', title: '合成课程', courseType: 'TRAINING_COURSE' }] } : { ...source, status, ...overrides } }))
 }
 it('explains the three steps before publishing without generating a public credential', async () => {
  setup('DRAFT')
  mount('guided-public', '#questionnaire-publish')
  expect(await screen.findByRole('heading', { name: '匿名分享，接下来只需三步' })).toBeInTheDocument()
  expect(screen.getByText('2. 生成匿名链接')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '匿名作答链接管理' })).not.toBeInTheDocument()
  expect(api.post).not.toHaveBeenCalled()
 })
 it('shows links directly after publication, outside the collapsed management actions', async () => {
  setup('PUBLISHED')
  mount('guided-public', '#questionnaire-publish')
  expect(await screen.findByRole('region', { name: '匿名作答链接管理' })).toBeVisible()
  expect(screen.getByRole('region', { name: '匿名作答链接管理' }).closest('details')).toBeNull()
 })
 it('opens one anonymous settings area from delivery and preserves changes through saving', async () => {
  const original = Element.prototype.scrollIntoView
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  try {
   setup('DRAFT', { publicEnabled: false, expiresAt: null })
   api.put.mockImplementation(async (_path, body) => ({ code: 0, data: { ...source, ...body, revision: 8 } }))
   mount('guided-public', '#questionnaire-delivery')
   fireEvent.click(await screen.findByRole('link', { name: '设置匿名链接' }))
   await waitFor(() => expect(screen.getByRole('region', { name: '匿名链接整体设置' })).toBeVisible())
   fireEvent.click(screen.getByRole('checkbox', { name: '允许通过公开链接作答' }))
   fireEvent.click(screen.getByRole('button', { name: '保存全部修改' }))
   const expiry = screen.getByLabelText('截止时间')
   await waitFor(() => expect(expiry).toHaveFocus())
   expect(expiry).toBeVisible()
   expect(api.put).not.toHaveBeenCalled()
   fireEvent.change(expiry, { target: { value: '2099-01-01T12:00' } })
   fireEvent.click(screen.getByRole('link', { name: /投放设置/ }))
   expect(screen.queryByRole('checkbox', { name: '允许通过公开链接作答' })).not.toBeInTheDocument()
   fireEvent.click(screen.getByRole('link', { name: '设置匿名链接' }))
   expect(expiry).toHaveValue('2099-01-01T12:00')
   fireEvent.click(screen.getByRole('button', { name: '保存全部修改' }))
   await waitFor(() => expect(api.put).toHaveBeenCalledWith('/questionnaire-products/guided-public', expect.objectContaining({ revision: 7, publicEnabled: true })))
   expect(api.put.mock.calls[0]![1].expiresAt).toBe(new Date('2099-01-01T12:00').toISOString())
  } finally { if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: original }); else Reflect.deleteProperty(Element.prototype, 'scrollIntoView') }
 })

})


describe('Training toolkit separation',()=>{
  const course={id:'course',title:'关联课程',courseType:'TRAINING_COURSE',isLibrary:false}
  const row={id:'tool',name:'工具迁移测试',status:'DRAFT',productKind:'QUESTIONNAIRE',revision:3,questionnaireType:'COURSE',questionnaireCourses:[{courseId:'course'}],items:[{id:'cognitive',type:'COGNITIVE',position:0,cognitiveAssignment:{title:'认知内容'}}],formSections:[],publicEnabled:false}
  beforeEach(()=>{vi.resetAllMocks();sessionStorage.clear();trainingPresentation.enabled=true;capabilities.enabled=true;api.get.mockImplementation(async path=>({code:0,data:path.endsWith('/resources')?{scales:[],cognitive:[],situational:[],courses:[course]}:row}))})
  it('keeps the three advanced controls in toolkit with the saved course context',async()=>{
    render(<MemoryRouter initialEntries={['/toolkit/compositions/tool']}><Routes><Route path="/toolkit/compositions/:id" element={<QuestionnaireProductEdit/>}/></Routes></MemoryRouter>)
    expect(await screen.findByRole('heading',{name:'工具迁移测试 · 配置与报告'})).toBeInTheDocument()
    expect(await screen.findByRole('region',{name:'认知测量版本发布'})).toBeInTheDocument()
    expect(screen.getByRole('region',{name:'投放报告与参考选择'})).toBeInTheDocument()
    expect(screen.getByRole('combobox',{name:'已保存的投放课程'})).toHaveValue('course')
    expect(screen.queryByRole('navigation',{name:'编制步骤'})).not.toBeInTheDocument()
  })
  it('hides advanced controls in course editing while retaining an unconfirmed selection guard',async()=>{
    sessionStorage.setItem('training-content-selection:'+JSON.stringify(['teacher-1','tool']),JSON.stringify({actorId:'teacher-1',compositeId:'tool',kind:'report',revision:3,selection:null,uncertain:true}))
    mount('tool');await screen.findByDisplayValue('工具迁移测试')
    expect(screen.queryByRole('region',{name:'认知测量版本发布'})).not.toBeInTheDocument()
    expect(screen.queryByRole('region',{name:'投放报告与参考选择'})).not.toBeInTheDocument()
    expect(screen.getByRole('link',{name:'在工具中管理参数、参考与报告 →'})).toHaveAttribute('href','/toolkit/compositions/tool')
    expect(within(screen.getByRole('complementary',{name:'编制概览'})).getByRole('region',{name:'工具配置与报告'})).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('工具迁移测试'),{target:{value:'修改名称'}})
    expect(screen.getByRole('button',{name:'保存全部设置'})).toBeDisabled()
    expect(api.put).not.toHaveBeenCalled()
  })
})
