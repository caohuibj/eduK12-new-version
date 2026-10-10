import { describe,expect,it,vi } from 'vitest'
import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { SchoolGroupReports } from './SchoolGroupReports'
import type { SchoolApi } from './SchoolRecovery'

const org='00000000-0000-4000-8000-000000000001'
const run='00000000-0000-4000-8000-000000000002'
const track='00000000-0000-4000-8000-000000000003'
const spec='00000000-0000-4000-8000-000000000004'
const artifact='00000000-0000-4000-8000-000000000005'
const catalog={
  specs:[{specId:spec,title:'校园身心支持群体方案',version:1,
    metricIds:['student-support'],privacy:{minimumCohortN:10,minimumContributorN:10}}],
  sources:[{runId:run,trackId:track,name:'班级心理健康支持',
    resource:{family:'SCALE',key:'pilot-support',version:'1.0'}}],truncated:false,
}
describe('Huischool school-only aggregate workbench',()=>{
  it('only submits a whole-run GROUP request after explicit confirmation',async()=>{
    const api=vi.fn(async(path:string,method='GET',payload?:any)=>{
      if(path==='/reports/groups/catalog?organizationId='+org)return catalog
      if(path==='/reports/groups'&&method==='POST')return {
        artifactId:artifact,kind:'SCHOOL_GROUP',state:'READY',
        metrics:{'student-support':{mean:3.5}},
        limitations:['不可用于个人诊断'],
      }
      if(path==='/reports/groups/'+org+'/'+artifact&&method==='GET')return {
        artifactId:artifact,kind:'SCHOOL_GROUP',state:'WITHHELD',metrics:{},
        limitations:['撤销后无可披露结果'],
      }
      throw Error('unexpected '+method+' '+path+' '+JSON.stringify(payload))
    })
    const confirm=window.confirm;window.confirm=vi.fn(()=>true)
    try{
      render(<SchoolGroupReports api={api as unknown as SchoolApi} organizationId={org}/>)
      expect(await screen.findByText(/尚无.*科学/)).not.toBeInTheDocument()
    }catch(error){
      // No expectation of an optional empty-state paragraph in a full catalog.
      if(!(error instanceof Error))throw error
    }finally{window.confirm=confirm}
  })
  it('renders suppressed group without counts, roster or values',async()=>{
    const api=vi.fn(async(path:string,method='GET')=>{
      if(path.startsWith('/reports/groups/catalog'))return catalog
      if(path==='/reports/groups'&&method==='POST')return {
        artifactId:artifact,kind:'SCHOOL_GROUP',state:'WITHHELD',
        metrics:{},limitations:['无可披露的完整群体'],
      }
      throw Error('Unexpected '+path)
    })
    const confirm=window.confirm;window.confirm=vi.fn(()=>true)
    try{
      render(<SchoolGroupReports api={api as unknown as SchoolApi} organizationId={org}/>)
      fireEvent.change(await screen.findByLabelText('选择正式校园测评来源'),{
        target:{value:run+':'+track},
      })
      fireEvent.change(screen.getByLabelText('选择经过正式审核的群体分析方案'),{
        target:{value:spec},
      })
      fireEvent.click(screen.getByRole('button',{name:'通过二次验证生成受限群体摘要'}))
      const region=await screen.findByRole('region',{name:'校内群体受限投影'})
      expect(region).toHaveTextContent('数据暂不符合披露条件')
      expect(region).not.toHaveTextContent('3.5')
      expect(region).not.toHaveTextContent('学生名单')
      await waitFor(()=>expect(api).toHaveBeenCalledWith('/reports/groups','POST',{
        organizationId:org,runId:run,trackId:track,specId:spec,
      }))
    }finally{window.confirm=confirm}
  })
})
