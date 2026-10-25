import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach,describe,it,expect,vi} from 'vitest'
import SurveyLibraryAdmin from './SurveyLibraryAdmin'
const mock=vi.hoisted(()=>({request:vi.fn(),user:{id:'manager',platformRole:'STANDARD'}}))
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>({user:mock.user})}))
vi.mock('../../api/surveyManagement',()=>({surveyManagementRequest:mock.request}))
vi.mock('../../admin/AdminStepUp',()=>({default:()=> <p>身份验证</p>}))
const item={catalogId:'standard:fixture:1',title:'完整内容工具',origin:'STANDARD_REGISTRY',exactVersion:{instrumentVersion:'1'},
 policyIdentity:{resourceKey:'standard:fixture:1',fingerprint:'a'.repeat(64)},policy:{decision:'PENDING',paused:false,version:0,reason:'未审批'},
 states:{content:{ready:true,reasons:[]},assignment:{ready:false,reasons:['尚未部署','尚未通过 Survey 范围审批']},deployment:{ready:false,reasons:['还需精确版本授权与准入核对']}}}
beforeEach(()=>{vi.clearAllMocks();mock.user={id:'manager',platformRole:'STANDARD'};mock.request.mockImplementation(async(_scope,path)=>path.startsWith('/catalog')?{list:[item],hasMore:false}:{list:[],hasMore:false})})
describe('scoped Survey library UI',()=>{
 it('separates content, assignment and deployment without opening controls by default',async()=>{
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>)
  expect(await screen.findByRole('heading',{name:'完整内容工具'})).toBeVisible()
  expect(screen.getByText('内容：就绪')).toBeVisible();expect(screen.getByText('授权：受阻')).toBeVisible()
  expect(screen.getByText('状态、详情与操作').closest('details')).not.toHaveAttribute('open')
  expect(mock.request).toHaveBeenCalledWith('survey-library','/catalog?page=1',undefined)
  expect(screen.queryByText('共享工具全局治理')).not.toBeInTheDocument()
 })
 it('requires a reason and sends a Survey-only exact-version decision, not a use grant',async()=>{
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>);await screen.findByText('完整内容工具')
  screen.getByText('状态、详情与操作').closest('details')!.setAttribute('open','')
  expect(screen.getByRole('button',{name:'批准 Survey 使用范围'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('审批或暂停原因'),{target:{value:'核对完整内容'}})
  fireEvent.click(screen.getByRole('button',{name:'批准 Survey 使用范围'}))
  await waitFor(()=>expect(mock.request).toHaveBeenCalledWith('survey-library','/policies',expect.objectContaining({resourceKey:item.policyIdentity.resourceKey,expectedVersion:0,decision:'APPROVED',paused:false,reason:'核对完整内容'})))
  expect(mock.request.mock.calls.some(c=>String(c[1]).includes('/grants'))).toBe(false)
 })
 it('shows system navigation separately from researcher administration',async()=>{
  mock.user={id:'system',platformRole:'SYSTEM_ADMIN'}
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>);await screen.findByText('完整内容工具')
  expect(screen.getByRole('link',{name:'共享工具全局治理'})).toBeVisible()
  expect(screen.queryByRole('link',{name:'研究者与工具授权'})).not.toBeInTheDocument()
 })
})


const tagFacets={
 population:[{id:'student_self_report',label:'学生'},{id:'teacher_report',label:'教师'}],
 construct:[{id:'MOTIVATION',label:'学习动机'}],
 subject:[{id:'MATHEMATICS',label:'数学'}],
 domain:[{id:'LEARNING',label:'学习与发展'}],
}
const classifiedItem={...item,classificationTags:[
 {id:'student_self_report',label:'学生',facet:'population'},
 {id:'MOTIVATION',label:'学习动机',facet:'construct'},
]}
const catalog=(list=[classifiedItem],hasMore=false)=>({list,hasMore,tagFacets})
function deferred<T>(){
 let resolve!:(value:T)=>void
 let reject!:(reason:Error)=>void
 const promise=new Promise<T>((res,rej)=>{resolve=res;reject=rej})
 return {promise,resolve,reject}
}
const queryPath=(page:number,keyword:string,tags:string,origin:string)=>'/catalog?'+new URLSearchParams({page:String(page),keyword,tags,origin}).toString()
const search=()=>fireEvent.click(screen.getByRole('button',{name:/^检索$/}))

