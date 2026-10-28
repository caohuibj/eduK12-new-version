import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {EducationCompositionStudio} from './EducationCompositionStudio'
import type {PrivateToolApi} from './privateToolClient'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash=(x:string)=>x.repeat(64)
describe('public exact Standard ordinary questionnaire adapter',()=>{
 it('shows C/P/R and required context, saves only references, reopens explicit background fields, previews just that leaf and freezes',async()=>{
  const org=id(1),rootId=id(2),sourceId=id(3),base=`/organizations/${org}/private-tools`,sourceHash=hash('a')
  let created=false,fixed=false,root:any={id:rootId,kind:'COMPOSITION',title:'公共量表普通问卷',revision:1,contentHash:hash('b'),definition:{schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'STUDENT',responseMode:'SELF'},instruction:'',blocks:[]}}
  const source={catalogKey:`education-source:STANDARD_SCALE:${sourceId}:${sourceHash}`,kind:'SCALE',sourceProvider:'STANDARD_SCALE',sourceId,contentHash:sourceHash,title:'精确公开量表',language:'zh-CN',versions:{content:'C-2',parameters:'P-3',report:'R-4'},requiredContextKeys:['gradeLevel'],referenceContextKeys:['gradeLevel','primaryLanguage'],allowedActions:['REFERENCE_FIXED_VERSION'],canEditOriginal:false,canDistribute:false}
  const ref={id:sourceId,kind:'SCALE',sourceProvider:'STANDARD_SCALE',title:source.title,contentHash:sourceHash,version:'C-2',versions:source.versions,requiredContextKeys:source.requiredContextKeys}
  const api=vi.fn(async(path:string,method='GET',body?:any)=>{
   if(path===base+'?kind=COMPOSITION')return {list:created?[root]:[],nextCursor:null}
   if(path===base&&method==='GET')return {list:[],nextCursor:null}
   if(path===base&&method==='POST'){created=true;return structuredClone(root)}
   if(path.startsWith(base+'/public-sources?')){expect(new URLSearchParams(path.split('?')[1]).get('kind')).toBe('SCALE');return {list:[source],nextCursor:null}}
   if(path===`${base}/${rootId}`&&method==='PUT'){root={...root,revision:2,contentHash:hash('c'),definition:body.definition};return structuredClone(root)}
   if(path===`${base}/${rootId}`)return {...structuredClone(root),references:[ref]}
   if(path===`${base}/${rootId}/versions`)return {list:fixed?[{id:id(8),title:root.title,sourceRevision:2,contentHash:root.contentHash}]:[],nextCursor:null}
   if(path===`${base}/${rootId}/freeze`){expect(body).toEqual({expectedRevision:2,expectedContentHash:hash('c')});fixed=true;return {id:id(8),title:root.title,sourceRevision:2,contentHash:root.contentHash}}
   if(path===`${base}/public-sources/standard/${sourceId}?contentHash=${sourceHash}`)return {id:sourceId,kind:'SCALE',title:source.title,contentHash:sourceHash,instruction:'原始量表固定说明',definition:{responseSets:[{key:'set',options:[{value:'yes',label:'同意'}]}],items:[{itemCode:'q',content:'公共原始量表题目',type:'single',required:true,sortOrder:0,responseSetKey:'set'}]}}
   throw Error('Unexpected '+method+' '+path)
  })
  render(<EducationCompositionStudio api={api as PrivateToolApi} entry="SCHOOL" organizationId={org} actorId={id(4)}/>)
  fireEvent.change(screen.getByLabelText('问卷名称'),{target:{value:root.title}})
  await waitFor(()=>expect(screen.getByRole('button',{name:'新建普通问卷'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'新建普通问卷'}))
  fireEvent.click(await screen.findByRole('button',{name:'获授权公共量表'}))
  const card=(await screen.findByText(source.title)).closest('article')!
  expect(card).toHaveTextContent('C-2');expect(card).toHaveTextContent('P-3');expect(card).toHaveTextContent('R-4')
  expect(card).toHaveTextContent('年级')
  fireEvent.click(within(card).getByRole('button',{name:'加入公共量表'}))
  expect(screen.getByLabelText('年级')).not.toBeChecked()
  fireEvent.click(screen.getByLabelText('年级'))
  fireEvent.click(screen.getByRole('button',{name:'保存问卷草稿'}));await screen.findByText('问卷草稿已保存。')
  expect(root.definition.blocks[0].source).toEqual({provider:'STANDARD_SCALE',kind:'SCALE',versionId:sourceId,contentHash:sourceHash})
  expect(root.definition.contextFields).toEqual([{contextKey:'gradeLevel',formType:'single_choice',formLabel:'年级',formOptions:expect.arrayContaining([{value:'7',label:'7'}])}])
  expect(JSON.stringify(root.definition)).not.toMatch(/公共原始量表题目|scoring|referencePolicy/)
  fireEvent.click(screen.getByRole('button',{name:'返回普通问卷列表'}));fireEvent.click(await screen.findByRole('button',{name:'编辑 '+root.title}))
  await waitFor(()=>expect(screen.getByLabelText('年级')).toBeChecked())
  fireEvent.click(screen.getByRole('button',{name:'预览问卷'}));await screen.findByText('1. 公共原始量表题目')
  expect(screen.getByRole('complementary',{name:'背景信息预览'})).toHaveTextContent('年级（必答）')
  expect(screen.getByText('原始量表固定说明')).toBeInTheDocument()
  expect(api.mock.calls.filter(([path])=>path.includes('/public-sources/standard/'))).toHaveLength(1)
  fireEvent.click(screen.getByRole('button',{name:'固定问卷版本'}));await screen.findByText(/问卷版本已固定/)
  expect(api.mock.calls.some(([path])=>path.endsWith('/validate')||path.endsWith('/preview')||path.includes('/tracks'))).toBe(false)
 })
})
