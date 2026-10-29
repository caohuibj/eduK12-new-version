import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {EducationCompositionStudio} from './EducationCompositionStudio'
import {EducationCompositionRunPicker} from './EducationCompositionRunPicker'
import {EducationPublicFormChooser} from './EducationPublicFormChooser'
import type {PrivateToolApi} from './privateToolClient'
import type {CompositionTool} from './educationCompositionClient'
import type {CompositionResponseMode} from './educationCompositionAdministration'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash='a'.repeat(64)
const base='/organizations/org/private-tools'
const library={catalogKey:'library',sourceProvider:'LIBRARY_SCALE',kind:'SCALE',sourceId:id(3),contentHash:hash,title:'固定观察量表',language:'zh-CN',versions:{content:'C1',parameters:null,report:'R1'},allowedActions:['REFERENCE_FIXED_VERSION'],canEditOriginal:false,canDistribute:false}
const formRef={id:id(5),toolId:id(4),kind:'FORM' as const,sourceProvider:'PRIVATE_VERSION' as const,title:'固定观察表单',sourceRevision:2,contentHash:hash}
const form={schemaVersion:2,pages:[{pageKey:'p',title:'观察表单页',questions:[{itemKey:'q',type:'SHORT_TEXT',prompt:'观察描述',required:true,options:[],rows:[]}]}]}
const display={responseSets:[{key:'set',options:[{value:'yes',label:'同意'}]}],items:[{itemCode:'q',content:'观察行为题目',type:'single',required:true,sortOrder:0,responseSetKey:'set'}]}
function togglePicker(){const details=screen.getByText('选用本人普通问卷').closest('details')!;details.open=true;fireEvent(details,new Event('toggle'))}

