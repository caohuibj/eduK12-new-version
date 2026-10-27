import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {SchoolActivityManager} from './SchoolActivityManager'
import type {SchoolApi} from './SchoolRecovery'
const base='/organizations/org/activities'
const draft={courseId:'activity',organizationId:'org',title:'多班活动',status:'DRAFT',purpose:'SCHOOL_CLIMATE',version:3,participantCount:0,runCount:0,runs:[]}
const classes=[{id:'class-a',name:'一年级一班'},{id:'class-b',name:'一年级二班'}]
const open=async()=>{fireEvent.click(await screen.findByRole('button',{name:'配置活动：多班活动'}));await screen.findByRole('checkbox',{name:'一年级一班'})}
afterEach(()=>{cleanup();vi.restoreAllMocks()})
it('submits selected eligible classes together exactly once, and locks selection while the request is pending',async()=>{
 let complete!:(value:{selected:number})=>void
 const request=new Promise<{selected:number}>(resolve=>{complete=resolve})
 const api=vi.fn(async(path:string,method?:string)=>{
  if(method==='POST')return request
  if(path.endsWith('pageSize=50'))return {list:[draft]}
  if(path.endsWith('eligible-classes'))return {list:classes}
  return draft
 })
 render(<SchoolActivityManager compact api={api as SchoolApi} organizationId="org" isAdmin={false} classes={[{id:'outside',name:'无权分配的管理班级',unitKind:'CLASS'}]}/> )
 await open();expect(screen.queryByRole('checkbox',{name:'无权分配的管理班级'})).not.toBeInTheDocument()
 const add=screen.getByRole('button',{name:'加入所选班级学生'})
 expect(add).toBeDisabled()
 fireEvent.click(screen.getByRole('checkbox',{name:'一年级一班'}));fireEvent.click(screen.getByRole('checkbox',{name:'一年级二班'}))
 expect(screen.getByText('已选 2 / 40 个班级')).toBeInTheDocument()
 fireEvent.click(add);fireEvent.click(add)
 expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
 expect(api).toHaveBeenCalledWith(base+'/activity/participants','POST',{classUnitIds:['class-a','class-b'],expectedVersion:3,requestKey:expect.stringMatching(/^school-/)})
 expect(screen.getByRole('checkbox',{name:'一年级一班'})).toBeDisabled()
 await act(async()=>complete({selected:45}))
 await screen.findByText('已按所选 2 个班级分配 45 名学生。')
 expect(await screen.findByRole('checkbox',{name:'一年级一班'})).not.toBeChecked()
 expect(screen.getByRole('button',{name:'加入所选班级学生'})).toBeDisabled()
})
it('caps one allocation at forty, allows clearing, and never writes when checking or unchecking',async()=>{
 const many=Array.from({length:41},(_,i)=>({id:'class-'+i,name:'班级'+(i+1)}))
 const api=vi.fn(async(path:string)=>path.endsWith('pageSize=50')?{list:[draft]}:path.endsWith('eligible-classes')?{list:many}:draft)
 render(<SchoolActivityManager compact api={api as SchoolApi} organizationId="org" isAdmin classes={[]}/> )
 fireEvent.click(await screen.findByRole('button',{name:'配置活动：多班活动'}));await screen.findByRole('checkbox',{name:'班级1'})
 for(let i=1;i<=40;i++)fireEvent.click(screen.getByRole('checkbox',{name:'班级'+i}))
 expect(screen.getByRole('checkbox',{name:'班级41'})).toBeDisabled()
 expect(screen.getByText('已选 40 / 40 个班级')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('checkbox',{name:'班级1'}))
 expect(screen.getByRole('checkbox',{name:'班级41'})).toBeEnabled()
 fireEvent.click(screen.getByRole('button',{name:'清空选择'}))
 expect(screen.getByText('已选 0 / 40 个班级')).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'加入所选班级学生'})).toBeDisabled()
 expect(api.mock.calls.every(call=>call.length===1)).toBe(true)
})
it('preserves selection on allocation failure, then clears it when changing activity and school',async()=>{
 const other={...draft,courseId:'other',title:'另一活动'}
 const api=vi.fn(async(path:string,method?:string)=>{
  if(method==='POST')throw Error('分配暂未完成')
  if(path.startsWith('/organizations/new/'))return {list:[]}
  if(path.endsWith('pageSize=50'))return {list:[draft,other]}
  if(path.endsWith('/other'))return other
  if(path.endsWith('eligible-classes'))return {list:classes}
  return draft
 })
 const view=render(<SchoolActivityManager compact api={api as SchoolApi} organizationId="org" actorKey="author" isAdmin={false} classes={[]}/> )
 await open();fireEvent.click(screen.getByRole('checkbox',{name:'一年级一班'}));fireEvent.click(screen.getByRole('checkbox',{name:'一年级二班'}))
 fireEvent.click(screen.getByRole('button',{name:'加入所选班级学生'}));await screen.findByText('分配暂未完成')
 expect(screen.getByRole('checkbox',{name:'一年级二班'})).toBeChecked()
 fireEvent.click(screen.getByRole('button',{name:'返回活动列表'}));await waitFor(()=>expect(screen.getByRole('button',{name:'配置活动：另一活动'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'配置活动：另一活动'}))
 await screen.findByRole('checkbox',{name:'一年级一班'})
 expect(screen.getByText('已选 0 / 40 个班级')).toBeInTheDocument()
 expect(screen.getByRole('checkbox',{name:'一年级一班'})).not.toBeChecked()
 fireEvent.click(screen.getByRole('checkbox',{name:'一年级一班'}))
 view.rerender(<SchoolActivityManager compact api={api as SchoolApi} organizationId="new" actorKey="other-author" isAdmin={false} classes={[]}/> )
 await waitFor(()=>expect(screen.queryByRole('checkbox',{name:'一年级一班'})).not.toBeInTheDocument())
 expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
})
