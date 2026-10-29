import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {EducationCompositionStudio} from './EducationCompositionStudio'
import {EducationPublicFormChooser} from './EducationPublicFormChooser'
import type {PrivateToolApi} from './privateToolClient'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash=(x:string)=>x.repeat(64)
const source={catalogKey:'library-fixed',kind:'SCALE',sourceProvider:'LIBRARY_SCALE',sourceId:id(3),contentHash:hash('a'),title:'获权共用量表原版',language:'zh-CN',
 versions:{content:'original-C',parameters:null,report:'native-R'},allowedActions:['REFERENCE_FIXED_VERSION'],canEditOriginal:false,canDistribute:false}
describe('ordinary questionnaire original-library UI adapter',()=>{
 it('selects the exact library identity, reopens only authorized headers, previews one display leaf and fixes the questionnaire',async()=>{
  const org=id(1),rootId=id(2),base=`/organizations/${org}/private-tools`
  let created=false,fixed=false,root:any={id:rootId,kind:'COMPOSITION',title:'共用量表普通问卷',revision:1,contentHash:hash('b'),definition:{schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'',blocks:[]}}
  const api=vi.fn(async(path:string,method='GET',body?:any)=>{
   if(path===base+'?kind=COMPOSITION')return {list:created?[root]:[],nextCursor:null}
   if(path===base&&method==='GET')return {list:[],nextCursor:null}
   if(path===base&&method==='POST'){created=true;return structuredClone(root)}
   if(path.startsWith(base+'/library-sources?'))return {list:[source],nextCursor:null}
   if(path===`${base}/${rootId}`&&method==='PUT'){root={...root,revision:2,contentHash:hash('c'),definition:body.definition};return structuredClone(root)}
   if(path===`${base}/${rootId}`)return {...structuredClone(root),references:[{id:source.sourceId,kind:'SCALE',sourceProvider:'LIBRARY_SCALE',title:source.title,contentHash:source.contentHash,version:'original-C',versions:source.versions}]}
   if(path===`${base}/${rootId}/versions`)return {list:fixed?[{id:id(8),title:root.title,sourceRevision:2,contentHash:root.contentHash}]:[],nextCursor:null}
   if(path===`${base}/${rootId}/freeze`){expect(body).toEqual({expectedRevision:2,expectedContentHash:hash('c')});fixed=true;return {id:id(8),title:root.title,sourceRevision:2,contentHash:root.contentHash}}
   if(path===`${base}/library-sources/${source.sourceId}?contentHash=${source.contentHash}`)return {id:source.sourceId,kind:'SCALE',title:source.title,contentHash:source.contentHash,instruction:'原版固定说明',definition:{responseSets:[{key:'set',options:[{value:'yes',label:'同意'}]}],items:[{itemCode:'q',content:'共用原始题目',type:'single',required:true,sortOrder:0,responseSetKey:'set'}]}}
   throw Error('Unexpected '+method+' '+path)
  })
  render(<EducationCompositionStudio api={api as PrivateToolApi} entry="TEACHER" organizationId={org} actorId={id(4)}/>)
  fireEvent.change(screen.getByLabelText('问卷名称'),{target:{value:root.title}})
  await waitFor(()=>expect(screen.getByRole('button',{name:'新建普通问卷'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'新建普通问卷'}))
  fireEvent.click(await screen.findByRole('button',{name:'获授权共用量表'}))
  const card=(await screen.findByText(source.title)).closest('article')!
  expect(card).toHaveTextContent('original-C');expect(card).toHaveTextContent('native-R')
  fireEvent.click(within(card).getByRole('button',{name:'加入共用量表'}))
  fireEvent.click(screen.getByRole('button',{name:'保存问卷草稿'}));await screen.findByText('问卷草稿已保存。')
  expect(root.definition.blocks[0].source).toEqual({provider:'LIBRARY_SCALE',kind:'SCALE',versionId:source.sourceId,contentHash:source.contentHash})
  expect(JSON.stringify(root.definition)).not.toMatch(/共用原始题目|definition|scoring|report/)
  fireEvent.click(screen.getByRole('button',{name:'返回普通问卷列表'}));fireEvent.click(await screen.findByRole('button',{name:'编辑 '+root.title}))
  await screen.findAllByText(source.title)
  fireEvent.click(screen.getByRole('button',{name:'预览问卷'}));await screen.findByText('1. 共用原始题目')
  expect(screen.getByText('原版固定说明')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'固定问卷版本'}));await screen.findByText(/问卷版本已固定/)
  expect(api.mock.calls.filter(([path])=>path.includes('/library-sources/')&&!path.includes('/assets/'))).toHaveLength(1)
  expect(api.mock.calls.some(([path])=>path.endsWith('/preview')||path.endsWith('/validate')||path.includes('/tracks'))).toBe(false)
  expect(api.mock.calls.some(([path,method])=>method==='PUT'&&path!==`${base}/${rootId}`)).toBe(false)
 })
 it('discards a late library directory when the same actor switches to the public Standard directory',async()=>{
  let resolve:(value:unknown)=>void=()=>undefined
  const api=vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolve=r})).mockResolvedValue({list:[{...source,catalogKey:'standard',sourceProvider:'STANDARD_SCALE',title:'当前标准量表'}],nextCursor:null})
  const choose=vi.fn(),props={api:api as PrivateToolApi,entry:'TEACHER' as const,organizationId:id(1),actorId:id(4),kind:'SCALE' as const,onChoose:choose}
  const view=render(<EducationPublicFormChooser {...props} catalog="LIBRARY"/>)
  await waitFor(()=>expect(api).toHaveBeenCalledOnce())
  view.rerender(<EducationPublicFormChooser {...props} catalog="PUBLIC"/>)
  await screen.findByText('当前标准量表')
  await act(async()=>resolve({list:[source],nextCursor:null}))
  expect(screen.queryByText(source.title)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'加入公共量表'}));expect(choose).toHaveBeenCalledWith(expect.objectContaining({sourceProvider:'STANDARD_SCALE'}))
 })
})
