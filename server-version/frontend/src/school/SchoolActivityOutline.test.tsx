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
