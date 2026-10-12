import {describe,it,expect,vi} from 'vitest'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {ReportPrivacyPreferences} from './ReportPrivacyPreferences'

const org='00000000-0000-4000-8000-000000000011'
const standard={
  minRespondentsProfile:'BASELINE',requireAllCompleted:false,withholdSmallCells:false,
  protectSmallNonrespondentComplement:false,crossReleaseOverlapGuard:false,
  restrictedStatisticsProjection:false,restrictItemDistributions:false,releaseDelayHours:0,
}
const groups=[{key:'COHORT',label:'群体统计附加保护'},
  {key:'DIFFERENCING',label:'跨轮与差分附加保护'}]
const options=[
  {key:'requireAllCompleted',group:'COHORT',label:'必须全体完成',detail:'附加保护'},
  {key:'withholdSmallCells',group:'COHORT',label:'隐藏小单元整题',detail:'附加保护'},
  {key:'crossReleaseOverlapGuard',group:'DIFFERENCING',label:'跨轮差分',detail:'附加保护'},
]
const data={
  editableScopes:['MY','SCHOOL_DEFAULT','SCHOOL_MINIMUM'],mine:null,schoolDefault:null,
  schoolMinimum:null,selected:standard,effective:standard,
  origin:'PRODUCT_DEFAULT',locks:{},selectedPreset:'STANDARD',effectivePreset:'STANDARD',
  disclosureState:'LEGACY_STRICT',
  catalog:{title:'学生评教教师',groups,options,baselineAlwaysOn:['身份权限','个人原始答案隔离'],
    reportConsumerActive:false,status:'PREFERENCES_ONLY',baselineNote:'',
    sensitiveEnforced:false},
}
describe('Cookie-like ReportPrivacyPreferences PR1 panel',()=>{
  it('groups options with accessible mixed state and saves a single custom preference',async()=>{
    let current: Record<string,unknown>={...data}
    const api=vi.fn(async(path:string,method='GET',body?:any)=>{
      if(path.endsWith('/preferences?scenario=TEACHER_STUDENT_EVALUATION')){
        return current
      }
      if(path.endsWith('/preferences/TEACHER_STUDENT_EVALUATION')&&method==='PUT'){
        expect(body.scope).toBe('MY')
        expect(body.expectedRevision).toBe(0)
        expect(body.preset).toBe('CUSTOM')
        expect(body.options.withholdSmallCells).toBe(true)
        expect(body.options.requireAllCompleted).toBe(false)
        expect(body.requestKey).toMatch(/^[0-9a-f-]{36}$/)
        current={...data,mine:{revision:1,preset:'CUSTOM',options:body.options},
          selected:body.options,origin:'MY',selectedPreset:'CUSTOM'}
        return {saved:true,revision:1}
      }
      throw Error('Unexpected '+method+' '+path)
    })
    render(<ReportPrivacyPreferences api={api as any} organizationId={org}
      scenarios={['TEACHER_STUDENT_EVALUATION']}/>)
    expect(await screen.findByText(/仅偏好保存阶段/)).toBeInTheDocument()
    expect(screen.getByText(/当前报告仍按原有严格规则执行/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('群体统计附加保护'))
    const group=screen.getByRole('checkbox',{name:'群体统计附加保护整组切换'})
    expect(group).toHaveAttribute('aria-checked','false')
    fireEvent.click(screen.getByRole('checkbox',{name:/隐藏小单元整题/}))
    expect(group).toHaveAttribute('aria-checked','mixed')
    fireEvent.click(screen.getByRole('button',{name:'保存为今后默认偏好'}))
    await waitFor(()=>expect(api).toHaveBeenCalledWith(
      '/organizations/'+org+'/report-privacy/preferences/TEACHER_STUDENT_EVALUATION',
      'PUT',expect.objectContaining({preset:'CUSTOM'})))
    expect(await screen.findByText(/偏好已保存/)).toBeInTheDocument()
  })
  it('uses publisher vs school-default scope and never exposes nonadmin scopes',async()=>{
    const onlyMy={...data,editableScopes:['MY']}
    const api=vi.fn(async()=>onlyMy)
    render(<ReportPrivacyPreferences api={api as any} organizationId={org}
      scenarios={['TEACHER_STUDENT_EVALUATION']}/>)
    await screen.findByText(/仅偏好保存阶段/)
    expect(screen.getByRole('option',{name:'我的默认偏好'})).toBeInTheDocument()
    expect(screen.queryByRole('option',{name:'学校强制保护底线'})).not.toBeInTheDocument()
  })

  it('never applies a delayed old-scenario response to the selected new scenario',async()=>{
    let finishOld!: (value:any)=>void
    const active={...data,catalog:{...data.catalog,reportConsumerActive:true,
      baselineNote:'只有新的正式 Run 使用冻结策略。'}}
    const api=vi.fn((path:string)=>{
      if(path.endsWith('scenario=TEACHER_STUDENT_EVALUATION'))
        return new Promise(resolve=>{finishOld=resolve})
      if(path.endsWith('scenario=TEACHER_ADULT_FORM_GROUP'))
        return Promise.resolve(active)
      throw Error('Unexpected '+path)
    })
    render(<ReportPrivacyPreferences api={api as any} organizationId={org}
      scenarios={['TEACHER_STUDENT_EVALUATION','TEACHER_ADULT_FORM_GROUP']}/>)
    fireEvent.change(screen.getByRole('combobox',{name:'评价类型'}),{
      target:{value:'TEACHER_ADULT_FORM_GROUP'},
    })
    expect(await screen.findByText(/适用新任务的偏好已生效/)).toBeInTheDocument()
    await act(async()=>{finishOld(data)})
    expect(screen.getByText(/适用新任务的偏好已生效/)).toBeInTheDocument()
    expect(screen.queryByText(/仅偏好保存阶段/)).not.toBeInTheDocument()
  })
  it('locks scenario switching during a write and explains new vs historical policies',async()=>{
    let finishSave!: (value:any)=>void
    const active={...data,catalog:{...data.catalog,reportConsumerActive:true,
      baselineNote:'新 Run 自动冻结策略。'}}
    const api=vi.fn((path:string,method='GET')=>{
      if(method==='PUT')return new Promise(resolve=>{finishSave=resolve})
      if(path.endsWith('scenario=TEACHER_STUDENT_EVALUATION'))
        return Promise.resolve(active)
      throw Error('Unexpected '+method+' '+path)
    })
    render(<ReportPrivacyPreferences api={api as any} organizationId={org}
      scenarios={['TEACHER_STUDENT_EVALUATION','TEACHER_ADULT_FORM_GROUP']}/>)
    await screen.findByText(/适用新任务的偏好已生效/)
    fireEvent.click(screen.getByRole('button',{name:'保存为今后默认偏好'}))
    const select=screen.getByRole('combobox',{name:'评价类型'})
    expect(select).toBeDisabled()
    await act(async()=>{finishSave({saved:true,revision:1})})
    expect(await screen.findByText(/仅对后续正式发布并冻结策略的受支持新任务生效/))
      .toBeInTheDocument()
    expect(select).not.toBeDisabled()
  })
})
