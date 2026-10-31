import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import SchoolApp from './SchoolApp'
import {SchoolLearnerHome} from './SchoolLearnerHome'
import {schoolNavigation} from './school-navigation'
import type {SchoolApi} from './SchoolRecovery'
const id='00000000-0000-4000-8000-000000000001'
const task={id:'task',activityId:id,activityTitle:'本周学习',kind:'READING',title:'阅读材料',status:'PENDING',deadline:null,href:'safe'}
const data={list:[task],total:1,hasMore:false,truncated:false,page:1}
const reply=(data:unknown)=>({ok:true,json:async()=>({code:0,message:'成功',data})})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();window.history.replaceState(null,'','/')})
it('activity cards use client navigation only for ordinary primary clicks',async()=>{
 const navigate=vi.fn();render(<SchoolLearnerHome api={vi.fn(async()=>data) as SchoolApi} username="学生" items={schoolNavigation('STUDENT','APPROVED',null,false)} onNavigate={navigate}/>)
 const link=await screen.findByRole('link',{name:/本周学习/});expect(link).toHaveAttribute('href','/workspace/tasks?activityId='+id)
 expect(fireEvent.click(link)).toBe(false);expect(navigate).toHaveBeenCalledWith('tasks',id);navigate.mockClear()
 const modified=new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true});fireEvent(link,modified)
 expect(modified.defaultPrevented).toBe(false);expect(navigate).not.toHaveBeenCalled()
})
it('activity selection, all tasks and history stay in the same signed-in application',async()=>{
 window.history.replaceState(null,'','/workspace')
 vi.stubGlobal('scrollTo',vi.fn())
 const fetcher=vi.fn(async(url:string)=>{
  if(url.endsWith('/auth/me'))return reply({id:'student',username:'学生',role:'STUDENT',accountDomain:'SCHOOL',mustChangePassword:false})
  if(url.endsWith('/organizations'))return reply({list:[{id:'school',name:'学校',orgRole:'MEMBER'}]})
  if(url.endsWith('/my-status'))return reply({status:'APPROVED',organizationId:'school'})
  if(url.endsWith('/context'))return reply({access:{orgRole:'MEMBER',canGovern:false,personas:[],capabilities:[],explicitDenies:[]}})
  if(url.includes('/my/activity-tasks'))return reply(data)
  return reply({list:[],parentReportsEnabled:false,canAuthor:false,authorableToolKinds:[]})
 });vi.stubGlobal('fetch',fetcher)
 render(<SchoolApp/>);fireEvent.click(await screen.findByRole('link',{name:/已开放 本周学习/}))
 await waitFor(()=>expect(window.location.pathname).toBe('/workspace/tasks'));expect(new URLSearchParams(window.location.search).get('activityId')).toBe(id)
 await waitFor(()=>expect(fetcher.mock.calls.some(([url])=>url.includes('/my/activity-tasks')&&url.includes('activityId='+id))).toBe(true))
 const before=fetcher.mock.calls.filter(([url])=>url.endsWith('/auth/me')).length
 fireEvent.click(await screen.findByRole('link',{name:'查看全部任务'}));await waitFor(()=>expect(new URLSearchParams(window.location.search).has('activityId')).toBe(false))
 await act(async()=>{window.history.replaceState(null,'','/workspace/tasks?organizationId=school&activityId='+id);window.dispatchEvent(new PopStateEvent('popstate'))})
 await waitFor(()=>expect(screen.getByRole('link',{name:'查看全部任务'})).toBeInTheDocument())
 expect(fetcher.mock.calls.filter(([url])=>url.endsWith('/auth/me'))).toHaveLength(before)
})
