import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {EducationPrivateToolStudio} from '../components/education-tools/EducationPrivateToolStudio'
import {emptyDefinition} from '../pages/scaleDefinitionEditorModel'
import type {PrivateTool,PrivateToolApi} from '../components/education-tools/privateToolClient'
const base='/organizations/org/private-tools'
const one:PrivateTool={id:'one',kind:'SCALE',title:'Alpha 量表',revision:1,contentHash:'hash-one',updatedAt:'2026-10-25T00:00:00Z',definition:emptyDefinition()}
const two:PrivateTool={...one,id:'two',title:'Beta 表单',kind:'FORM',updatedAt:'2026-10-26T00:00:00Z',definition:{schemaVersion:2,pages:[]}}
const three:PrivateTool={...one,id:'three',title:'Gamma 表单',kind:'FORM',updatedAt:undefined,definition:{schemaVersion:2,pages:[]}}
const order=()=>within(screen.getByRole('list',{name:'我的工具列表'})).getAllByRole('heading').map(e=>e.textContent)
function search(value:string){fireEvent.change(screen.getByRole('searchbox'),{target:{value}});fireEvent.submit(screen.getByRole('search'))}
afterEach(()=>{cleanup();vi.restoreAllMocks()})
it('removes repeated list headings and author badges, searches normalized titles and kinds, and sorts without new requests',async()=>{
 const api=vi.fn(async()=>({list:[one,three,two],nextCursor:null}))
 const view=render(<EducationPrivateToolStudio entry="SCHOOL" organizationId="org" api={api as PrivateToolApi}/> )
 await screen.findByRole('button',{name:'编辑 Alpha 量表'})
 expect(screen.queryByRole('heading',{name:'工具列表'})).not.toBeInTheDocument();expect(screen.queryByText('作者私有')).not.toBeInTheDocument()
 expect(screen.queryByRole('search')).not.toBeInTheDocument();expect(order()).toEqual(['Beta 表单','Alpha 量表','Gamma 表单'])
 fireEvent.change(screen.getByLabelText('排序'),{target:{value:'oldest'}});expect(order()).toEqual(['Alpha 量表','Beta 表单','Gamma 表单'])
 fireEvent.change(screen.getByLabelText('排序'),{target:{value:'title-desc'}});expect(order()).toEqual(['Gamma 表单','Beta 表单','Alpha 量表'])
 fireEvent.change(screen.getByLabelText('排序'),{target:{value:'title'}});expect(order()).toEqual(['Alpha 量表','Beta 表单','Gamma 表单'])
 fireEvent.click(screen.getByRole('button',{name:'卡片视图'}));expect(view.container.querySelector('.education-private-list--cards')).not.toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'检索工具'}));search('  ＡＬＰＨＡ  ');expect(order()).toEqual(['Alpha 量表'])
 search('表单');expect(order()).toEqual(['Beta 表单','Gamma 表单'])
 search('没有匹配');expect(screen.queryByRole('listitem')).not.toBeInTheDocument();expect(screen.getByText(/没有找到匹配的工具/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'清空检索'}));expect(order()).toHaveLength(3)
 fireEvent.keyDown(screen.getByRole('searchbox'),{key:'Escape'});expect(screen.queryByRole('search')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'检索工具'})).toHaveFocus()
 expect(api.mock.calls).toEqual([[base]])
})
it('preserves the query and sort when returning from the editor, while keeping saving explicit',async()=>{
 const api=vi.fn(async(path:string,method?:string)=>{if(method)throw Error('Unexpected mutation');return path===base?{list:[one,two],nextCursor:null}:path.endsWith('/versions')?{list:[]}:one})
 render(<EducationPrivateToolStudio entry="SCHOOL" organizationId="org" api={api as PrivateToolApi}/> )
 await screen.findByRole('button',{name:'编辑 Alpha 量表'})
 fireEvent.change(screen.getByLabelText('排序'),{target:{value:'oldest'}})
 fireEvent.click(screen.getByRole('button',{name:'检索工具'}));search('Alpha')
 fireEvent.click(screen.getByRole('button',{name:'编辑 Alpha 量表'}));await waitFor(()=>expect(screen.getByRole('button',{name:'返回我的工具'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'返回我的工具'}));await waitFor(()=>expect(screen.getByRole('button',{name:'编辑 Alpha 量表'})).toBeEnabled())
 expect(screen.getByLabelText('排序')).toHaveValue('oldest');expect(screen.queryByRole('button',{name:'编辑 Beta 表单'})).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'检索工具'})).toHaveAttribute('data-filtered','true');expect(api.mock.calls.every(([,method])=>!method)).toBe(true)
})
it('labels loaded-only search and includes later pages under the active filter and sort',async()=>{
 let release!:(value:unknown)=>void
 const next=new Promise(resolve=>{release=resolve})
 const api=vi.fn(async(path:string)=>path===base?{list:[one],nextCursor:'next'}:next)
 render(<EducationPrivateToolStudio entry="SCHOOL" organizationId="org" api={api as PrivateToolApi}/> )
 await screen.findByRole('button',{name:'编辑 Alpha 量表'})
 expect(screen.getByText(/检索和排序仅作用于已加载的 1 项/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'检索已加载的工具'}));search('表单')
 const more=screen.getByRole('button',{name:'加载更多工具'});fireEvent.click(more);fireEvent.click(more)
 expect(api.mock.calls.filter(([path])=>path.includes('?cursor='))).toHaveLength(1)
 await act(async()=>release({list:[one,two],nextCursor:null}))
 expect(order()).toEqual(['Beta 表单']);expect(screen.queryByRole('button',{name:'加载更多工具'})).not.toBeInTheDocument()
 expect(screen.queryByText(/仅作用于已加载/)).not.toBeInTheDocument();expect(api.mock.calls).toEqual([[base],[base+'?cursor=next']])
})
it('clears controls on school changes and does not turn failed reads into confirmed empty results',async()=>{
 let fail=true
 const api=vi.fn(async(path:string)=>{if(path===base)return {list:[one],nextCursor:null};if(fail)throw Error('目录暂不可用');return {list:[two],nextCursor:null}})
 const view=render(<EducationPrivateToolStudio entry="SCHOOL" organizationId="org" actorId="author" api={api as PrivateToolApi}/> )
 await screen.findByRole('button',{name:'编辑 Alpha 量表'})
 fireEvent.change(screen.getByLabelText('排序'),{target:{value:'title-desc'}});fireEvent.click(screen.getByRole('button',{name:'检索工具'}));search('Alpha')
 view.rerender(<EducationPrivateToolStudio entry="SCHOOL" organizationId="other" actorId="author" api={api as PrivateToolApi}/> )
 expect(await screen.findByRole('alert')).toHaveTextContent('目录暂不可用')
 expect(screen.getByLabelText('排序')).toHaveValue('updated');expect(screen.queryByText(/暂无私有工具/)).not.toBeInTheDocument();expect(screen.queryByRole('search')).not.toBeInTheDocument()
 fail=false;fireEvent.click(screen.getByRole('button',{name:'重新读取列表'}));await screen.findByRole('button',{name:'编辑 Beta 表单'})
 expect(screen.queryByRole('button',{name:'编辑 Alpha 量表'})).not.toBeInTheDocument()
})
