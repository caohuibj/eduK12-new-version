import {afterEach,describe,expect,it,vi} from 'vitest'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {SchoolGeneralGroupV2} from './SchoolGeneralGroupV2'

const organizationId='00000000-0000-4000-8000-000000000011'
const runId='00000000-0000-4000-8000-000000000012'
const trackId='00000000-0000-4000-8000-000000000013'
const specId='00000000-0000-4000-8000-000000000014'
const catalog={
  specs:[{specId,title:'课堂学习参与度',version:2,
    privacy:{minimumCohortN:5,minimumContributorN:5}}],
  sources:[{runId,trackId,name:'学校氛围调查',resource:{
    family:'SCALE',key:'approved-general',version:'1.0'}}],
  truncated:false,note:'仅显示经过审核的非敏感资源',
}
const report={
  artifactId:'00000000-0000-4000-8000-000000000015',
  kind:'SCHOOL_GENERAL_GROUP',state:'READY',
  participantN:6,completedN:5,metrics:{
    participation:{mean:3.2,validN:5,missingN:1,median:3.2,sdPopulation:0.5}},
  limitations:['该结果仅属于一般教育描述统计，不用于个人诊断。'],
}
afterEach(()=>vi.restoreAllMocks())
describe('Huischool general education GROUP V2 UI',()=>{
  it('first release uses MFA-gated server POST, subsequent view uses snapshot GET',async()=>{
    const calls: Array<{path:string;method:string;data:unknown}>=[]
    const api=vi.fn(async (path:string,method='GET',data?:unknown)=>{
      calls.push({path,method,data})
      if(path.startsWith('/reports/groups/general-v2/catalog'))return catalog
      if(path==='/reports/groups/general-v2/release'){
        expect(method).toBe('POST')
        expect(data).toMatchObject({organizationId,runId,trackId,specId})
        return report
      }
      if(path.endsWith('/'+organizationId+'/'+runId+'/'+trackId+'/'+specId))
        return report
      throw Error('Unexpected '+method+' '+path)
    })
    vi.spyOn(window,'confirm').mockReturnValue(true)
    render(<SchoolGeneralGroupV2 api={api as any} organizationId={organizationId}/>)
    fireEvent.change(await screen.findByLabelText('一般教育活动的正式 Run'),
      {target:{value:runId+':'+trackId}})
    fireEvent.change(screen.getByLabelText('已发布的 GROUP 科学分析方案'),
      {target:{value:specId}})
    fireEvent.click(screen.getByRole('button',{name:'正式发布一次群体报告'}))
    await waitFor(()=>expect(calls.some(x=>x.path==='/reports/groups/general-v2/release'
      &&x.method==='POST')).toBe(true))
    expect(await screen.findByText('该结果仅属于一般教育描述统计，不用于个人诊断。'))
      .toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'读取已发布结果'}))
    await waitFor(()=>expect(calls.some(x=>x.method==='GET'
      &&x.path.includes('/'+runId+'/'+trackId+'/'+specId))).toBe(true))
    expect(calls.filter(x=>x.path==='/reports/groups/general-v2/release')).toHaveLength(1)
  })
  it('fails closed for operator-empty resource catalog',async()=>{
    const api=vi.fn(async()=>({...catalog,sources:[],specs:[],
      note:'尚未配置已审核的一般教育测评资源'}))
    render(<SchoolGeneralGroupV2 api={api as any} organizationId={organizationId}/>)
    expect(await screen.findByText('尚未配置已审核的一般教育测评资源'))
      .toBeInTheDocument()
    expect(screen.getByRole('button',{name:'正式发布一次群体报告'})).toBeDisabled()
    expect(screen.getByRole('button',{name:'读取已发布结果'})).toBeDisabled()
  })
})
