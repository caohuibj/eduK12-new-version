import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({query:vi.fn(),find:vi.fn(),update:vi.fn(),images:vi.fn(),sync:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>fn({$queryRaw:m.query,educationPrivateTool:{findFirst:m.find,updateMany:m.update}})}}))
vi.mock('../../modules/education-tools/private-tool.media',()=>({assertPrivateToolImages:m.images,syncPrivateToolDraftImages:m.sync}))
import {importPrivateForm,planPrivateFormImport} from '../../modules/education-tools/private-tool.form-import.service'
import {privateToolContentHash} from '../../modules/education-tools/private-tool.definition'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
import type {FormDraft} from '../../modules/assessment-core/form/definition'
import {previewBulk,applyBulk} from '../../modules/survey/builder.import'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const c:PrivateToolContext={principal:{userId:id(3),accountDomain:'SCHOOL'},entry:'SCHOOL',organizationId:id(1)}
const definition=():FormDraft=>({schemaVersion:2,pages:[{pageKey:'existing',title:'已有分组',description:'保留说明',questions:[{itemKey:'existing_q',type:'SINGLE',prompt:'已有题目',required:false,allowRefusal:true,options:[{optionKey:'a',label:'甲'},{optionKey:'b',label:'乙'}],rows:[],otherOptionKey:'b',otherMaxLength:123,materials:[{asset:{assetId:id(8),contentHash:'a'.repeat(64),mimeType:'application/pdf'},name:'Existing',rightsStatus:'self_authored',rightsNote:'Original'}]}]}]})
const makeRow=()=>{const d=definition();return {id:id(2),entry:'SCHOOL',organizationId:id(1),ownerUserId:id(3),kind:'FORM',title:'Synthetic',revision:1,definition:d,contentHash:privateToolContentHash('FORM','Synthetic',d)}}
let stored:ReturnType<typeof makeRow>
const input=(extra:Record<string,unknown>={})=>({format:'CSV' as const,content:'type,prompt,required,options\nSINGLE,新题,false,甲||乙',batchId:id(4),expectedRevision:stored.revision,expectedContentHash:stored.contentHash,...extra})
const preview=async(extra:Record<string,unknown>={})=>await importPrivateForm(c,id(2),input(extra)) as {ok:boolean;digest:string;previewToken:string;previewExpiresAt:number;issues:unknown[]}
const proof=(value:Awaited<ReturnType<typeof preview>>,extra:Record<string,unknown>={})=>({...input(extra),digest:value.digest,previewToken:value.previewToken,previewExpiresAt:value.previewExpiresAt})
beforeEach(()=>{
 vi.clearAllMocks();stored=makeRow()
 m.query.mockResolvedValue([{organizationId:id(1),organizationName:'Synthetic',membershipId:id(5),orgRole:'MEMBER',productAdmin:false}])
 m.find.mockImplementation(async({where}:{where:Record<string,unknown>})=>Object.entries(where).every(([k,v])=>stored[k as keyof typeof stored]===v)?structuredClone(stored):null)
 m.images.mockResolvedValue([]);m.sync.mockResolvedValue(undefined)
 m.update.mockImplementation(async({where,data}:{where:Record<string,unknown>;data:Record<string,unknown>})=>{
  if(!Object.entries(where).every(([k,v])=>stored[k as keyof typeof stored]===v))return {count:0}
  stored={...stored,...data,revision:stored.revision+1} as typeof stored;return {count:1}
 })
})
describe('School append-only private form import',()=>{
 it.each(['CSV','TEXT'] as const)('%s previews without writes and appends once, retaining all existing content and media',async format=>{
  const extra={format,...(format==='TEXT'?{content:'新题\n甲\n乙\n\n补充记录'}:{})},before=structuredClone(stored),p=await preview(extra),request=proof(p,extra)
  expect(p.ok).toBe(true);expect(stored).toEqual(before);expect(m.update).not.toHaveBeenCalled();expect(m.sync).not.toHaveBeenCalled()
  expect(await importPrivateForm(c,id(2),request,true)).toMatchObject({revision:2,canPublish:false,kind:'FORM',importedCount:format==='CSV'?1:2})
  expect(stored.definition.pages[0]).toEqual(before.definition.pages[0]);expect(stored.definition.pages).toHaveLength(2)
  expect(m.images).toHaveBeenCalledWith(expect.anything(),c,id(2),'FORM',expect.objectContaining({pages:expect.any(Array)}))
  expect(m.sync).toHaveBeenCalledTimes(1)
  await expect(importPrivateForm(c,id(2),request,true)).rejects.toMatchObject({code:'PRIVATE_TOOL_REVISION_CONFLICT'})
  expect(m.update).toHaveBeenCalledTimes(1)
 })
 it('can append to an explicit existing group and keeps incomplete existing draft questions untouched',async()=>{
  stored.definition.pages[0].questions[0].prompt='';stored.contentHash=privateToolContentHash('FORM',stored.title,stored.definition)
  const before=structuredClone(stored.definition.pages[0].questions),extra={targetPageKey:'existing'},p=await preview(extra)
  expect(p.ok).toBe(true)
  await importPrivateForm(c,id(2),proof(p,extra),true)
  expect(stored.definition.pages).toHaveLength(1);expect(stored.definition.pages[0].questions[0]).toEqual(before[0])
  expect(stored.definition.pages[0].questions).toHaveLength(2)
 })
 it('shares Survey parsing, question mapping and stable identity rules',()=>{
  const batch={format:'CSV' as const,content:'type,prompt,required,options,rows\nMATRIX,评价,true,甲||乙,第一行||第二行',batchId:id(4)}
  const p=previewBulk(batch,'FORM',2),survey=applyBulk('FORM',{schemaVersion:2,pages:[]},batch,p.digest) as FormDraft
  const school=planPrivateFormImport(definition(),input(batch)).definition
  expect(school.pages[1].questions).toEqual(survey.pages[0].questions)
 })
 it.each(['type,prompt,options\nSINGLE,坏题,只有一个','type,prompt\nUNKNOWN,坏题','prompt\n缺少表头','type,prompt\nTEXT,"未闭合'])('returns actionable parse errors and no confirmation proof: %s',async content=>{
  const before=structuredClone(stored),p=await preview({content})
  expect(p.ok).toBe(false);expect(p.issues.length).toBeGreaterThan(0);expect(p).not.toHaveProperty('previewToken')
  expect(stored).toEqual(before);expect(m.update).not.toHaveBeenCalled()
 })
 it('reports physical text block lines, including leading and repeated blank lines',async()=>{
  const p=await preview({format:'TEXT',content:'\n\n第一题\n\n\n第二题\n只有一个选项'})
  expect(p.issues).toContainEqual({line:6,message:'选择题至少需要两个选项'})
 })
 it('retains physical CSV row errors after quoted multiline cells',async()=>{
  const p=await preview({content:'type,prompt,options\nTEXT,"两行\n题干",\nSINGLE,少选项,甲'})
  expect(p.issues).toContainEqual({line:4,message:'选择题至少需要两项选项'})
 })
 it('enforces new/total field and group limits, splitting a legal batch into groups of 80',async()=>{
  const content='type,prompt\n'+Array.from({length:200},(_,i)=>`TEXT,新题${i}`).join('\n')
  const p=planPrivateFormImport(stored.definition,input({content}))
  expect(p.ok).toBe(true);expect(p.definition.pages.map(page=>page.questions.length)).toEqual([1,80,80,40])
  expect((await preview({content:content+'\nTEXT,超限'})).ok).toBe(false)
  expect((await preview({content,targetPageKey:'existing'})).ok).toBe(false)
  stored.definition.pages=Array.from({length:40},(_,i)=>({...definition().pages[0],pageKey:'p'+i,questions:[]}))
  stored.contentHash=privateToolContentHash('FORM',stored.title,stored.definition)
  expect((await preview()).ok).toBe(false)
  stored.definition.pages=Array.from({length:7},(_,i)=>({pageKey:'p'+i,title:'Group',questions:Array.from({length:70},(_,j)=>({itemKey:'q'+i+'_'+j,type:'SHORT_TEXT' as const,prompt:'Existing',required:true,options:[],rows:[]}))}))
  stored.contentHash=privateToolContentHash('FORM',stored.title,stored.definition)
  expect((await preview({content:'type,prompt,options,rows\nMATRIX,超量,甲||乙,'+Array.from({length:20},(_,i)=>'行'+i).join('||')})).ok).toBe(false)
 })
 it('rejects missing target, reused batch identities and professional types in V1 without changing the schema',async()=>{
  expect((await preview({targetPageKey:'missing'})).ok).toBe(false)
  const p=await preview();await importPrivateForm(c,id(2),proof(p),true)
  expect((await preview()).ok).toBe(false)
  stored.definition.schemaVersion=1;stored.contentHash=privateToolContentHash('FORM',stored.title,stored.definition)
  const old=structuredClone(stored)
  expect((await preview({batchId:id(6),content:'type,prompt\nDATE,日期'})).ok).toBe(false)
  expect(stored).toEqual(old)
 })
 it('checks current authority and exact ownership/product scope on both stages',async()=>{
  await expect(importPrivateForm({...c,principal:{...c.principal,accountDomain:'TRAINING' as never}},id(2),input())).rejects.toMatchObject({code:'PRIVATE_TOOL_AUTHOR_REQUIRED'})
  for(const changed of [{...c,organizationId:id(7)},{...c,principal:{...c.principal,userId:id(7)}}])await expect(importPrivateForm(changed,id(2),input())).rejects.toMatchObject({code:'PRIVATE_TOOL_NOT_FOUND'})
  await expect(importPrivateForm({...c,entry:'TEACHER'},id(2),input())).rejects.toMatchObject({code:'PRIVATE_TOOL_FORM_IMPORT_NOT_AVAILABLE'})
  const p=await preview();m.query.mockResolvedValue([])
  await expect(importPrivateForm(c,id(2),proof(p),true)).rejects.toMatchObject({code:'PRIVATE_TOOL_AUTHOR_REQUIRED'})
  expect(m.update).not.toHaveBeenCalled()
 })
 it('binds confirmation to content, format, destination, batch, scope and saved revision',async()=>{
  const p=await preview(),request=proof(p)
  for(const extra of [{content:request.content+'\nTEXT,另一题'},{targetPageKey:'existing'},{batchId:id(7)},{previewToken:'0'.repeat(64)},{previewExpiresAt:1}])
   await expect(importPrivateForm(c,id(2),{...request,...extra},true)).rejects.toMatchObject({code:'PRIVATE_TOOL_FORM_IMPORT_PREVIEW_EXPIRED'})
  // Reinterpreting this CSV as TEXT is invalid before proof comparison.
  await expect(importPrivateForm(c,id(2),{...request,format:'TEXT'},true)).rejects.toMatchObject({code:'PRIVATE_TOOL_FORM_IMPORT_INVALID'})
  stored.ownerUserId=id(7)
  await expect(importPrivateForm({...c,principal:{...c.principal,userId:id(7)}},id(2),request,true)).rejects.toMatchObject({code:'PRIVATE_TOOL_FORM_IMPORT_PREVIEW_EXPIRED'})
  stored.ownerUserId=id(3);stored.revision++
  await expect(importPrivateForm(c,id(2),request,true)).rejects.toMatchObject({code:'PRIVATE_TOOL_REVISION_CONFLICT'})
  expect(m.update).not.toHaveBeenCalled()
 })
 it('rejects non-form tools, oversized UTF-8 input and forged scope or replacement fields',async()=>{
  for(const extra of [{ownerUserId:id(7)},{entry:'TEACHER'},{replace:true},{definition:{pages:[]}}])await expect(importPrivateForm(c,id(2),input(extra))).rejects.toMatchObject({name:'ZodError'})
  await expect(importPrivateForm(c,id(2),input({content:'中'.repeat(70000)}))).rejects.toMatchObject({code:'PRIVATE_TOOL_FORM_IMPORT_INVALID'})
  stored.kind='SCALE'
  await expect(preview()).rejects.toMatchObject({code:'PRIVATE_TOOL_FORM_REQUIRED'})
  expect(m.update).not.toHaveBeenCalled()
 })
 it('does not report success or synchronize media after an atomic compare-and-swap loss',async()=>{
  const p=await preview();m.update.mockResolvedValueOnce({count:0})
  await expect(importPrivateForm(c,id(2),proof(p),true)).rejects.toMatchObject({code:'PRIVATE_TOOL_REVISION_CONFLICT'})
  expect(m.sync).not.toHaveBeenCalled()
 })
})
