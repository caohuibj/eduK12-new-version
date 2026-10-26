import {act,render,screen,fireEvent,waitFor,within} from '@testing-library/react'
import {beforeEach,describe,it,expect,vi} from 'vitest'
import StandardTripletWorkspace from './StandardTripletWorkspace'
const mock=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../api/surveyStandard',()=>({standardRequest:mock.api}))
vi.mock('../../admin/AdminStepUp',()=>({default:()=> <p>身份验证</p>}))
const hashes={CONTENT:'a'.repeat(64),PARAMETERS:'b'.repeat(64),REPORT:'c'.repeat(64)}
const row={toolKey:'fixture',instrumentVersion:'1',title:'示例量表',versions:Object.entries(hashes).map(([axis,hash])=>({axis,hash,version:'1'})),combinationHash:'combo',blockers:[],releases:[],tags:[]}
const detail={selection:{toolKey:'fixture',...hashes},available:[...row.versions.map(v=>({...v,payload:{valid:true},reference:{}})),{axis:'REPORT',hash:'empty-report',version:'none-v1',payload:null}],history:[],trials:[],reference:{authors:['Original']}}
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();mock.api.mockImplementation(async(path:string)=>{if(path.startsWith('/catalog'))return {list:[row],hasMore:false};if(path.startsWith('/candidate'))return detail;if(path==='/management-design')return {rules:[{action:'use.assign',label:'分配使用',training:'仅 Training',survey:'仅 Survey',system:'不代管'}],families:[{family:'COMBINATION',label:'单纯组合',content:'固定组件',parameters:'无额外参数',report:'没有组合报告',implementation:'规则已确认，运行入口尚未接通'},{family:'BUNDLE',label:'组合包',content:'固定组件',parameters:'可留空',report:'组合报告',implementation:'整包禁止拆用'}],boundaries:['不自动产生授权']};return {combinationHash:'combo',blockers:[],parts:Object.fromEntries(detail.available.slice(0,3).map(p=>[p.axis,p]))}})})
async function open(){render(<StandardTripletWorkspace authored={<p>旧入库页面</p>}/>);const title=await screen.findByText('示例量表');const d=title.closest('details')!;d.open=true;fireEvent(d,new Event('toggle'));await screen.findByText('不反馈（无报告） · empty-re');return d}
describe('standard workflow and unified management design UI',()=>{
 it('loads only read-only catalog and defers details until expansion',async()=>{render(<StandardTripletWorkspace authored={null}/>);await screen.findByText('示例量表');expect(mock.api).toHaveBeenCalledTimes(1);expect(screen.getByText('示例量表').closest('details')).not.toHaveAttribute('open');expect(mock.api.mock.calls.every(c=>c[1]===undefined)).toBe(true)})
 it('allows explicit no-report selection and invalidates prior preview',async()=>{await open();fireEvent.click(screen.getByRole('button',{name:'核对三份版本'}));await screen.findByText('三份版本对应关系已核对');fireEvent.change(screen.getByLabelText('文字报告版本'),{target:{value:'empty-report'}});expect(screen.queryByText('三份版本对应关系已核对')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'批准并试运行，通过后上线'})).toBeDisabled();expect(mock.api.mock.calls.some(c=>String(c[0]).includes('approve'))).toBe(false)})
 it('requires explicit approval confirmation and never grants researcher use',async()=>{await open();fireEvent.change(screen.getByLabelText('本次操作原因'),{target:{value:'核对三份版本'}});fireEvent.click(screen.getByRole('checkbox',{name:'Survey'}));fireEvent.click(screen.getByRole('button',{name:'核对三份版本'}));await screen.findByText('三份版本对应关系已核对');vi.spyOn(window,'confirm').mockReturnValueOnce(false);fireEvent.click(screen.getByRole('button',{name:'批准并试运行，通过后上线'}));await waitFor(()=>expect(window.confirm).toHaveBeenCalled());expect(mock.api.mock.calls.some(c=>/approve|grants/.test(String(c[0])))).toBe(false)})
 it('displays unified roles and both composition types without mutation',async()=>{render(<StandardTripletWorkspace authored={null}/>);await screen.findByText('示例量表');fireEvent.click(screen.getByRole('button',{name:'权限与授权'}));expect(await screen.findByRole('heading',{name:'系统与四个入口管理员的权限边界'})).toBeVisible();expect(screen.getByRole('columnheader',{name:'School 管理员'})).toBeVisible();expect(screen.getByRole('columnheader',{name:'Teacher 管理员'})).toBeVisible();expect(screen.getByText('单纯组合')).toBeVisible();expect(screen.getByText('组合包')).toBeVisible();expect(screen.getByText('规则已确认，运行入口尚未接通')).toBeVisible();expect(mock.api.mock.calls.every(c=>c[1]===undefined)).toBe(true)})
})


