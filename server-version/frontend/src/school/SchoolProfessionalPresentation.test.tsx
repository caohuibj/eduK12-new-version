import {it,expect,vi} from 'vitest'
import {render,screen,fireEvent,waitFor,within} from '@testing-library/react'
import SchoolApp from './SchoolApp'
import {SchoolRecoveryOfficer,type SchoolApi} from './SchoolRecovery'
import {SchoolProfessionalReports} from './SchoolReports'

it('switches recovery panes without writes or losing the typed draft and keeps explanations collapsed',()=>{
 const api=vi.fn()
 render(<SchoolRecoveryOfficer compact api={api as SchoolApi} classPath="/organizations/school/classes/class"/>)
 expect(screen.queryByRole('region',{name:'注册异常处理'})).not.toBeInTheDocument()
 expect(screen.queryByRole('note')).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('资格学号（不显示在审计记录中）'),{target:{value:'synthetic-number'}})
 fireEvent.click(screen.getByRole('button',{name:'注册异常'}))
 expect(screen.getByRole('region',{name:'注册异常处理'})).toBeInTheDocument()
 expect(screen.queryByLabelText('资格学号（不显示在审计记录中）')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'资格重发'}))
 expect(screen.getByRole('button',{name:'审核后重新发放资格'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'资格重发操作说明'}))
 expect(screen.getByRole('note')).toHaveTextContent('历史测评和原账号不会转移')
 fireEvent.scroll(document)
 expect(screen.queryByRole('note')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'恢复账号'}))
 expect(screen.getByLabelText('资格学号（不显示在审计记录中）')).toHaveValue('synthetic-number')
 expect(screen.getByRole('button',{name:'签发恢复码'})).toBeDisabled()
 expect(screen.getByLabelText('已在线下完成独立身份核验')).not.toBeChecked()
 expect(api).not.toHaveBeenCalled()
})

it('keeps qualification reissue verification and the original request body in its own pane',async()=>{
 const api=vi.fn(async()=>({}))
 render(<SchoolRecoveryOfficer compact api={api as SchoolApi} classPath="/organizations/school/classes/class"/>)
 fireEvent.click(screen.getByRole('button',{name:'资格重发'}))
 fireEvent.change(screen.getByLabelText('经核验的真实学生学号'),{target:{value:'synthetic-reissue'}})
 const issue=screen.getByRole('button',{name:'审核后重新发放资格'})
 expect(issue).toBeDisabled()
 fireEvent.click(screen.getByLabelText('已线下独立核实资格重发对象'))
 fireEvent.click(issue)
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/organizations/school/classes/class/reissue-eligibility','POST',{studentNumber:'synthetic-reissue',verifiedOffline:true}))
 await screen.findByRole('status')
 expect(screen.getByLabelText('经核验的真实学生学号')).toHaveValue('')
 expect(screen.getByLabelText('已线下独立核实资格重发对象')).not.toBeChecked()
})

it('keeps the freeze confirmation and emits no request when it is cancelled',async()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
 const api=vi.fn()
 try{
  render(<SchoolRecoveryOfficer compact api={api as SchoolApi} classPath="/organizations/school/classes/class"/>)
  fireEvent.click(screen.getByRole('button',{name:'紧急冻结'}))
  fireEvent.change(screen.getByLabelText('涉嫌被冒用的资格学号'),{target:{value:'synthetic-freeze'}})
  fireEvent.click(screen.getByRole('button',{name:'冻结疑似抢注身份'}))
  await waitFor(()=>expect(confirm).toHaveBeenCalledTimes(1))
  expect(confirm).toHaveBeenCalledWith('确认冻结该校园账号及其现有会话？历史测评归属不会迁移。')
  expect(api).not.toHaveBeenCalled()
 }finally{confirm.mockRestore()}
})