describe('School ordinary observer questionnaire UI',()=>{
 it.each(['PARENT_REPORT','TEACHER_REPORT'] as const)('authors, saves, reopens and lazily previews exact Scale/Form versions for %s',async responseMode=>{
  let created=false,fixed=false
  let root:CompositionTool={id:id(1),kind:'COMPOSITION',title:'学生观察问卷',revision:1,contentHash:hash,definition:{schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'STUDENT',responseMode:'SELF'},instruction:'',blocks:[]}}
  const api=vi.fn(async(path:string,method='GET',body?:any)=>{
   if(path===base+'?kind=COMPOSITION')return {list:created?[{...root,definition:undefined}]:[],nextCursor:null}
   if(path===base&&method==='POST'){created=true;return structuredClone(root)}
   if(path===base)return {list:[{id:id(4),kind:'FORM',title:'本人观察表单',revision:9}],nextCursor:null}
   if(path===`${base}/${id(4)}/versions`)return {list:[formRef],nextCursor:null}
   if(path.startsWith(base+'/library-sources?')){expect(new URLSearchParams(path.split('?')[1]).get('responseMode')).toBe(responseMode);return {list:[library],nextCursor:null}}
   if(path===`${base}/${id(1)}`&&method==='PUT'){expect(body.expectedRevision).toBe(1);root={...root,revision:2,definition:body.definition};return structuredClone(root)}
   if(path===`${base}/${id(1)}`)return {...structuredClone(root),references:[formRef,{id:library.sourceId,sourceProvider:'LIBRARY_SCALE',kind:'SCALE',title:library.title,contentHash:hash,version:'C1'}]}
   if(path===`${base}/${id(1)}/versions`)return {list:fixed?[{id:id(8),title:root.title,sourceRevision:2,contentHash:hash,administration:root.definition.administration}]:[],nextCursor:null}
   if(path===`${base}/${id(1)}/freeze`){expect(body).toEqual({expectedRevision:2,expectedContentHash:hash});fixed=true;return {id:id(8),title:root.title,sourceRevision:2,contentHash:hash}}
   if(path===`${base}/${id(4)}/versions/${formRef.id}`)return {...formRef,definition:form}
   if(path===`${base}/library-sources/${library.sourceId}?contentHash=${hash}&responseMode=${responseMode}`)return {id:library.sourceId,kind:'SCALE',title:library.title,contentHash:hash,definition:display}
   throw Error('Unexpected '+method+' '+path)
  })
  render(<EducationCompositionStudio api={api as PrivateToolApi} entry="SCHOOL" organizationId="org" actorId="author"/>)
  fireEvent.change(screen.getByLabelText('问卷名称'),{target:{value:root.title}})
  await waitFor(()=>expect(screen.getByRole('button',{name:'新建普通问卷'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'新建普通问卷'}))
  fireEvent.change(await screen.findByLabelText('问卷作答方式'),{target:{value:responseMode}})
  fireEvent.click(await screen.findByRole('button',{name:'选择固定版本 · 本人观察表单'}));fireEvent.click(await screen.findByRole('button',{name:'加入问卷 · 修订 2'}))
  fireEvent.click(screen.getByRole('button',{name:'获授权共用量表'}));fireEvent.click(await screen.findByRole('button',{name:'加入共用量表'}))
  fireEvent.click(screen.getByRole('button',{name:'保存问卷草稿'}));await screen.findByText('问卷草稿已保存。')
  expect(root.definition.administration).toEqual({population:'STUDENT',responseMode})
  expect(root.definition.blocks.map(block=>block.source)).toEqual([{provider:'PRIVATE_VERSION',kind:'FORM',versionId:formRef.id,contentHash:hash},{provider:'LIBRARY_SCALE',kind:'SCALE',versionId:library.sourceId,contentHash:hash}])
  expect(JSON.stringify(root.definition)).not.toMatch(/观察行为题目|观察描述|scoring|respondentUserId/)
  fireEvent.click(screen.getByRole('button',{name:'固定问卷版本'}));await screen.findByText(/问卷版本已固定/)
  fireEvent.click(screen.getByRole('button',{name:'返回普通问卷列表'}));fireEvent.click(await screen.findByRole('button',{name:'编辑 学生观察问卷'}))
  await waitFor(()=>expect(screen.getByLabelText('问卷作答方式')).toHaveValue(responseMode))
  await waitFor(()=>expect(screen.getByRole('button',{name:'预览问卷'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'预览问卷'}))
  const preview=await screen.findByRole('region',{name:'问卷内容预览'});await within(preview).findByText('观察描述（必答）')
  expect(api.mock.calls.some(([path])=>path.includes('/library-sources/')&&!path.includes('?q='))).toBe(false)
  fireEvent.click(within(preview).getByRole('button',{name:'下一工具'}));await within(preview).findByText('1. 观察行为题目')
  expect(api.mock.calls.filter(([path])=>path===`${base}/library-sources/${library.sourceId}?contentHash=${hash}&responseMode=${responseMode}`)).toHaveLength(1)
  expect(api.mock.calls.some(([path])=>path.endsWith('/preview')||path.includes('/tracks'))).toBe(false)
 })
 it('asks before reselecting fixed leaves for a different mode and clears them only after confirmation',async()=>{
  const root={id:id(1),kind:'COMPOSITION',title:'已有自评问卷',revision:1,contentHash:hash,definition:{schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'STUDENT',responseMode:'SELF'},instruction:'',blocks:[{blockId:id(9),instruction:'',source:{provider:'PRIVATE_VERSION',kind:'FORM',versionId:formRef.id,contentHash:hash}}]},references:[formRef]}
  const api=vi.fn(async(path:string,_method='GET')=>path===base+'?kind=COMPOSITION'?{list:[root],nextCursor:null}:path===base+'/'+id(1)?root:{list:[],nextCursor:null})
  const confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  try{
   render(<EducationCompositionStudio api={api as PrivateToolApi} entry="SCHOOL" organizationId="org" actorId="author"/>)
   fireEvent.click(await screen.findByRole('button',{name:'编辑 已有自评问卷'}));await waitFor(()=>expect(screen.getByLabelText('问卷作答方式')).toBeEnabled())
   const outline=screen.getByRole('complementary',{name:'作答顺序'})
   fireEvent.change(screen.getByLabelText('问卷作答方式'),{target:{value:'PARENT_REPORT'}})
   expect(screen.getByLabelText('问卷作答方式')).toHaveValue('SELF');expect(within(outline).getAllByRole('listitem')).toHaveLength(1)
   fireEvent.change(screen.getByLabelText('问卷作答方式'),{target:{value:'PARENT_REPORT'}})
   expect(screen.getByLabelText('问卷作答方式')).toHaveValue('PARENT_REPORT');expect(within(outline).queryAllByRole('listitem')).toHaveLength(0)
   expect(screen.getByRole('button',{name:'固定问卷版本'})).toBeDisabled();expect(api.mock.calls.some(([,method])=>method==='PUT')).toBe(false)
  }finally{confirm.mockRestore()}
 })
 it('discards the previous mode catalog even with the same account, entry and transport',async()=>{
  let finish!:(value:unknown)=>void
  const api=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue({list:[{...library,title:'当前教师观察量表'}],nextCursor:null})
  const choose=vi.fn(),props={api:api as PrivateToolApi,entry:'SCHOOL' as const,organizationId:'org',actorId:'author',kind:'SCALE' as const,catalog:'LIBRARY' as const,onChoose:choose}
  const view=render(<EducationPublicFormChooser {...props} responseMode="PARENT_REPORT"/>);await waitFor(()=>expect(api).toHaveBeenCalledOnce())
  view.rerender(<EducationPublicFormChooser {...props} responseMode="TEACHER_REPORT"/>);await screen.findByText('当前教师观察量表')
  await act(async()=>finish({list:[{...library,title:'迟到家长观察量表'}],nextCursor:null}))
  expect(screen.queryByText('迟到家长观察量表')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'加入共用量表'}));expect(choose).toHaveBeenCalledWith(expect.objectContaining({title:'当前教师观察量表'}))
 })
 it.each([undefined,{population:'TEACHER',responseMode:'SELF'},{population:'STUDENT',responseMode:'STUDENT_REPORT'}])('blocks attachment when fixed administration is missing or incompatible: %j',async administration=>{
  const api=vi.fn(async(path:string,_method='GET')=>path===base+'?kind=COMPOSITION'?{list:[{id:'root',kind:'COMPOSITION',title:'问卷',revision:7}],nextCursor:null}:{list:[{id:'fixed',title:'旧版本',sourceRevision:1,contentHash:hash,administration}],nextCursor:null})
  render(<EducationCompositionRunPicker api={api as PrivateToolApi} entry="SCHOOL" organizationId="org" actorKey="author" endpoint="/tracks" expectedVersion={4} disabled={false} onBusy={vi.fn()} onRefresh={vi.fn()}/>);togglePicker()
  fireEvent.click(await screen.findByRole('button',{name:'选择固定版本 · 问卷'}));fireEvent.click(await screen.findByRole('button',{name:'选择本版本 · 修订 1'}))
  expect(screen.getByRole('alert')).toHaveTextContent('作答方式缺失或不适用于当前入口');expect(screen.getByRole('button',{name:'加入测评批次'})).toBeDisabled()
  expect(api.mock.calls.some(([,method])=>method==='POST')).toBe(false)
 })
 it('forgets a pending attachment on actor change and ignores its late response on the stable transport',async()=>{
  let finish!:(value:unknown)=>void
  const pending=new Promise(resolve=>{finish=resolve}),administration={population:'STUDENT',responseMode:'PARENT_REPORT' as CompositionResponseMode}
  const api=vi.fn(async(path:string,method='GET')=>method==='POST'?pending:path===base+'?kind=COMPOSITION'?{list:[{id:'root',kind:'COMPOSITION',title:'问卷',revision:7}],nextCursor:null}:{list:[{id:'fixed',title:'固定观察问卷',sourceRevision:1,contentHash:hash,administration}],nextCursor:null})
  const refresh=vi.fn(),busy=vi.fn(),props={api:api as PrivateToolApi,entry:'SCHOOL' as const,organizationId:'org',endpoint:'/tracks',expectedVersion:4,disabled:false,onBusy:busy,onRefresh:refresh}
  const view=render(<EducationCompositionRunPicker {...props} actorKey="old"/>);togglePicker()
  fireEvent.click(await screen.findByRole('button',{name:'选择固定版本 · 问卷'}));fireEvent.click(await screen.findByRole('button',{name:'选择本版本 · 修订 1'}))
  fireEvent.click(screen.getByRole('button',{name:'加入测评批次'}));fireEvent.click(screen.getByRole('button',{name:'加入测评批次'}))
  await waitFor(()=>expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1))
  view.rerender(<EducationCompositionRunPicker {...props} actorKey="new"/>);expect(screen.getByRole('button',{name:'加入测评批次'})).toBeDisabled()
  await act(async()=>{finish({id:'track'});await pending})
  expect(refresh).not.toHaveBeenCalled();expect(screen.queryByText(/已加入任务草稿/)).not.toBeInTheDocument();expect(busy).toHaveBeenLastCalledWith(false)
 })
})
