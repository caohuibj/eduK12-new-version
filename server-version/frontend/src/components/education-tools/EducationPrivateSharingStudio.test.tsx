import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {EducationPrivateToolStudio} from './EducationPrivateToolStudio'
import {emptyDefinition} from '../../pages/scaleDefinitionEditorModel'
import type {PrivateToolApi} from './privateToolClient'
const metadata={title:'固定量表',author:'作者',copyright:'自有',applicability:'研究',scoringDescription:'求和',reportDescription:'描述'}
afterEach(()=>{cleanup();vi.restoreAllMocks()})
describe('private studio sharing entry and navigation',()=>{
 it.each(['SCALE','FORM'] as const)('exposes sharing only for SCALE fixed versions, not %s implicitly',async kind=>{
  const draft={id:'tool',kind,title:'工具',revision:1,contentHash:'draft',definition:kind==='SCALE'?emptyDefinition():{schemaVersion:2,pages:[]}}
  const version={id:'version',title:'固定量表',sourceRevision:1,contentHash:'private-hash'}
  const api=vi.fn(async(path:string,method='GET')=>{
   if(path==='/organizations/org/private-tools')return {list:[draft],nextCursor:null}
   if(path==='/organizations/org/private-tools/tool')return draft
   if(path.endsWith('/versions'))return {list:[version],nextCursor:null}
   if(path.endsWith('/prepare'))return {sourceId:'tool',versionId:'version',privateContentHash:'private-hash',product:'SCHOOL',releaseId:'release',contentHash:'release-hash',defaults:metadata,mediaManifest:{schemaVersion:1,manifestHash:'empty',releaseIds:['release'],items:[]},canRequestLibraryShare:true}
   if(path.endsWith('/submissions')&&method==='POST')throw Error('unknown write')
   if(path.endsWith('/sharing/submissions'))return {list:[],hasMore:false}
   throw Error('Unexpected '+path)
  })
  const state=vi.fn(),confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
  render(<EducationPrivateToolStudio api={api as PrivateToolApi} entry="SCHOOL" organizationId="org" actorId="author" onDraftStateChange={state}/>)
  fireEvent.click(await screen.findByRole('button',{name:'编辑 工具'}))
  fireEvent.click(await screen.findByText('当前显示的固定版本（1）'))
  if(kind==='FORM'){
   expect(screen.queryByRole('button',{name:'申请入库 / 查看申请 · 修订 1'})).not.toBeInTheDocument()
   expect(api.mock.calls.some(([path])=>path.includes('/sharing'))).toBe(false);return
  }
  fireEvent.click(screen.getByRole('button',{name:'申请入库 / 查看申请 · 修订 1'}))
  await screen.findByText('当前量表没有申请记录。')
  fireEvent.click(screen.getByRole('button',{name:'准备此固定版本的入库申请'}));await screen.findByLabelText('量表名称')
  fireEvent.change(screen.getByLabelText('量表名称'),{target:{value:'修改后的申请文字'}})
  fireEvent.click(screen.getByRole('button',{name:'关闭入库申请'}))
  expect(confirm).toHaveBeenCalled();expect(screen.getByLabelText('量表名称')).toHaveValue('修改后的申请文字')
  fireEvent.click(screen.getByRole('button',{name:'提交此版本入库申请'}));await screen.findByText(/提交结果尚未确认/)
  await waitFor(()=>expect(state).toHaveBeenLastCalledWith({dirty:true,writing:true}))
  expect(screen.getByRole('button',{name:'关闭入库申请'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'返回我的工具'})).toBeDisabled()
  const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true)
 })
})