const tagFacets={
 population:[{id:'student_self_report',label:'学生'},{id:'teacher_report',label:'教师'}],
 construct:[{id:'MOTIVATION',label:'学习动机'}],
 subject:[{id:'MATHEMATICS',label:'数学'}],
 domain:[{id:'LEARNING',label:'学习与发展'}],
}
const classifiedRow={...row,classificationTags:[
 {id:'student_self_report',label:'学生',facet:'population'},
 {id:'MOTIVATION',label:'学习动机',facet:'construct'},
]}
const catalog=(list=[classifiedRow],hasMore=false)=>({list,hasMore,tagFacets})
function deferred<T>(){
 let resolve!:(value:T)=>void
 let reject!:(reason:Error)=>void
 const promise=new Promise<T>((res,rej)=>{resolve=res;reject=rej})
 return {promise,resolve,reject}
}
const queryPath=(page:number,keyword:string,tags:string)=>'/catalog?'+new URLSearchParams({page:String(page),keyword,tags}).toString()
const search=()=>fireEvent.click(screen.getByRole('button',{name:/^检索$/}))

describe('standard catalog server-side classification search',()=>{
 it('submits trimmed keywords and stable facet IDs, resets the page, and renders server matches without local filtering',async()=>{
  const result={...classifiedRow,toolKey:'server-match',title:'跨页目录结果'}
  mock.api.mockResolvedValue(catalog([classifiedRow],true))
  render(<StandardTripletWorkspace authored={null}/>)
  await screen.findByText('示例量表')
  expect(mock.api).toHaveBeenLastCalledWith('/catalog?page=1')
  expect(screen.getByLabelText('关键词')).toHaveAttribute('maxlength','100')
  fireEvent.click(screen.getByRole('button',{name:'下一页'}))
  await waitFor(()=>expect(mock.api).toHaveBeenLastCalledWith('/catalog?page=2'))
  await waitFor(()=>expect(screen.getByRole('button',{name:'刷新'})).toBeEnabled())

  const calls=mock.api.mock.calls.length
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'  学习 & 兴趣  '}})
  fireEvent.change(screen.getByLabelText('人群'),{target:{value:'student_self_report'}})
  fireEvent.change(screen.getByLabelText('测量内容'),{target:{value:'MOTIVATION'}})
  fireEvent.change(screen.getByLabelText('学科'),{target:{value:'MATHEMATICS'}})
  fireEvent.change(screen.getByLabelText('领域'),{target:{value:'LEARNING'}})
  expect(screen.getByText('示例量表')).toBeVisible()
  expect(mock.api).toHaveBeenCalledTimes(calls)

  mock.api.mockResolvedValue(catalog([result]))
  search()
  await waitFor(()=>expect(mock.api).toHaveBeenLastCalledWith(queryPath(1,'学习 & 兴趣','student_self_report,MOTIVATION,MATHEMATICS,LEARNING')))
  expect(await screen.findByText('跨页目录结果')).toBeVisible()
  expect(screen.queryByText('示例量表')).not.toBeInTheDocument()
  expect(within(screen.getByRole('navigation',{name:'标准量表分页'})).getByText('第 1 页')).toBeVisible()
 })

 it('keeps applied filters for pagination and refresh, and clears all filters back to page one',async()=>{
  mock.api.mockResolvedValue(catalog([classifiedRow],true))
  render(<StandardTripletWorkspace authored={null}/>)
  await screen.findByText('示例量表')
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'学习'}})
  fireEvent.change(screen.getByLabelText('人群'),{target:{value:'student_self_report'}})
  search()
  await waitFor(()=>expect(mock.api).toHaveBeenLastCalledWith(queryPath(1,'学习','student_self_report')))
  await waitFor(()=>expect(screen.getByRole('button',{name:'下一页'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'下一页'}))
  await waitFor(()=>expect(mock.api).toHaveBeenLastCalledWith(queryPath(2,'学习','student_self_report')))
  await waitFor(()=>expect(screen.getByRole('button',{name:'刷新'})).toBeEnabled())

  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'尚未提交'}})
  fireEvent.change(screen.getByLabelText('测量内容'),{target:{value:'MOTIVATION'}})
  fireEvent.change(screen.getByLabelText('学科'),{target:{value:'MATHEMATICS'}})
  fireEvent.change(screen.getByLabelText('领域'),{target:{value:'LEARNING'}})
  const calls=mock.api.mock.calls.length
  fireEvent.click(screen.getByRole('button',{name:'刷新'}))
  await waitFor(()=>expect(mock.api).toHaveBeenCalledTimes(calls+1))
  expect(mock.api).toHaveBeenLastCalledWith(queryPath(2,'学习','student_self_report'))
  await waitFor(()=>expect(screen.getByRole('button',{name:'刷新'})).toBeEnabled())

  fireEvent.click(screen.getByRole('button',{name:'清除筛选'}))
  await waitFor(()=>expect(mock.api).toHaveBeenLastCalledWith('/catalog?page=1'))
  expect(screen.getByLabelText('关键词')).toHaveValue('')
  for(const label of ['人群','测量内容','学科','领域'])expect(screen.getByLabelText(label)).toHaveValue('')
  expect(within(screen.getByRole('navigation',{name:'标准量表分页'})).getByText('第 1 页')).toBeVisible()
 })

 it('shows Chinese classification badges before expansion and catalog-wide facet choices even with no matches',async()=>{
  mock.api.mockResolvedValue(catalog())
  render(<StandardTripletWorkspace authored={null}/>)
  await screen.findByText('示例量表')
  const summary=screen.getByRole('article').querySelector('summary')!
  expect(within(summary).getByText('学生')).toBeVisible()
  expect(within(summary).getByText('学习动机')).toBeVisible()
  expect(within(summary).queryByText('student_self_report')).not.toBeInTheDocument()
  expect(within(summary).queryByText('MOTIVATION')).not.toBeInTheDocument()
  expect(within(screen.getByLabelText('人群')).getByRole('option',{name:'教师'})).toHaveValue('teacher_report')
  expect(within(screen.getByLabelText('学科')).getByRole('option',{name:'数学'})).toHaveValue('MATHEMATICS')
  expect(mock.api).toHaveBeenCalledTimes(1)

  mock.api.mockResolvedValue(catalog([]))
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'没有匹配'}})
  search()
  await waitFor(()=>expect(screen.queryByText('示例量表')).not.toBeInTheDocument())
  expect(mock.api).toHaveBeenLastCalledWith('/catalog?'+new URLSearchParams({page:'1',keyword:'没有匹配'}).toString())
  for(const label of ['人群','测量内容','学科','领域'])expect(within(screen.getByLabelText(label)).getByRole('option',{name:'全部'+label})).toBeInTheDocument()
  expect(within(screen.getByLabelText('人群')).getByRole('option',{name:'教师'})).toHaveValue('teacher_report')
  expect(within(screen.getByLabelText('测量内容')).getByRole('option',{name:'学习动机'})).toHaveValue('MOTIVATION')
 })

 it('ignores an older successful response after a newer search has completed',async()=>{
  mock.api.mockResolvedValue(catalog())
  render(<StandardTripletWorkspace authored={null}/>)
  await screen.findByText('示例量表')
  const older=deferred<ReturnType<typeof catalog>>()
  const latest=deferred<ReturnType<typeof catalog>>()
  mock.api.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
  fireEvent.click(screen.getByRole('button',{name:'刷新'}))
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'新的检索'}})
  expect(screen.getByRole('button',{name:/^检索$/})).toBeEnabled()
  search()
  await waitFor(()=>expect(mock.api).toHaveBeenCalledTimes(3))
  await act(async()=>{latest.resolve(catalog([{...classifiedRow,toolKey:'latest',title:'最新目录结果'}]))})
  expect(screen.getByText('最新目录结果')).toBeVisible()
  await act(async()=>{older.resolve({...catalog([{...classifiedRow,toolKey:'older',title:'过时目录结果'}],true),tagFacets:{population:[],construct:[],subject:[],domain:[]}})})
  expect(screen.getByText('最新目录结果')).toBeVisible()
  expect(screen.queryByText('过时目录结果')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'下一页'})).toBeDisabled()
  expect(within(screen.getByLabelText('人群')).getByRole('option',{name:'学生'})).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
 })

 it.each(['success','failure'] as const)('preserves the latest refresh error without showing old rows or pagination after an older %s',async(outcome)=>{
  mock.api.mockResolvedValue(catalog([classifiedRow],true))
  render(<StandardTripletWorkspace authored={null}/>)
  await screen.findByText('示例量表')
  const older=deferred<ReturnType<typeof catalog>>()
  const latest=deferred<ReturnType<typeof catalog>>()
  mock.api.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
  fireEvent.click(screen.getByRole('button',{name:'刷新'}))
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'新的检索'}})
  search()
  await waitFor(()=>expect(mock.api).toHaveBeenCalledTimes(3))
  await act(async()=>{latest.reject(new Error('最新目录读取失败'))})
  expect(screen.getByRole('alert')).toHaveTextContent('最新目录读取失败')
  expect(screen.queryByText('示例量表')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'下一页'})).toBeDisabled()
  await act(async()=>{
   if(outcome==='success')older.resolve(catalog([{...classifiedRow,toolKey:'older',title:'过时目录结果'}]))
   else older.reject(new Error('过时目录读取失败'))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('最新目录读取失败')
  expect(screen.getByRole('alert')).not.toHaveTextContent('过时目录读取失败')
  expect(screen.queryByText('示例量表')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'下一页'})).toBeDisabled()
  expect(screen.queryByText('过时目录结果')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'刷新'})).toBeEnabled()
  expect(screen.getByLabelText('关键词')).toHaveValue('新的检索')
  expect(within(screen.getByLabelText('人群')).getByRole('option',{name:'学生'})).toBeInTheDocument()
 })

 it('keeps loading the newest request when an older request fails first',async()=>{
  mock.api.mockResolvedValue(catalog())
  render(<StandardTripletWorkspace authored={null}/>)
  await screen.findByText('示例量表')
  const older=deferred<ReturnType<typeof catalog>>()
  const latest=deferred<ReturnType<typeof catalog>>()
  mock.api.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
  fireEvent.click(screen.getByRole('button',{name:'刷新'}))
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'新的检索'}})
  search()
  await waitFor(()=>expect(mock.api).toHaveBeenCalledTimes(3))
  await act(async()=>{older.reject(new Error('过时目录读取失败'))})
  expect(screen.getByRole('button',{name:'刷新'})).toBeDisabled()
  expect(screen.getByText('正在读取版本状态…')).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await act(async()=>{latest.resolve(catalog([{...classifiedRow,toolKey:'latest',title:'最新目录结果'}]))})
  expect(screen.getByText('最新目录结果')).toBeVisible()
  expect(screen.getByRole('button',{name:'刷新'})).toBeEnabled()
  expect(screen.queryByText('正在读取版本状态…')).not.toBeInTheDocument()
 })

 it('does not surface a stale failure after the latest search succeeds',async()=>{
  mock.api.mockResolvedValue(catalog())
  render(<StandardTripletWorkspace authored={null}/>)
  await screen.findByText('示例量表')
  const older=deferred<ReturnType<typeof catalog>>()
  const latest=deferred<ReturnType<typeof catalog>>()
  mock.api.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
  fireEvent.click(screen.getByRole('button',{name:'刷新'}))
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'新的检索'}})
  search()
  await waitFor(()=>expect(mock.api).toHaveBeenCalledTimes(3))
  await act(async()=>{latest.resolve(catalog([{...classifiedRow,toolKey:'latest',title:'最新目录结果'}]))})
  await act(async()=>{older.reject(new Error('过时目录读取失败'))})
  expect(screen.getByText('最新目录结果')).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'刷新'})).toBeEnabled()
 })
})

