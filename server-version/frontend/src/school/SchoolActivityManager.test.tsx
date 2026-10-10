import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SchoolActivityManager } from './SchoolActivityManager'
import type { SchoolApi } from './SchoolRecovery'

const org='00000000-0000-4000-8000-000000000001'
const course='00000000-0000-4000-8000-000000000002'
const classUnit='00000000-0000-4000-8000-000000000003'
const activity={courseId:course,organizationId:org,title:'同伴支持',
  purpose:'SCHOOL_CLIMATE',status:'OPEN',version:2,participantCount:6,
  runCount:0,runs:[]}

describe('Huischool Activity peer allocation after reopen',()=>{
  it('allows an administrator to choose the class of an already open Activity',async()=>{
    const api=vi.fn(async(path:string,method='GET')=>{
      if(path===`/organizations/${org}/activities?page=1&pageSize=50`)
        return {list:[activity]}
      if(path===`/organizations/${org}/activities/${course}`&&method==='GET')
        return activity
      if(path===`/organizations/${org}/activities/${course}/peer-allocations`&&method==='POST')
        return {cohortSize:6,assignments:6}
      throw Error('Unexpected campus API '+method+' '+path)
    })
    const originalConfirm=window.confirm
    window.confirm=vi.fn(()=>true)
    try{
      render(<SchoolActivityManager api={api as unknown as SchoolApi}
        organizationId={org} isAdmin classes={[{id:classUnit,name:'五年级一班',unitKind:'CLASS'}]}/>)
      fireEvent.change(await screen.findByLabelText('选择已有活动'),{target:{value:course}})
      expect(await screen.findByText(/状态：已开放/)).toBeInTheDocument()
      const select=screen.getByLabelText('本次互评分配班级')
      fireEvent.change(select,{target:{value:classUnit}})
      fireEvent.click(screen.getByRole('button',{name:'按同意记录随机生成非自评配对'}))
      await waitFor(()=>expect(api).toHaveBeenCalledWith(
        `/organizations/${org}/activities/${course}/peer-allocations`,'POST',
        {classUnitId:classUnit,peersPerRespondent:1},
      ))
    }finally{window.confirm=originalConfirm}
  })
})
