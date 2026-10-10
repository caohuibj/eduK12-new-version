import { describe,expect,it,vi } from 'vitest'
import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { SchoolIndividualLongitudinalStudio } from './SchoolIndividualLongitudinalStudio'
import type { SchoolApi } from './SchoolRecovery'

const org='00000000-0000-4000-8000-000000000001'
const spec='00000000-0000-4000-8000-000000000002'
const r1='00000000-0000-4000-8000-000000000003'
const r2='00000000-0000-4000-8000-000000000004'
const t1='00000000-0000-4000-8000-000000000005'
const t2='00000000-0000-4000-8000-000000000006'
const alias='林-ABCDEF123456'
const catalog={subjects:[{reference:alias}],specs:[{
  specId:spec,title:'合法的纵向科学方案',version:1,
}],truncated:false}
const resource={family:'SCALE',key:'wellbeing',version:'1.0.0'}
const sources={sources:[
  {runId:r1,trackId:t1,runName:'前测',publishedAt:'2026-02-10T00:00:00Z',resource},
  {runId:r2,trackId:t2,runName:'后测',publishedAt:'2026-03-10T00:00:00Z',resource},
],truncated:false}

describe('Huischool longitudinal professional workspace',()=>{
  it('selects two scientific sources and sends a pseudonym with no internal student identifiers',async()=>{
    const api=vi.fn(async(path:string,method='GET')=>{
      if(path.startsWith('/reports/longitudinal/catalog'))return catalog
      if(path.startsWith('/reports/longitudinal/sources'))return sources
      if(path==='/reports/longitudinal'&&method==='POST')return {
        artifactId:'historical-report',subjectReference:alias,status:'AVAILABLE',
        note:'仅在授权专业工作台阅读',
      }
      throw Error('unexpected '+method+' '+path)
    })
    const original=window.confirm;window.confirm=vi.fn(()=>true)
    try{
      render(<SchoolIndividualLongitudinalStudio api={api as unknown as SchoolApi}
        organizationId={org}/>)
      fireEvent.change(await screen.findByLabelText('当前心理服务学生的匿名观察编号'),
        {target:{value:alias}})
      const boxes=await screen.findAllByRole('checkbox')
      expect(boxes.length).toBe(2)
      boxes.forEach(x=>fireEvent.click(x))
      fireEvent.change(screen.getByLabelText('经独立审核的个人纵向方案'),
        {target:{value:spec}})
      fireEvent.click(screen.getByRole('button',{
        name:'经近期动态验证码核验后生成专业纵向分析',
      }))
      const result=await screen.findByRole('region',{name:'个人纵向生成结果'})
      expect(result).toHaveTextContent(alias)
      expect(result).not.toHaveTextContent('secret_metric')
      await waitFor(()=>expect(api).toHaveBeenCalledWith('/reports/longitudinal','POST',{
        organizationId:org,subjectReference:alias,specId:spec,
        sources:[{runId:r1,trackId:t1},{runId:r2,trackId:t2}],
      }))
      expect(JSON.stringify(api.mock.calls)).not.toMatch(/userId|username|studentNumber|rawAnswers/)
    }finally{window.confirm=original}
  })
  it('does not carry an earlier subject selection into a changed school or patient',async()=>{
    const api=vi.fn(async(path:string)=>{
      if(path.startsWith('/reports/longitudinal/catalog'))return catalog
      if(path.startsWith('/reports/longitudinal/sources'))return sources
      throw Error('unexpected '+path)
    })
    const view=render(<SchoolIndividualLongitudinalStudio
      api={api as unknown as SchoolApi} organizationId={org}/>)
    fireEvent.change(await screen.findByLabelText('当前心理服务学生的匿名观察编号'),
      {target:{value:alias}})
    expect((await screen.findAllByRole('checkbox')).length).toBe(2)
    view.rerender(<SchoolIndividualLongitudinalStudio
      api={api as unknown as SchoolApi}
      organizationId="00000000-0000-4000-8000-000000000099"/>)
    await waitFor(()=>expect(screen.queryAllByRole('checkbox')).toHaveLength(0))
    expect(screen.getByRole('button',{
      name:'经近期动态验证码核验后生成专业纵向分析',
    })).toBeDisabled()
  })
  it('cannot submit without two matching Run sources and one reviewed spec',async()=>{
    const api=vi.fn(async(path:string)=>{
      if(path.startsWith('/reports/longitudinal/catalog'))return catalog
      if(path.startsWith('/reports/longitudinal/sources'))return {
        sources:[sources.sources[0]],truncated:false,
      }
      throw Error('unexpected '+path)
    })
    render(<SchoolIndividualLongitudinalStudio api={api as unknown as SchoolApi}
      organizationId={org}/>)
    fireEvent.change(await screen.findByLabelText('当前心理服务学生的匿名观察编号'),
      {target:{value:alias}})
    fireEvent.click((await screen.findAllByRole('checkbox'))[0])
    fireEvent.change(screen.getByLabelText('经独立审核的个人纵向方案'),
      {target:{value:spec}})
    expect(screen.getByRole('button',{
      name:'经近期动态验证码核验后生成专业纵向分析',
    })).toBeDisabled()
  })
})