describe('explicit standard product entry selection',()=>{
 it.each([['TRAINING'],['SURVEY'],['TRAINING','SURVEY']])('submits exactly the selected entry scope %j without assigning use',async(...products)=>{
  // it.each passes row elements as arguments; each row is one explicit scope.
  const selected=products.filter((value):value is string=>typeof value==='string')
  await open()
  fireEvent.change(screen.getByLabelText('本次操作原因'),{target:{value:'审核精确入口'}})
  fireEvent.click(screen.getByRole('button',{name:'核对三份版本'}));await screen.findByText('三份版本对应关系已核对')
  const approve=screen.getByRole('button',{name:'批准并试运行，通过后上线'})
  expect(approve).toBeDisabled()
  for(const product of selected)fireEvent.click(screen.getByRole('checkbox',{name:product==='TRAINING'?'Training':'Survey'}))
  expect(approve).toBeEnabled()
  vi.spyOn(window,'confirm').mockReturnValue(true)
  mock.api.mockImplementation(async(path:string)=>{
   if(path==='/approve')return {state:'ONLINE'}
   if(path.startsWith('/catalog'))return {list:[row],hasMore:false}
   if(path.startsWith('/candidate'))return detail
   throw new Error('Unexpected request '+path)
  })
  fireEvent.click(approve)
  await waitFor(()=>expect(mock.api.mock.calls.some(call=>call[0]==='/approve')).toBe(true))
  const body=mock.api.mock.calls.find(call=>call[0]==='/approve')![1]
  expect(body.allowedProducts).toEqual([...selected].sort())
  expect(mock.api.mock.calls.some(call=>String(call[0]).includes('grant'))).toBe(false)
  await screen.findByText('已上线；未创建研究者授权。')
 })
 it('fetches onboarding status only after selecting the read-only tab',async()=>{
  await open();expect(mock.api).not.toHaveBeenCalledWith('/onboarding-status')
  mock.api.mockImplementation(async(path:string)=>{if(path==='/onboarding-status')return {list:[]};throw new Error('Unexpected request '+path)})
  fireEvent.click(screen.getByRole('button',{name:'接入状态'}))
  expect(await screen.findByRole('heading',{name:'标准量表接入状态'})).toBeVisible()
  expect(await screen.findByText('尚无标准量表接入记录。')).toBeVisible()
  expect(mock.api.mock.calls.filter(call=>call[0]==='/onboarding-status')).toEqual([['/onboarding-status']])
 })
})

