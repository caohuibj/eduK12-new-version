import {it,expect,vi} from 'vitest'
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {SchoolActivityManager} from './SchoolActivityManager'
import type {SchoolApi} from './SchoolRecovery'
const a={courseId:'a',organizationId:'org',title:'Alpha 校园',purpose:'SCHOOL_CLIMATE',status:'DRAFT',participantCount:2,runCount:1,version:1,runs:[]}
const b={...a,courseId:'b',title:'Beta 家校',purpose:'FAMILY_SUPPORT',status:'OPEN',participantCount:8,runCount:3}
const base='/organizations/org/activities'

it('searches normalized text, sorts loaded activities and switches views without new reads or writes',async()=>{
 const api=vi.fn(async(path:string)=>path.endsWith('pageSize=50')?{list:[b,a],hasMore:false}:path.endsWith('/eligible-classes')?{list:[]}:a)
 const view=render(<SchoolActivityManager compact api={api as unknown as SchoolApi} organizationId="org" isAdmin classes={[]}/>)
 await screen.findByRole('button',{name:'配置活动：Alpha 校园'})
 expect(screen.queryByRole('search')).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('排序'),{target:{value:'title'}})
 expect(screen.getAllByRole('listitem').map(item=>within(item).getByRole('heading').textContent)).toEqual(['Alpha 校园','Beta 家校'])
 fireEvent.change(screen.getByLabelText('排序'),{target:{value:'participants'}})
 expect(within(screen.getAllByRole('listitem')[0]).getByRole('heading')).toHaveTextContent('Beta 家校')
 fireEvent.click(screen.getByRole('button',{name:'卡片视图'}))
 expect(view.container.querySelector('.hs-activity-catalog-list--cards')).not.toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'检索活动'}))
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'ＡＬＰＨＡ'}})
 fireEvent.submit(screen.getByRole('search'))
 expect(screen.getAllByRole('listitem')).toHaveLength(1)
 expect(screen.getByRole('button',{name:'配置活动：Alpha 校园'})).toBeInTheDocument()
 expect(api.mock.calls).toEqual([[base+'?page=1&pageSize=50']])
 fireEvent.click(screen.getByRole('button',{name:'清空检索'}))
 expect(screen.getAllByRole('listitem')).toHaveLength(2)
 fireEvent.click(screen.getByRole('button',{name:'配置活动：Alpha 校园'}))
 await screen.findByRole('heading',{name:'Alpha 校园'})
 fireEvent.click(screen.getByRole('button',{name:'阅读／练习／打卡'}))
 fireEvent.change(screen.getByLabelText('任务名称'),{target:{value:'保留配置草稿'}})
 fireEvent.click(screen.getByRole('button',{name:'返回活动列表'}))
 expect(screen.getByLabelText('排序')).toHaveValue('participants')
 await waitFor(()=>expect(screen.getByRole('button',{name:'刷新活动列表'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'刷新活动列表'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'刷新活动列表'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'配置活动：Alpha 校园'}))
 await screen.findByRole('heading',{name:'Alpha 校园'})
 fireEvent.click(screen.getByRole('button',{name:'阅读／练习／打卡'}))
 expect(screen.getByLabelText('任务名称')).toHaveValue('保留配置草稿')
 expect(api.mock.calls.every(call=>call.length===1)).toBe(true)
})

it('retries the failed next page, deduplicates by activity identity, and keeps earlier results',async()=>{
 let attempts=0,release!:(value:unknown)=>void
 const next=new Promise(resolve=>{release=resolve})
 const api=vi.fn(async(path:string)=>{
  if(path===base+'?page=1&pageSize=50')return {list:[a],hasMore:true,page:1}
  if(path===base+'?page=2&pageSize=50'){if(++attempts===1)return next;return {list:[a,b],hasMore:false,page:2}}
  throw Error('Unexpected '+path)
 })
 render(<SchoolActivityManager compact api={api as unknown as SchoolApi} organizationId="org" isAdmin classes={[]}/>)
 await screen.findByRole('button',{name:'配置活动：Alpha 校园'})
 expect(screen.getByText(/检索和排序仅作用于已加载的 1 项/)).toBeInTheDocument()
 const more=screen.getByRole('button',{name:'加载更多活动'})
 fireEvent.click(more);fireEvent.click(more)
 expect(api.mock.calls.filter(([path])=>path.includes('page=2'))).toHaveLength(1)
 await act(async()=>release(Promise.reject(Error('下一页暂不可用'))))
 expect(await screen.findByRole('alert')).toHaveTextContent('下一页暂不可用')
 expect(screen.getByRole('button',{name:'配置活动：Alpha 校园'})).toBeInTheDocument()
 fireEvent.click(more)
 await screen.findByRole('button',{name:'配置活动：Beta 家校'})
 expect(screen.getAllByRole('listitem')).toHaveLength(2)
 expect(screen.queryByRole('button',{name:'加载更多活动'})).not.toBeInTheDocument()
 expect(api.mock.calls).toEqual([[base+'?page=1&pageSize=50'],[base+'?page=2&pageSize=50'],[base+'?page=2&pageSize=50']])
})

it('ignores a late page after the school changes and resets the collection controls',async()=>{
 let release!:(value:unknown)=>void
 const next=new Promise(resolve=>{release=resolve})
 const api=vi.fn(async(path:string)=>path===base+'?page=1&pageSize=50'?{list:[a],hasMore:true}:path===base+'?page=2&pageSize=50'?next:{list:[{...b,organizationId:'other'}],hasMore:false})
 const view=render(<SchoolActivityManager compact api={api as unknown as SchoolApi} organizationId="org" isAdmin classes={[]}/>)
 await screen.findByRole('button',{name:'配置活动：Alpha 校园'})
 fireEvent.click(screen.getByRole('button',{name:'加载更多活动'}))
 view.rerender(<SchoolActivityManager compact api={api as unknown as SchoolApi} organizationId="other" isAdmin classes={[]}/>)
 await screen.findByRole('button',{name:'配置活动：Beta 家校'})
 await act(async()=>release({list:[a],hasMore:true}))
 expect(screen.queryByRole('button',{name:'配置活动：Alpha 校园'})).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'加载更多活动'})).not.toBeInTheDocument()
 expect(screen.getByLabelText('排序')).toHaveValue('default')
})

it('shows a read failure instead of a confirmed empty list and retries only the index',async()=>{
 let attempts=0
 const api=vi.fn(async()=>{if(++attempts===1)throw Error('目录暂不可用');return {list:[],hasMore:false}})
 render(<SchoolActivityManager compact api={api as unknown as SchoolApi} organizationId="org" isAdmin classes={[]}/>)
 expect(await screen.findByRole('alert')).toHaveTextContent('目录暂不可用')
 expect(screen.queryByText('目前没有可管理的活动。')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'刷新活动列表'}))
 expect(await screen.findByText('目前没有可管理的活动。')).toBeInTheDocument()
 expect(api).toHaveBeenCalledTimes(2)
})
