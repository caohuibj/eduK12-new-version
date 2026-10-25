import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {EducationPrivateToolStudio} from './EducationPrivateToolStudio'
import {emptyDefinition} from '../../pages/scaleDefinitionEditorModel'
import {privateToolError,type PrivateTool,type PrivateToolApi} from './privateToolClient'

const base='/organizations/a/private-tools'
const tool=(id:string):PrivateTool=>({id,kind:'SCALE',title:`工具 ${id}`,revision:1,contentHash:`hash-${id}`,definition:emptyDefinition()})
const version=(id:string)=>({id,title:`版本 ${id}`,sourceRevision:1,contentHash:`hash-${id}`})
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
afterEach(()=>{cleanup();vi.restoreAllMocks()})

describe('private tool and frozen version pagination',()=>{
 it('explains invalid cursors without advising automatic draft replacement',()=>{
  expect(privateToolError({code:'PRIVATE_TOOL_CURSOR_INVALID',status:400})).toBe('分页位置已失效。工具列表请重新读取列表；固定版本请重新读取草稿后再加载，本页编辑不会自动丢弃。')
 })
 it('deduplicates tool pages and preserves rows and cursor after a failed page for explicit retry',async()=>{
  let fail=true
  const api=vi.fn(async(path:string)=>{
   if(path===base)return {list:[tool('one')],nextCursor:'tool cursor'}
   if(path===base+'?cursor=tool%20cursor'){
    if(fail){fail=false;throw Error('工具分页暂时失败')}
    return {list:[tool('one'),tool('two'),tool('two')],nextCursor:null}
   }
   throw Error(`Unexpected path ${path}`)
  })
  render(<EducationPrivateToolStudio api={api as PrivateToolApi} organizationId="a" entry="SCHOOL"/>)
  fireEvent.click(await screen.findByRole('button',{name:'加载更多工具'}))
  await screen.findByText('工具分页暂时失败')
  expect(screen.getAllByRole('button',{name:'编辑 工具 one'})).toHaveLength(1)
  expect(screen.getByRole('button',{name:'加载更多工具'})).toBeEnabled()
  expect(api.mock.calls.filter(([path])=>path.includes('?cursor='))).toHaveLength(1)
  fireEvent.click(screen.getByRole('button',{name:'加载更多工具'}))
  await screen.findByRole('button',{name:'编辑 工具 two'})
  expect(screen.getAllByRole('button',{name:'编辑 工具 one'})).toHaveLength(1)
  expect(screen.getAllByRole('button',{name:'编辑 工具 two'})).toHaveLength(1)
  expect(screen.queryByRole('button',{name:'加载更多工具'})).not.toBeInTheDocument()
  expect(api.mock.calls.filter(([path])=>path===base+'?cursor=tool%20cursor')).toHaveLength(2)
 })

 it('keeps a newly frozen version and history after page failure, then deduplicates the retried page',async()=>{
  let fail=true
  const api=vi.fn(async(path:string)=>{
   if(path===base)return {list:[tool('one')],nextCursor:null}
   if(path===base+'/one')return tool('one')
   if(path===base+'/one/versions')return {list:[version('old')],nextCursor:'version cursor'}
   if(path===base+'/one/validate')return {valid:true,issues:[],revision:1,contentHash:'hash-one'}
   if(path===base+'/one/freeze')return version('new')
   if(path===base+'/one/versions?cursor=version%20cursor'){
    if(fail){fail=false;throw Error('版本分页暂时失败')}
    return {list:[version('new'),version('old'),version('older')],nextCursor:null}
   }
   throw Error(`Unexpected path ${path}`)
  })
  render(<EducationPrivateToolStudio api={api as PrivateToolApi} organizationId="a" entry="TEACHER"/>)
  fireEvent.click(await screen.findByRole('button',{name:'编辑 工具 one'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'检查定义'})).toBeEnabled())
  // Version history is intentionally collapsed until the author requests it.
  fireEvent.click(screen.getByText(/当前显示的固定版本/))
  fireEvent.click(screen.getByRole('button',{name:'检查定义'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'固定私有版本'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'固定私有版本'}))
  await screen.findByText(/^版本 new$/)
  fireEvent.click(screen.getByRole('button',{name:'加载更多固定版本'}))
  await screen.findByText('版本分页暂时失败')
  expect(screen.getAllByText(/^版本 new$/)).toHaveLength(1)
  expect(screen.getAllByText(/^版本 old$/)).toHaveLength(1)
  expect(api.mock.calls.filter(([path])=>path.includes('/versions?'))).toHaveLength(1)
  fireEvent.click(screen.getByRole('button',{name:'加载更多固定版本'}))
  await screen.findByText(/^版本 older$/)
  expect(screen.getAllByText(/^版本 new$/)).toHaveLength(1)
  expect(screen.getAllByText(/^版本 old$/)).toHaveLength(1)
  expect(screen.queryByRole('button',{name:'加载更多固定版本'})).not.toBeInTheDocument()
  expect(api.mock.calls.filter(([path])=>path.endsWith('/versions?cursor=version%20cursor'))).toHaveLength(2)
 })

 it('resets version cursor for another tool and ignores a late page from a previous school',async()=>{
  const late=deferred<{list:ReturnType<typeof version>[];nextCursor:null}>()
  const api=vi.fn(async(path:string)=>{
   if(path===base)return {list:[tool('one'),tool('two')],nextCursor:null}
   if(path===base+'/one')return tool('one')
   if(path===base+'/two')return tool('two')
   if(path===base+'/one/versions')return {list:[version('one')],nextCursor:'old-cursor'}
   if(path===base+'/two/versions')return {list:[version('two')],nextCursor:'new-cursor'}
   if(path===base+'/two/versions?cursor=new-cursor')return late.promise
   if(path==='/organizations/b/private-tools')return {list:[],nextCursor:null}
   throw Error(`Unexpected path ${path}`)
  })
  const {rerender}=render(<EducationPrivateToolStudio api={api as PrivateToolApi} organizationId="a" entry="SCHOOL"/>)
  fireEvent.click(await screen.findByRole('button',{name:'编辑 工具 one'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'返回我的工具'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'返回我的工具'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'编辑 工具 two'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'编辑 工具 two'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'返回我的工具'})).toBeEnabled())
  fireEvent.click(screen.getByText(/当前显示的固定版本/))
  expect(screen.queryByText(/^版本 one$/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'加载更多固定版本'}))
  expect(api).toHaveBeenCalledWith(base+'/two/versions?cursor=new-cursor')
  rerender(<EducationPrivateToolStudio api={api as PrivateToolApi} organizationId="b" entry="SCHOOL"/>)
  await screen.findByText(/暂无私有工具/)
  await act(async()=>late.resolve({list:[version('late')],nextCursor:null}))
  expect(screen.queryByText(/^版本 late$/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'加载更多固定版本'})).not.toBeInTheDocument()
  expect(api.mock.calls.some(([path])=>path.includes('/two/versions?cursor=old-cursor'))).toBe(false)
 })
})
