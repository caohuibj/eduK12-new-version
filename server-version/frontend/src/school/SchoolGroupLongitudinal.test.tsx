import { describe,expect,it,vi } from 'vitest'
import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { SchoolGroupLongitudinal } from './SchoolGroupLongitudinal'
import type { SchoolApi } from './SchoolRecovery'

const org='00000000-0000-4000-8000-000000000001'
const spec='00000000-0000-4000-8000-000000000002'
const r1='00000000-0000-4000-8000-000000000003'
const r2='00000000-0000-4000-8000-000000000004'
const t1='00000000-0000-4000-8000-000000000005'
const t2='00000000-0000-4000-8000-000000000006'
const catalog={sources:[
  {runId:r1,trackId:t1,runName:'前测',resource:{family:'SCALE',key:'pilot',version:'1.0'}},
  {runId:r2,trackId:t2,runName:'后测',resource:{family:'SCALE',key:'pilot',version:'1.0'}},
],specs:[{specId:spec,title:'已发布方案',version:1,analysisKind:'REPEATED_COHORT'}],
truncated:false}
describe('Huischool internal fixed-population group trends',()=>{
  it('does not expose cohort/member selectors; posts only exact whole Run identifiers',async()=>{
    const api=vi.fn(async(path:string,method='GET')=>{
      if(path.startsWith('/reports/groups/longitudinal/catalog'))return catalog
      if(path==='/reports/groups/longitudinal'&&method==='POST')return {
        artifactId:'result-1',kind:'SCHOOL_LONGITUDINAL',state:'READY',
        metrics:{class_climate:[{wave:1,mean:3.4},{wave:2,mean:3.7}]},
        limitations:['仅用于支持性研究'],
      }
      throw Error('unrecognized '+path)
    })
    const original=window.confirm;window.confirm=vi.fn(()=>true)
    try{
      render(<SchoolGroupLongitudinal api={api as unknown as SchoolApi}
        organizationId={org}/>)
      const checkboxes=await screen.findAllByRole('checkbox')
      checkboxes.forEach(x=>fireEvent.click(x))
      fireEvent.change(screen.getByLabelText('纵向分析科学方案'),{target:{value:spec}})
      fireEvent.click(screen.getByRole('button',{name:'经近期动态验证码核对后生成固定群体分析'}))
      const panel=await screen.findByRole('region',{name:'固定群体纵向投影'})
      expect(panel).toHaveTextContent('3.4')
      expect(panel).toHaveTextContent('3.7')
      expect(panel).not.toHaveTextContent('学生人数')
      await waitFor(()=>expect(api).toHaveBeenCalledWith('/reports/groups/longitudinal','POST',{
        organizationId:org,specId:spec,analysisKind:'REPEATED_COHORT',
        sources:[{runId:r1,trackId:t1},{runId:r2,trackId:t2}],
      }))
      expect(JSON.stringify(api.mock.calls)).not.toMatch(/memberIds|cohortSelector|username|rawAnswers/)
    }finally{window.confirm=original}
  })
  it('does not make one or mixed-tool measurement appear comparable',async()=>{
    const api=vi.fn(async()=>({
      ...catalog,sources:[
        catalog.sources[0],
        {...catalog.sources[1],resource:{family:'SCALE',key:'different',version:'1.0'}},
      ],
    }))
    render(<SchoolGroupLongitudinal api={api as unknown as SchoolApi}
      organizationId={org}/>)
    (await screen.findAllByRole('checkbox')).forEach(x=>fireEvent.click(x))
    fireEvent.change(screen.getByLabelText('纵向分析科学方案'),{target:{value:spec}})
    expect(screen.getByRole('button',{
      name:'经近期动态验证码核对后生成固定群体分析',
    })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('所选测量工具不一致')
  })
})
