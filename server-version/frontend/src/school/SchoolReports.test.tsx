import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SchoolParentReports, SchoolStudentReportConsent, SchoolStudentFeedback, SchoolDisclosureOfficers } from './SchoolReports'
import type { SchoolApi } from './SchoolRecovery'

const CHILD_A='00000000-0000-4000-8000-000000000001'
const CHILD_B='00000000-0000-4000-8000-000000000002'
const ARTIFACT='00000000-0000-4000-8000-000000000003'

describe('Huischool report privacy and lifecycle UI', () => {
  it('never displays a report solely from an ACTIVE relationship',async()=>{
    const api=vi.fn(async(path:string)=>{
      if(path==='/reports/parent/children')return {list:[{childId:CHILD_A,relationshipId:'link-a'}],hasMore:false}
      if(path.includes('/reports/parent/children/'+CHILD_A+'/reports'))return {list:[],hasMore:false}
      throw new Error('unexpected call '+path)
    })
    render(<SchoolParentReports api={api as SchoolApi}/>)
    const child=await screen.findByRole('button',{name:'孩子 1 的获准反馈'})
    expect(screen.queryByText('私密个人分数')).not.toBeInTheDocument()
    fireEvent.click(child)
    expect(await screen.findByText('该孩子目前没有完成全部单份授权步骤的家长报告。')).toBeInTheDocument()
    expect(api.mock.calls.every(([path])=>path.startsWith('/reports/parent/'))).toBe(true)
  })
  it('clears a previous child report immediately when selecting another child',async()=>{
    const api=vi.fn(async(path:string)=>{
      if(path==='/reports/parent/children')return {list:[
        {childId:CHILD_A,relationshipId:'link-a'}, {childId:CHILD_B,relationshipId:'link-b'},
      ]}
      if(path==='/reports/parent/children/'+CHILD_A+'/reports')return {list:[{id:ARTIFACT,title:'孩子甲的反馈',mode:'EDUCATIONAL_SUMMARY'}]}
      if(path==='/reports/parent/children/'+CHILD_B+'/reports')return {list:[]}
      if(path==='/reports/parent/children/'+CHILD_A+'/reports/'+ARTIFACT)return {
        audience:'PARENT',title:'孩子甲的反馈',mode:'EDUCATIONAL_SUMMARY',summary:'仅用于受控查看的内容',blocks:[],
      }
      throw Error('unexpected call '+path)
    })
    render(<SchoolParentReports api={api as SchoolApi}/>)
    fireEvent.click(await screen.findByRole('button',{name:'孩子 1 的获准反馈'}))
    fireEvent.click(await screen.findByRole('button',{name:'查看已授权反馈'}))
    expect(await screen.findByText('仅用于受控查看的内容')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'孩子 2 的获准反馈'}))
    expect(screen.queryByText('仅用于受控查看的内容')).not.toBeInTheDocument()
    expect(await screen.findByText('该孩子目前没有完成全部单份授权步骤的家长报告。')).toBeInTheDocument()
  })
  it('discards a delayed former child response after switching to another child',async()=>{
    let finishOld:((value:any)=>void)|undefined
    const oldReport=new Promise(resolve=>{finishOld=resolve})
    const api=vi.fn(async(path:string)=>{
      if(path==='/reports/parent/children')return {list:[
        {childId:CHILD_A,relationshipId:'link-a'},{childId:CHILD_B,relationshipId:'link-b'},
      ]}
      if(path==='/reports/parent/children/'+CHILD_A+'/reports')return {
        list:[{id:ARTIFACT,title:'旧孩子报告入口',mode:'EDUCATIONAL_SUMMARY'}],
      }
      if(path==='/reports/parent/children/'+CHILD_A+'/reports/'+ARTIFACT)return oldReport
      if(path==='/reports/parent/children/'+CHILD_B+'/reports')return {list:[]}
      throw Error('unexpected path '+path)
    })
    render(<SchoolParentReports api={api as SchoolApi}/>)
    fireEvent.click(await screen.findByRole('button',{name:'孩子 1 的获准反馈'}))
    fireEvent.click(await screen.findByRole('button',{name:'查看已授权反馈'}))
    // Child selector remains usable while the first child's detail is pending.
    fireEvent.click(screen.getByRole('button',{name:'孩子 2 的获准反馈'}))
    expect(await screen.findByText('该孩子目前没有完成全部单份授权步骤的家长报告。')).toBeInTheDocument()
    finishOld?.({audience:'PARENT',title:'旧报告',mode:'EDUCATIONAL_SUMMARY',summary:'不得重现的旧私密内容',blocks:[]})
    await waitFor(()=>expect(screen.queryByText('不得重现的旧私密内容')).not.toBeInTheDocument())
    expect(screen.queryByText('旧报告')).not.toBeInTheDocument()
  })
  it('students cannot share a report merely because the parent link is active',async()=>{
    const api=vi.fn(async(path:string)=>{
      if(path==='/parent-links')return {list:[{id:'link-1',status:'ACTIVE'}]}
      if(path==='/reports/relationships/link-1/options')return {list:[],truncated:false}
      throw Error('unexpected call '+path)
    })
    render(<SchoolStudentReportConsent api={api as SchoolApi}/>)
    const button=await screen.findByRole('button',{name:'查看第 1 位已关联家长的可分享报告'})
    fireEvent.click(button)
    expect(await screen.findByText('目前没有经过审核且允许分享的家长版报告。')).toBeInTheDocument()
    expect(api.mock.calls.every(([path])=>path==='/parent-links'||path.startsWith('/reports/relationships/'))).toBe(true)
  })
  it('does not invent scientific explanations for an unpublished longitudinal feedback',async()=>{
    const api=vi.fn(async()=>({list:[],truncated:false}))
    render(<SchoolStudentFeedback api={api as SchoolApi}/>)
    expect(await screen.findByText(/目前没有已生成且适合向你展示的纵向反馈/)).toBeInTheDocument()
    expect(screen.queryByText(/诊断结果：/)).not.toBeInTheDocument()
  })
  it('cannot grant parent disclosure to a person without psychology capability',async()=>{
    const api=vi.fn(async()=>({list:[{membershipId:'one',displayName:'校园心理老师',hasPsychology:false,hasDisclosure:false}]}))
    render(<SchoolDisclosureOfficers api={api as SchoolApi} organizationId={CHILD_A}/>)
    expect(await screen.findByRole('button',{name:'授予专项披露能力'})).toBeDisabled()
    expect(api).toHaveBeenCalledTimes(1)
  })
  it('admin issues only an explicit PARENT_REPORT_DISCLOSURE grant',async()=>{
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
    const api=vi.fn(async(path:string,method='GET',payload?:unknown)=>{
      if(method==='POST') {
        expect(path).toBe('/organizations/'+CHILD_A+'/memberships/staff-one/capabilities')
        expect(payload).toEqual({capability:'PARENT_REPORT_DISCLOSURE'})
        return {}
      }
      return {list:[{membershipId:'staff-one',displayName:'学校心理教师',hasPsychology:true,hasDisclosure:false}]}
    })
    render(<SchoolDisclosureOfficers api={api as SchoolApi} organizationId={CHILD_A}/>)
    fireEvent.click(await screen.findByRole('button',{name:'授予专项披露能力'}))
    await waitFor(()=>expect(api).toHaveBeenCalledWith(expect.stringContaining('/memberships/staff-one/capabilities'),'POST',{capability:'PARENT_REPORT_DISCLOSURE'}))
    confirm.mockRestore()
  })

})
