import {fireEvent,render,screen,within} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {SchoolActivityManager} from './SchoolActivityManager'
import type {SchoolApi} from './SchoolRecovery'

const org='00000000-0000-4000-8000-000000000001'
const course='00000000-0000-4000-8000-000000000002'
const runId='00000000-0000-4000-8000-000000000003'
const base=`/organizations/${org}/activities`

describe('School configured tool outline',()=>{
  it('reads the real run/track DTO without requiring catalogue access or editing the run',async()=>{
    const activity={courseId:course,organizationId:org,title:'活动',purpose:'SCHOOL_CLIMATE',
      status:'OPEN',version:2,participantCount:0,runCount:1,
      runs:[{runId,name:'批次',status:'DRAFT'}]}
    const api=vi.fn(async(path:string)=>{
      if(path===base+'?page=1&pageSize=50')return {list:[activity]}
      if(path===base+'/'+course)return activity
      if(path===base+'/'+course+'/runs/'+runId)return {
        run:{id:runId,name:'批次',status:'DRAFT',version:3},
        tracks:[{id:'track-1',resourceFamily:'FORM',resourceKey:'private-form:fixed-source',resourceVersion:'fixed-hash'}],
        frozenPopulation:{actors:[],relationships:[]},executionCounts:[],
      }
      throw new Error('Unexpected request '+path)
    })
    render(<SchoolActivityManager api={api as unknown as SchoolApi} organizationId={org} isAdmin={false} classes={[]}/>)
    fireEvent.change(await screen.findByLabelText('选择已有活动'),{target:{value:course}})
    fireEvent.click(await screen.findByRole('button',{name:/批次 ·/}))
    const outline=await screen.findByRole('region',{name:'已选工具大纲'})
    expect(within(outline).getByText('private-form:fixed-source')).toBeInTheDocument()
    expect(within(outline).getByText('FORM · 固定版本：fixed-hash')).toBeInTheDocument()
    expect(within(outline).queryByRole('button')).not.toBeInTheDocument()
    expect(api.mock.calls.every(call=>!call[0].includes('run-resources'))).toBe(true)
  })
})


it('uses neutral names only when compact catalogue titles are unavailable, retaining exact identities under technical details',async()=>{
 const activity={courseId:course,organizationId:org,title:'活动',purpose:'SCHOOL_CLIMATE',status:'OPEN',version:2,participantCount:0,runCount:1,runs:[{runId,name:'批次',status:'PUBLISHED'}]}
 const api=vi.fn(async(path:string)=>{
  if(path===base+'?page=1&pageSize=50')return {list:[activity]}
  if(path===base+'/'+course)return activity
  if(path===base+'/'+course+'/runs/'+runId)return {run:{id:runId,name:'批次',status:'PUBLISHED',version:3},tracks:[{id:'a',resourceFamily:'FORM',resourceKey:'private-form:exact-source',resourceVersion:'fixed-v1'},{id:'b',resourceFamily:'SCALE',resourceKey:'library-scale:exact-source',resourceVersion:'fixed-v2'}]}
  throw Error('Unexpected '+path)
 })
 render(<SchoolActivityManager compact api={api as unknown as SchoolApi} organizationId={org} isAdmin={false} classes={[]}/>)
 fireEvent.click(await screen.findByRole('button',{name:'配置活动：活动'}))
 await screen.findByRole('heading',{name:'活动'})
 fireEvent.click(screen.getByRole('button',{name:'正式测评批次'}))
 fireEvent.click(screen.getByRole('button',{name:'批次 · 已发布'}))
 const outline=await screen.findByRole('region',{name:'已配置测评项目'})
 expect(within(outline).getByText('表单 1')).toBeInTheDocument()
 expect(within(outline).getByText('量表 2')).toBeInTheDocument()
 expect(within(outline).getByText('表单 · 固定版本：fixed-v1')).toBeInTheDocument()
 expect(within(outline).getByText('量表 · 固定版本：fixed-v2')).toBeInTheDocument()
 expect(within(outline).queryByText(/private-form:|library-scale:/)).not.toBeInTheDocument()
 expect(screen.getByText(/FORM · private-form:exact-source/)).not.toBeVisible()
 fireEvent.click(screen.getByText('技术详情',{exact:true}))
 expect(screen.getByText(/FORM · private-form:exact-source/)).toBeVisible()
 expect(api.mock.calls.every(call=>call.length===1&&!call[0].includes('run-resources'))).toBe(true)
})
