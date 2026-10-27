import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SchoolStudentTasks } from './SchoolStudentTasks'
import type { SchoolApi } from './SchoolRecovery'
const capture=vi.hoisted(()=>({finished:null as null|(()=>void)}))
vi.mock('./SchoolCompositeRunner',()=>({SchoolCompositeRunner:(props:{onParentCompleted:()=>void;onExit:()=>void})=>{
  capture.finished=props.onParentCompleted
  return <button onClick={props.onExit}>退出合成测评宿主</button>
}}))
const id='00000000-0000-4000-8000-000000000042'
const page=(family='SCALE')=>({list:[{id,activityId:'activity',activityTitle:'校园活动',kind:'MEASUREMENT',resourceFamily:family,title:'正式本人测评',status:'PENDING',deadline:null,
  href:`/organizations/org/activities/activity/runs/run/executions/${id}`}],total:1,page:1,hasMore:false,truncated:false})
describe('School authoritative completion feedback consumer (synthetic transport)',()=>{
  it('opens feedback once independently of a slow or failed list refresh',async()=>{
    let lists=0,rejectList!:(error:Error)=>void
    const refresh=new Promise((_,reject)=>{rejectList=reject})
    const api=vi.fn(async(path:string)=>{
      if(path==='/my/student-reference')return {reference:'SYNTHETIC'}
      if(path.startsWith('/my/activity-tasks'))return ++lists===1?page():refresh
      if(path==='/reports/student/executions/'+id)return {state:'WITHHELD'}
      throw Error('Unexpected request '+path)
    })
    render(<SchoolStudentTasks api={api as unknown as SchoolApi}/>)
    fireEvent.click(await screen.findByRole('button',{name:'开始／继续官方测评'}))
    await screen.findByRole('button',{name:'退出合成测评宿主'})
    const done=capture.finished!
    act(()=>{done();done()})
    expect(await screen.findByRole('region',{name:'获准的个人测评反馈'})).toHaveTextContent('正式提交已确认')
    await waitFor(()=>expect(api.mock.calls.filter(([path])=>path.startsWith('/reports/'))).toHaveLength(1))
    await act(async()=>{rejectList(Error('列表暂不可用'));await refresh.catch(()=>{})})
    expect(screen.getByRole('region',{name:'获准的个人测评反馈'})).toBeInTheDocument()
    expect(api.mock.calls.some(call=>call.length>1)).toBe(false)
  })
  it('preserves FORM completion without requesting personal psychological feedback',async()=>{
    const api=vi.fn(async(path:string)=>path==='/my/student-reference'?{reference:'SYNTHETIC'}:page('FORM'))
    render(<SchoolStudentTasks api={api as unknown as SchoolApi}/>)
    fireEvent.click(await screen.findByRole('button',{name:'开始／继续官方测评'}))
    await screen.findByRole('button',{name:'退出合成测评宿主'})
    act(()=>capture.finished!())
    await screen.findByText('本次测评已完成，正式提交已确认。')
    expect(screen.queryByRole('region',{name:'获准的个人测评反馈'})).not.toBeInTheDocument()
    expect(api.mock.calls.filter(([path])=>path.startsWith('/reports/'))).toHaveLength(0)
  })
})

it('remounts a newly selected task and prevents the previous completion callback from opening feedback',async()=>{
 const secondId='00000000-0000-4000-8000-000000000043'
 const api=vi.fn(async(path:string)=>{
  if(path==='/my/student-reference')return {reference:'SYNTHETIC'}
  const first=page();return {...first,total:2,list:[first.list[0],{...first.list[0],id:secondId,title:'另一正式测评',href:first.list[0].href.replace(id,secondId)}]}
 })
 render(<SchoolStudentTasks api={api as unknown as SchoolApi}/>)
 const buttons=await screen.findAllByRole('button',{name:'开始／继续官方测评'})
 fireEvent.click(buttons[0]);await screen.findByRole('button',{name:'退出合成测评宿主'})
 const stale=capture.finished!
 fireEvent.click(buttons[1]);await screen.findByRole('button',{name:'退出合成测评宿主'})
 act(()=>stale())
 expect(screen.queryByRole('region',{name:'获准的个人测评反馈'})).not.toBeInTheDocument()
 expect(api.mock.calls.filter(([path])=>path.startsWith('/reports/'))).toHaveLength(0)
})

it('keeps the active task feedback identity when a background list changes its page contents',async()=>{
 let lists=0
 const api=vi.fn(async(path:string)=>{
  if(path==='/my/student-reference')return {reference:'SYNTHETIC'}
  if(path.startsWith('/my/activity-tasks'))return ++lists===1?page():{list:[],total:0,page:1,hasMore:false,truncated:false}
  if(path==='/reports/student/executions/'+id)return {state:'COMPLETED'}
  throw Error('Unexpected request '+path)
 })
 render(<SchoolStudentTasks api={api as unknown as SchoolApi}/>)
 fireEvent.click(await screen.findByRole('button',{name:'开始／继续官方测评'}))
 await screen.findByRole('button',{name:'退出合成测评宿主'})
 fireEvent.click(screen.getByRole('button',{name:'刷新待办'}))
 await waitFor(()=>expect(screen.getByText('0 项任务')).toBeInTheDocument())
 act(()=>capture.finished!())
 expect(await screen.findByRole('region',{name:'获准的个人测评反馈'})).toHaveTextContent('正式本人测评')
 expect(api).toHaveBeenCalledWith('/reports/student/executions/'+id)
})
