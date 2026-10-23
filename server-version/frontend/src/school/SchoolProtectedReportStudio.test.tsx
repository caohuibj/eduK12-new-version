import { describe,expect,it,vi } from 'vitest'
import { act,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { SchoolProtectedReportStudio } from './SchoolProtectedReportStudio'
import type { SchoolApi } from './SchoolRecovery'

const org='00000000-0000-4000-8000-000000000001'
const run='00000000-0000-4000-8000-000000000002'
const track='00000000-0000-4000-8000-000000000003'
const spec='00000000-0000-4000-8000-000000000004'
const pseudonym='林-123456789ABC'
const catalog={
  sources:[{runId:run,trackId:track,runName:'学校心理健康关怀',
    subjectReference:pseudonym,relationshipKind:'CLASS_TEACHER_STUDENT',
    perspective:'OBSERVER_REPORT',resource:{family:'SCALE',key:'pilot-1',version:'1.0.0'}}],
  specs:[{specId:spec,title:'受保护专业反馈',version:1}],truncated:false,
}
describe('Huischool psychological professional protected reporting workspace',()=>{
  it('only sends a pseudonymous subject reference and never renders individual results',async()=>{
    const api=vi.fn(async(path:string,method='GET',body?:unknown)=>{
      if(path.startsWith('/reports/protected/catalog?organizationId='))return catalog
      if(path==='/reports/protected'&&method==='POST')return {
        artifactId:'report-1',subjectReference:pseudonym,status:'AVAILABLE',
      }
      throw Error('Unexpected '+path+JSON.stringify(body))
    })
    const confirm=window.confirm
    window.confirm=vi.fn(()=>true)
    try{
      render(<SchoolProtectedReportStudio api={api as unknown as SchoolApi}
        organizationId={org}/>)
      const sources=await screen.findByLabelText('合法个案与观察来源')
      fireEvent.change(sources,{target:{value:'1'}})
      fireEvent.change(screen.getByLabelText('经独立审核的保护性反馈方案'),
        {target:{value:spec}})
      fireEvent.click(screen.getByRole('button',{name:'经近期动态验证码核验后生成'}))
      expect(await screen.findByRole('region',{name:'受保护报告生成结果'}))
        .toHaveTextContent('已生成满足当前权限')
      expect(screen.getByText(/请从工作台“专业报告”入口重新核验权限后查看/)).toBeInTheDocument()
      await waitFor(()=>expect(api).toHaveBeenCalledWith('/reports/protected','POST',{
        organizationId:org,runId:run,trackId:track,subjectReference:pseudonym,
        relationshipKind:'CLASS_TEACHER_STUDENT',perspective:'OBSERVER_REPORT',specId:spec,
      }))
      const serialized=JSON.stringify(api.mock.calls)
      expect(serialized).not.toMatch(/subjectUserId|student-private-login|rawAnswers|metrics/)
    }finally{window.confirm=confirm}
  })
  it('shows a safe empty state when there is no approved professional source',async()=>{
    const api=vi.fn(async()=>({sources:[],specs:[],truncated:false}))
    render(<SchoolProtectedReportStudio api={api as unknown as SchoolApi}
      organizationId={org}/>)
    expect(await screen.findByText(/当前没有本人获准负责的已完成学生观察来源/))
      .toBeInTheDocument()
    expect(screen.getByRole('button',{name:'经近期动态验证码核验后生成'}))
      .toBeDisabled()
  })
})


describe('SchoolProtectedReportStudio catalogue request recovery',()=>{
  it('replaces pending state with an error and retries only the catalogue GET',async()=>{
    let reject!:(reason:Error)=>void
    const pending=new Promise<never>((_resolve,no)=>{reject=no})
    let requests=0
    const api=vi.fn(async(_path:string,_method?:string)=>++requests===1?pending:catalog)
    render(<SchoolProtectedReportStudio api={api as SchoolApi} organizationId={org}/>)
    expect(screen.getByText('正在核查当前专业关系与已发布内容…')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'重新读取报告目录'})).not.toBeInTheDocument()
    await act(async()=>reject(Error('目录读取失败，请重试')))
    expect(await screen.findByRole('alert')).toHaveTextContent('目录读取失败，请重试')
    expect(screen.queryByText('正在核查当前专业关系与已发布内容…')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'重新读取报告目录'}))
    await screen.findByRole('option',{name:new RegExp(catalog.specs[0].title)})
    expect(screen.queryByText('目录读取失败，请重试')).not.toBeInTheDocument()
    expect(api.mock.calls).toEqual([
      ['/reports/protected/catalog?organizationId='+org],['/reports/protected/catalog?organizationId='+org],
    ])
  })
  it('does not restore a previous school catalogue from a late response',async()=>{
    let resolve!:(value:typeof catalog)=>void
    const pending=new Promise<typeof catalog>(yes=>{resolve=yes})
    const api=vi.fn(async(path:string)=>path.endsWith('organizationId='+org)?pending:{sources:[],specs:[],truncated:false})
    const view=render(<SchoolProtectedReportStudio api={api as SchoolApi} organizationId={org}/>)
    expect(screen.getByText('正在核查当前专业关系与已发布内容…')).toBeInTheDocument()
    view.rerender(<SchoolProtectedReportStudio api={api as SchoolApi} organizationId="new-school"/>)
    await waitFor(()=>expect(screen.queryByText('正在核查当前专业关系与已发布内容…')).not.toBeInTheDocument())
    await act(async()=>resolve(catalog))
    expect(screen.queryByRole('option',{name:new RegExp(catalog.specs[0].title)})).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(api).toHaveBeenLastCalledWith('/reports/protected/catalog?organizationId=new-school')
  })
})