describe('Survey catalog server-side classification search',()=>{
 it('submits trimmed keywords, stable facet IDs and origin together, resets the page, and keeps server matches',async()=>{
  const result={...classifiedItem,catalogId:'authored:server-match:1',title:'跨页目录结果',origin:'AUTHORED'}
  mock.request.mockResolvedValue(catalog([classifiedItem],true))
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>)
  await screen.findByText('完整内容工具')
  expect(mock.request).toHaveBeenLastCalledWith('survey-library','/catalog?page=1',undefined)
  fireEvent.click(screen.getByRole('button',{name:'下一页'}))
  await waitFor(()=>expect(mock.request).toHaveBeenLastCalledWith('survey-library','/catalog?page=2',undefined))
  await waitFor(()=>expect(screen.getByRole('button',{name:'刷新'})).toBeEnabled())

  const calls=mock.request.mock.calls.length
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'  学习 & 兴趣  '}})
  fireEvent.change(screen.getByLabelText('人群'),{target:{value:'student_self_report'}})
  fireEvent.change(screen.getByLabelText('测量内容'),{target:{value:'MOTIVATION'}})
  fireEvent.change(screen.getByLabelText('学科'),{target:{value:'MATHEMATICS'}})
  fireEvent.change(screen.getByLabelText('领域'),{target:{value:'LEARNING'}})
  fireEvent.change(screen.getByLabelText('来源'),{target:{value:'AUTHORED'}})
  expect(screen.getByText('完整内容工具')).toBeVisible()
  expect(mock.request).toHaveBeenCalledTimes(calls)

  mock.request.mockResolvedValue(catalog([result]))
  search()
  await waitFor(()=>expect(mock.request).toHaveBeenLastCalledWith('survey-library',queryPath(1,'学习 & 兴趣','student_self_report,MOTIVATION,MATHEMATICS,LEARNING','AUTHORED'),undefined))
  expect(await screen.findByText('跨页目录结果')).toBeVisible()
  expect(screen.queryByText('完整内容工具')).not.toBeInTheDocument()
  expect(within(screen.getByRole('navigation',{name:'工具库分页'})).getByText('第 1 页')).toBeVisible()
 })

 it('retains applied tags and origin on pagination and refresh, and clears both applied and draft filters',async()=>{
  mock.request.mockResolvedValue(catalog([classifiedItem],true))
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>)
  await screen.findByText('完整内容工具')
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'学习'}})
  fireEvent.change(screen.getByLabelText('人群'),{target:{value:'student_self_report'}})
  fireEvent.change(screen.getByLabelText('来源'),{target:{value:'STANDARD_REGISTRY'}})
  search()
  await waitFor(()=>expect(mock.request).toHaveBeenLastCalledWith('survey-library',queryPath(1,'学习','student_self_report','STANDARD_REGISTRY'),undefined))
  await waitFor(()=>expect(screen.getByRole('button',{name:'下一页'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'下一页'}))
  await waitFor(()=>expect(mock.request).toHaveBeenLastCalledWith('survey-library',queryPath(2,'学习','student_self_report','STANDARD_REGISTRY'),undefined))
  await waitFor(()=>expect(screen.getByRole('button',{name:'刷新'})).toBeEnabled())

  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'尚未提交'}})
  fireEvent.change(screen.getByLabelText('测量内容'),{target:{value:'MOTIVATION'}})
  fireEvent.change(screen.getByLabelText('来源'),{target:{value:'AUTHORED'}})
  fireEvent.change(screen.getByLabelText('学科'),{target:{value:'MATHEMATICS'}})
  fireEvent.change(screen.getByLabelText('领域'),{target:{value:'LEARNING'}})
  const calls=mock.request.mock.calls.length
  fireEvent.click(screen.getByRole('button',{name:'刷新'}))
  await waitFor(()=>expect(mock.request).toHaveBeenCalledTimes(calls+1))
  expect(mock.request).toHaveBeenLastCalledWith('survey-library',queryPath(2,'学习','student_self_report','STANDARD_REGISTRY'),undefined)
  await waitFor(()=>expect(screen.getByRole('button',{name:'刷新'})).toBeEnabled())

  fireEvent.click(screen.getByRole('button',{name:'清除筛选'}))
  await waitFor(()=>expect(mock.request).toHaveBeenLastCalledWith('survey-library','/catalog?page=1',undefined))
  expect(screen.getByLabelText('关键词')).toHaveValue('')
  for(const label of ['人群','测量内容','学科','领域'])expect(screen.getByLabelText(label)).toHaveValue('')
  expect(screen.getByLabelText('来源')).toHaveValue('ALL')
  expect(within(screen.getByRole('navigation',{name:'工具库分页'})).getByText('第 1 页')).toBeVisible()
 })

 it('shows Chinese classification badges without opening details and keeps global facets when the result is empty',async()=>{
  mock.request.mockResolvedValue(catalog())
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>)
  await screen.findByText('完整内容工具')
  const header=screen.getByRole('article').querySelector('header')!
  expect(within(header).getByText('学生')).toBeVisible()
  expect(within(header).getByText('学习动机')).toBeVisible()
  expect(within(header).queryByText('student_self_report')).not.toBeInTheDocument()
  expect(within(header).queryByText('MOTIVATION')).not.toBeInTheDocument()
  expect(within(screen.getByLabelText('人群')).getByRole('option',{name:'教师'})).toHaveValue('teacher_report')
  expect(within(screen.getByLabelText('学科')).getByRole('option',{name:'数学'})).toHaveValue('MATHEMATICS')
  expect(mock.request).toHaveBeenCalledTimes(1)

  mock.request.mockResolvedValue(catalog([]))
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'没有匹配'}})
  search()
  await waitFor(()=>expect(screen.queryByText('完整内容工具')).not.toBeInTheDocument())
  expect(mock.request).toHaveBeenLastCalledWith('survey-library','/catalog?'+new URLSearchParams({page:'1',keyword:'没有匹配'}).toString(),undefined)
  for(const label of ['人群','测量内容','学科','领域'])expect(within(screen.getByLabelText(label)).getByRole('option',{name:'全部'+label})).toBeInTheDocument()
  expect(within(screen.getByLabelText('人群')).getByRole('option',{name:'教师'})).toHaveValue('teacher_report')
  expect(within(screen.getByLabelText('测量内容')).getByRole('option',{name:'学习动机'})).toHaveValue('MOTIVATION')
  expect(within(screen.getByLabelText('来源')).getByRole('option',{name:'全部来源'})).toHaveValue('ALL')
 })

 it('ignores an older successful response after a newer search has completed',async()=>{
  mock.request.mockResolvedValue(catalog())
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>)
  await screen.findByText('完整内容工具')
  const older=deferred<ReturnType<typeof catalog>>()
  const latest=deferred<ReturnType<typeof catalog>>()
  mock.request.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
  fireEvent.click(screen.getByRole('button',{name:'刷新'}))
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'新的检索'}})
  expect(screen.getByRole('button',{name:/^检索$/})).toBeEnabled()
  search()
  await waitFor(()=>expect(mock.request).toHaveBeenCalledTimes(3))
  await act(async()=>{latest.resolve(catalog([{...classifiedItem,catalogId:'standard:latest:1',title:'最新目录结果'}]))})
  expect(screen.getByText('最新目录结果')).toBeVisible()
  await act(async()=>{older.resolve({...catalog([{...classifiedItem,catalogId:'standard:older:1',title:'过时目录结果'}],true),tagFacets:{population:[],construct:[],subject:[],domain:[]}})})
  expect(screen.getByText('最新目录结果')).toBeVisible()
  expect(screen.queryByText('过时目录结果')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'下一页'})).toBeDisabled()
  expect(within(screen.getByLabelText('人群')).getByRole('option',{name:'学生'})).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
 })

 it.each(['success','failure'] as const)('preserves the latest refresh error without showing old rows or pagination after an older %s',async(outcome)=>{
  mock.request.mockResolvedValue(catalog([classifiedItem],true))
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>)
  await screen.findByText('完整内容工具')
  const older=deferred<ReturnType<typeof catalog>>()
  const latest=deferred<ReturnType<typeof catalog>>()
  mock.request.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
  fireEvent.click(screen.getByRole('button',{name:'刷新'}))
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'新的检索'}})
  search()
  await waitFor(()=>expect(mock.request).toHaveBeenCalledTimes(3))
  await act(async()=>{latest.reject(new Error('最新目录读取失败'))})
  expect(screen.getByRole('alert')).toHaveTextContent('最新目录读取失败')
  expect(screen.queryByText('完整内容工具')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'下一页'})).toBeDisabled()
  await act(async()=>{
   if(outcome==='success')older.resolve(catalog([{...classifiedItem,catalogId:'standard:older:1',title:'过时目录结果'}]))
   else older.reject(new Error('过时目录读取失败'))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('最新目录读取失败')
  expect(screen.getByRole('alert')).not.toHaveTextContent('过时目录读取失败')
  expect(screen.queryByText('完整内容工具')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'下一页'})).toBeDisabled()
  expect(screen.getByLabelText('关键词')).toHaveValue('新的检索')
  expect(within(screen.getByLabelText('人群')).getByRole('option',{name:'学生'})).toBeInTheDocument()
  expect(screen.queryByText('过时目录结果')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'刷新'})).toBeEnabled()
 })

 it('keeps loading the newest request when an older request fails first',async()=>{
  mock.request.mockResolvedValue(catalog())
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>)
  await screen.findByText('完整内容工具')
  const older=deferred<ReturnType<typeof catalog>>()
  const latest=deferred<ReturnType<typeof catalog>>()
  mock.request.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
  fireEvent.click(screen.getByRole('button',{name:'刷新'}))
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'新的检索'}})
  search()
  await waitFor(()=>expect(mock.request).toHaveBeenCalledTimes(3))
  await act(async()=>{older.reject(new Error('过时目录读取失败'))})
  expect(screen.getByRole('button',{name:'刷新'})).toBeDisabled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await act(async()=>{latest.resolve(catalog([{...classifiedItem,catalogId:'standard:latest:1',title:'最新目录结果'}]))})
  expect(screen.getByText('最新目录结果')).toBeVisible()
  expect(screen.getByRole('button',{name:'刷新'})).toBeEnabled()
 })

 it('does not surface a stale failure after the latest search succeeds',async()=>{
  mock.request.mockResolvedValue(catalog())
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>)
  await screen.findByText('完整内容工具')
  const older=deferred<ReturnType<typeof catalog>>()
  const latest=deferred<ReturnType<typeof catalog>>()
  mock.request.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
  fireEvent.click(screen.getByRole('button',{name:'刷新'}))
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'新的检索'}})
  search()
  await waitFor(()=>expect(mock.request).toHaveBeenCalledTimes(3))
  await act(async()=>{latest.resolve(catalog([{...classifiedItem,catalogId:'standard:latest:1',title:'最新目录结果'}]))})
  await act(async()=>{older.reject(new Error('过时目录读取失败'))})
  expect(screen.getByText('最新目录结果')).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'刷新'})).toBeEnabled()
 })
})
