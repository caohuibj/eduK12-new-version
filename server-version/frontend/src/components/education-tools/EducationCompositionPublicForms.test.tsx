import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {EducationCompositionStudio} from './EducationCompositionStudio'
import {EducationPublicFormChooser} from './EducationPublicFormChooser'
import {emptyDefinition} from '../../pages/scaleDefinitionEditorModel'
import type {PrivateToolApi} from './privateToolClient'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash=(x:string)=>x.repeat(64),org=id(1),base=`/organizations/${org}/private-tools`
const source=(n=4,title='已授权参考表单')=>({catalogKey:`education-source:FORM:${id(n)}:${hash('b')}`,kind:'FORM',sourceProvider:'FORM',sourceId:id(n),title,contentHash:hash('b'),language:'zh-CN',versions:{content:'original-form-2',parameters:null,report:null},allowedActions:['REFERENCE_FIXED_VERSION'],canEditOriginal:false,canDistribute:false})
describe('ordinary questionnaire public fixed Form adapter',()=>{
 it.each(['SCHOOL','TEACHER'] as const)('%s saves/reopens exact public origin alongside a colliding private version ID and only previews the selected leaf',async entry=>{
  const rootId=id(8),privateTool=id(3),versionId=id(4),pub=source(),population=entry==='SCHOOL'?'STUDENT':'TEACHER'
  const privateRef={id:versionId,toolId:privateTool,sourceProvider:'PRIVATE_VERSION',kind:'SCALE',title:'本人固定量表',sourceRevision:3,contentHash:hash('a')}
  const publicRef={id:pub.sourceId,sourceProvider:'PUBLIC_FORM',kind:'FORM',title:pub.title,version:pub.versions.content,contentHash:pub.contentHash}
  let created=false,fixed=false,root:any={id:rootId,kind:'COMPOSITION',title:'混合来源问卷',revision:1,contentHash:hash('c'),definition:{schemaVersion:1,adapterVersion:'1.0.0',administration:{population,responseMode:'SELF'},instruction:'',blocks:[]}}
  const form={schemaVersion:2,pages:[{pageKey:'page',title:'公共原始页面',questions:[{itemKey:'publicq',type:'SHORT_TEXT',prompt:'公共固定题目',required:false,options:[],rows:[]}]}]}
  const scale=emptyDefinition();scale.items=[{itemCode:'q',sortOrder:0,content:'本人固定量表题目',type:'single',required:true,responseSetKey:'default',randomizeOptions:false}]
  const api=vi.fn(async(path:string,method='GET',body?:any)=>{
   if(path===base+'?kind=COMPOSITION')return {list:created?[root]:[],nextCursor:null}
   if(path===base&&method==='GET')return {list:[{id:privateTool,kind:'SCALE',title:'本人量表草稿',revision:9,contentHash:hash('d')}],nextCursor:null}
   if(path===base&&method==='POST'){created=true;return structuredClone(root)}
   if(path===`${base}/${privateTool}/versions`)return {list:[privateRef],nextCursor:null}
   if(path===`${base}/${privateTool}/versions/${versionId}`)return {...privateRef,definition:scale}
   if(path.startsWith(base+'/public-sources?'))return {list:[pub,{...source(5,'未声明适用范围的表单'),allowedActions:[],unavailableReason:'该固定版本未声明适用于当前问卷的施测方式。'}],nextCursor:null}
   if(path===`${base}/public-sources/form/${pub.sourceId}?contentHash=${pub.contentHash}`)return {id:pub.sourceId,kind:'FORM',title:pub.title,contentHash:pub.contentHash,definition:form,instruction:'公共原版说明',canEditOriginal:false}
   if(path===`${base}/${rootId}`&&method==='PUT'){expect(body.expectedRevision).toBe(1);root={...root,revision:2,contentHash:hash('e'),definition:body.definition};return structuredClone(root)}
   if(path===`${base}/${rootId}`)return {...structuredClone(root),references:[privateRef,publicRef]}
   if(path===`${base}/${rootId}/versions`)return {list:fixed?[{id:id(9),sourceRevision:2,contentHash:root.contentHash,title:root.title}]:[],nextCursor:null}
   if(path===`${base}/${rootId}/freeze`){expect(body).toEqual({expectedRevision:2,expectedContentHash:hash('e')});fixed=true;return {id:id(9),sourceRevision:2,contentHash:root.contentHash,title:root.title}}
   throw Error('Unexpected '+method+' '+path)
  })
  render(<EducationCompositionStudio api={api as PrivateToolApi} entry={entry} organizationId={org} actorId={id(2)}/>)
  fireEvent.change(screen.getByLabelText('问卷名称'),{target:{value:root.title}})
  await waitFor(()=>expect(screen.getByRole('button',{name:'新建普通问卷'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'新建普通问卷'}))
  fireEvent.click(await screen.findByRole('button',{name:'选择固定版本 · 本人量表草稿'}));fireEvent.click(await screen.findByRole('button',{name:'加入问卷 · 修订 3'}))
  fireEvent.click(screen.getByRole('button',{name:'获授权公共表单'}))
  const card=(await screen.findByText(pub.title)).closest('article')!;fireEvent.click(within(card).getByRole('button',{name:'加入公共表单'}))
  expect(within(screen.getByText('未声明适用范围的表单').closest('article')!).getByRole('button')).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'上移工具 2'}))
  const outline=screen.getByRole('complementary',{name:'作答顺序'})
  expect(within(outline).getAllByRole('listitem').map(item=>item.textContent)).toEqual([expect.stringContaining(pub.title),expect.stringContaining(privateRef.title)])
  fireEvent.change(screen.getByLabelText('工具衔接说明 1'),{target:{value:'进入公共表单前'}})
  fireEvent.click(screen.getByRole('button',{name:'保存问卷草稿'}));await screen.findByText('问卷草稿已保存。')
  expect(root.definition.blocks.map((block:any)=>block.source)).toEqual([{provider:'PUBLIC_FORM',kind:'FORM',versionId:pub.sourceId,contentHash:pub.contentHash},{provider:'PRIVATE_VERSION',kind:'SCALE',versionId,contentHash:hash('a')}])
  expect(JSON.stringify(root.definition)).not.toMatch(/公共固定题目|Original|definitionDigest/)
  fireEvent.click(screen.getByRole('button',{name:'固定问卷版本'}));await screen.findByText(/问卷版本已固定/)
  fireEvent.click(screen.getByRole('button',{name:'返回普通问卷列表'}));fireEvent.click(await screen.findByRole('button',{name:'编辑 '+root.title}))
  await screen.findByText('固定问卷版本（1）');fireEvent.click(screen.getByRole('button',{name:'预览问卷'}))
  await screen.findByText('公共固定题目');expect(screen.getByText('公共原版说明')).toBeInTheDocument();expect(screen.getAllByText('进入公共表单前').length).toBeGreaterThan(0)
  expect(api.mock.calls.some(([path])=>path===`${base}/${privateTool}/versions/${versionId}`)).toBe(false)
  expect(api.mock.calls.some(([path])=>path.endsWith('/preview'))).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'下一工具'}));await screen.findByText('1. 本人固定量表题目')
  expect(api.mock.calls.filter(([path])=>path.includes('/public-sources/form/'))).toHaveLength(1)
  expect(api.mock.calls.some(([path,method])=>method==='PUT'&&path!==`${base}/${rootId}`)).toBe(false)
 })

 it('discards a late public catalog response when the same transport changes entry/author',async()=>{
  let resolve:(value:any)=>void=()=>undefined
  const api=vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolve=r})).mockResolvedValue({list:[source(7,'当前School公共表单')],nextCursor:null})
  const choose=vi.fn(),view=render(<EducationPublicFormChooser api={api as PrivateToolApi} entry="TEACHER" organizationId={org} actorId={id(2)} onChoose={choose}/>)
  await waitFor(()=>expect(api).toHaveBeenCalledTimes(1))
  view.rerender(<EducationPublicFormChooser api={api as PrivateToolApi} entry="SCHOOL" organizationId={org} actorId={id(6)} onChoose={choose}/>)
  await screen.findByText('当前School公共表单')
  await act(async()=>resolve({list:[source(4,'过期Teacher公共表单')],nextCursor:null}))
  expect(screen.queryByText('过期Teacher公共表单')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'加入公共表单'}));expect(choose).toHaveBeenCalledWith(expect.objectContaining({title:'当前School公共表单'}))
 })

 it('deduplicates pages and searches before selecting; repeating the same search preserves loaded rows',async()=>{
  const next=`education-source:FORM:${id(4)}:${hash('b')}`
  const tagFacets={domain:[{id:'domain:health',label:'心理健康'}],population:[],construct:[],subject:[],language:[]}
  const api=vi.fn(async(path:string)=>{const query=new URLSearchParams(path.split('?')[1]);return {...(query.get('q')?{list:[source(6,'查询结果')],nextCursor:null}:query.get('cursor')?{list:[source(),source(5,'第二页表单')],nextCursor:null}:{list:[source()],nextCursor:next}),tagFacets}})
  const choose=vi.fn()
  render(<EducationPublicFormChooser api={api as PrivateToolApi} entry="TEACHER" organizationId={org} actorId={id(2)} onChoose={choose}/>)
  fireEvent.click(await screen.findByRole('button',{name:'加载更多公共表单'}));await screen.findByText('第二页表单')
  expect(screen.getAllByText('已授权参考表单')).toHaveLength(1)
  fireEvent.change(screen.getByRole('searchbox',{name:'关键词'}),{target:{value:'查询'}})
  fireEvent.change(screen.getByLabelText('领域'),{target:{value:'domain:health'}})
  fireEvent.click(screen.getByRole('button',{name:'检索'}));await screen.findByText('查询结果')
  const applied=new URLSearchParams(api.mock.calls[api.mock.calls.length-1][0].split('?')[1])
  expect(applied.get('cursor')).toBeNull();expect(applied.get('tags')).toBe('domain:health')
  fireEvent.click(screen.getByRole('button',{name:'加入公共表单'}));expect(choose).toHaveBeenCalledWith(source(6,'查询结果'))
  fireEvent.click(screen.getByRole('button',{name:'检索'}));expect(screen.getByText('查询结果')).toBeInTheDocument();expect(api).toHaveBeenCalledTimes(3)
  fireEvent.click(screen.getByRole('button',{name:'清除筛选'}));await screen.findByText('已授权参考表单')
  const cleared=new URLSearchParams(api.mock.calls[api.mock.calls.length-1][0].split('?')[1])
  expect(cleared.get('q')).toBe('');expect(cleared.has('tags')).toBe(false);expect(cleared.has('cursor')).toBe(false)
 })
})