it('keeps one approval intent after an uncertain result and refuses a changed entry scope',async()=>{
 await open()
 fireEvent.change(screen.getByLabelText('本次操作原因'),{target:{value:'核对入口'}})
 fireEvent.click(screen.getByRole('checkbox',{name:'Training'}))
 fireEvent.click(screen.getByRole('button',{name:'核对三份版本'}));await screen.findByText('三份版本对应关系已核对')
 vi.spyOn(window,'confirm').mockReturnValue(true)
 const original=mock.api.getMockImplementation()!
 let firstBody:any
 mock.api.mockImplementation(async(path:string,body?:unknown)=>{if(path==='/approve'){firstBody=body;throw new Error('网络结果未知')}return original(path,body)})
 fireEvent.click(screen.getByRole('button',{name:'批准并试运行，通过后上线'}));await screen.findByText(/网络结果未知/)
 fireEvent.click(screen.getByRole('checkbox',{name:'Survey'}))
 fireEvent.click(screen.getByRole('button',{name:'批准并试运行，通过后上线'}));await screen.findByText(/不能更换入口范围/)
 expect(mock.api.mock.calls.filter(call=>call[0]==='/approve')).toHaveLength(1)
 fireEvent.click(screen.getByRole('checkbox',{name:'Survey'}))
 mock.api.mockImplementation(async(path:string,body?:unknown)=>{if(path==='/approve'){expect(body).toEqual(firstBody);return {state:'ONLINE'}}return original(path,body)})
 fireEvent.click(screen.getByRole('button',{name:'批准并试运行，通过后上线'}));await screen.findByText('已上线；未创建研究者授权。')
 expect(sessionStorage.getItem('survey-triplet-approval:combo')).toBeNull()
})