it('mounts counselor recovery and all five report tabs with compact controls and GET-only navigation',async()=>{
 window.history.replaceState(null,'','/workspace/recovery?organizationId=school&classUnitId=class')
 vi.stubGlobal('scrollTo',vi.fn())
 const reply=(data:unknown)=>({ok:true,json:async()=>({code:0,data})})
 const fetcher=vi.fn(async(url:string,options?:RequestInit)=>{
  if(options?.method&&options.method!=='GET')throw Error('Unexpected write during tab navigation')
  if(url.endsWith('/auth/me'))return reply({id:'psych',username:'心理教师',role:'TEACHER',accountDomain:'SCHOOL'})
  if(url.endsWith('/organizations'))return reply({list:[{id:'school',name:'示例学校',orgRole:'MEMBER'}]})
  if(url.endsWith('/context'))return reply({access:{orgRole:'MEMBER',canGovern:false,personas:['COUNSELOR'],capabilities:['PSYCHOLOGY_STAFF'],explicitDenies:[]}})
  if(url.endsWith('/units'))return reply({list:[{id:'class',name:'一班',unitKind:'CLASS'}]})
  return reply({subjects:[],sources:[],specs:[],list:[],truncated:false,canAuthor:false,parentReportsEnabled:false})
 })
 vi.stubGlobal('fetch',fetcher)
 try{
  const view=render(<SchoolApp/>)
  await screen.findByRole('region',{name:'恢复账号班级选择'})
  expect(screen.getByRole('navigation',{name:'账号与注册操作'})).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('当前班级'),{target:{value:''}})
  await screen.findByRole('heading',{name:'选择要处理的班级'})
  expect(screen.queryByRole('heading',{name:'先选择一个班级'})).not.toBeInTheDocument()
  expect(screen.queryByRole('navigation',{name:'账号与注册操作'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('link',{name:'报告与支持'}))
  for(const [tab,title,help] of [['群体报告','学校群体报告',null],['群体纵向分析','学校群体纵向报告',null],['保护性反馈','保护性反馈配置','保护性反馈使用说明'],['个体纵向分析','个体纵向分析配置','个体纵向分析使用说明'],['专业报告','已授权报告','专业报告使用说明']] as const){
   fireEvent.click(within(screen.getByRole('navigation',{name:'报告与支持功能入口'})).getByRole('link',{name:tab}))
   await screen.findByRole('heading',{name:title})
   expect(view.container.querySelector('.hs-report-panel')).not.toBeNull()
   if(help){
    expect(screen.getByRole('button',{name:help})).toHaveAttribute('aria-expanded','false')
    fireEvent.click(screen.getByRole('button',{name:help}))
    expect(screen.getByRole('note',{name:help})).toBeInTheDocument()
    fireEvent.scroll(document)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
   }else{
    expect(screen.getByText(/选择本任务的正式叶工具和人群/)).toBeVisible()
    expect(screen.getByText(/仅供当前获授权的心理教师和学校管理者使用/)).toBeVisible()
   }
   expect(window.location.search).toBe('?organizationId=school')
  }
  expect(fetcher.mock.calls.every(([,options])=>!options?.method||options.method==='GET')).toBe(true)
 }finally{vi.unstubAllGlobals();window.history.replaceState(null,'','/')}
})

it('keeps professional report limits and suppressions visible while folding only general instructions',async()=>{
 const api=vi.fn(async(path:string)=>path.endsWith('/artifacts')?{list:[{artifactId:'artifact',subjectAlias:'观察编号',analysisKind:'PROTECTED_FEEDBACK',generatedAt:'2026-10-25T00:00:00Z'}],hasMore:false}:{artifactId:'artifact',projection:{kind:'PROTECTED_FEEDBACK',state:'suppressed',metrics:{},limitations:['合成披露限制']}})
 render(<SchoolProfessionalReports compact api={api as unknown as SchoolApi} organizationId="school"/>)
 fireEvent.click(await screen.findByRole('button',{name:'核实权限并查看专业投影'}))
 expect(await screen.findByText('当前样本未达到保护规则，群体指标已被抑制。')).toBeInTheDocument()
 expect(screen.getByText('合成披露限制')).toBeInTheDocument()
 expect(screen.queryByRole('note')).not.toBeInTheDocument()
 expect(api.mock.calls).toEqual([['/reports/professional/organizations/school/artifacts'],['/reports/professional/organizations/school/artifacts/artifact']])
 fireEvent.click(screen.getByRole('button',{name:'关闭当前报告'}))
 expect(screen.queryByText('合成披露限制')).not.toBeInTheDocument()
})
