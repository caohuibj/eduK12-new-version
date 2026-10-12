import {describe,it,expect,vi} from 'vitest'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
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
    let current={...data}
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
    expect(screen.getByText(/现有报告仍按原有严格规则执行/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('群体统计附加保护'))
    const group=screen.getByRole('checkbox',{name:'群体统计附加保护整组切换'})
    expect(group).toHaveAttribute('aria-checked','false')
    fireEvent.click(screen.getByLabelText('隐藏小单元整题'))
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
})
