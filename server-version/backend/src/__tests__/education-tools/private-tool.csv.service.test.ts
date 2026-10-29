import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({query:vi.fn(),find:vi.fn(),update:vi.fn(),images:vi.fn(),sync:vi.fn()}))
// Only persistence and media infrastructure are replaced. Authorization, input
// DTOs, canonical hashes, signing, CSV parser and native validation stay real.
vi.mock('../../config/database',()=>({prisma:{$transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>fn({
 $queryRaw:m.query,educationPrivateTool:{findFirst:m.find,updateMany:m.update},
})}}))
vi.mock('../../modules/education-tools/private-tool.media',()=>({assertPrivateToolImages:m.images,syncPrivateToolDraftImages:m.sync}))
import {importPrivateToolCsv} from '../../modules/education-tools/private-tool.csv.service'
import {privateToolContentHash} from '../../modules/education-tools/private-tool.definition'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
const org='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',owner='00000000-0000-4000-8000-000000000003'
const c:PrivateToolContext={principal:{userId:owner,accountDomain:'SCHOOL'},entry:'SCHOOL',organizationId:org}
const csv='item_code,prompt,reverse,score_keys,response_set_key\nq2,Second,true,total,default'
const definition=()=>compileResearchScale('Synthetic',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',
 responseOptions:[{optionKey:'a',label:'First',score:1},{optionKey:'b',label:'Second',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
 items:[{itemKey:'q',prompt:'Existing',required:true,reverse:false,dimensionKeys:['total']}]})
function makeRow(){const d=definition();return {id,entry:'SCHOOL',organizationId:org,ownerUserId:owner,kind:'SCALE',title:'Synthetic',revision:1,definition:d,contentHash:privateToolContentHash('SCALE','Synthetic',d)}}
let stored:ReturnType<typeof makeRow>
const input=(content=csv.replace('default',stored.definition.responseSets[0].key))=>({content,expectedRevision:stored.revision,expectedContentHash:stored.contentHash})
const preview=async()=>await importPrivateToolCsv(c,id,input()) as {digest:string;previewToken:string;previewExpiresAt:number}
const proof=(p:Awaited<ReturnType<typeof preview>>)=>({...input(),digest:p.digest,previewToken:p.previewToken,previewExpiresAt:p.previewExpiresAt})
describe('education private CSV real adapter contract',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();stored=makeRow()
  m.query.mockResolvedValue([{organizationId:org,organizationName:'Synthetic',membershipId:'member',orgRole:'MEMBER',productAdmin:true}])
  m.find.mockImplementation(async({where}:{where:Record<string,unknown>})=>Object.entries(where).every(([k,v])=>stored[k as keyof typeof stored]===v)?structuredClone(stored):null)
  m.images.mockResolvedValue([]);m.sync.mockResolvedValue(undefined)
  m.update.mockImplementation(async({where,data}:{where:Record<string,unknown>;data:Record<string,unknown>})=>{
   if(!Object.entries(where).every(([k,v])=>stored[k as keyof typeof stored]===v))return {count:0}
   stored={...stored,...data,revision:stored.revision+1} as typeof stored;return {count:1}
  })
 })
 it('previews without writes and applies complete saved DTO once, rejecting replay',async()=>{
  const before=structuredClone(stored),p=await preview(),request=proof(p)
  expect(stored).toEqual(before);expect(m.update).not.toHaveBeenCalled();expect(m.sync).not.toHaveBeenCalled()
  const result=await importPrivateToolCsv(c,id,request,true)
  expect(result).toMatchObject({id,revision:2,kind:'SCALE',importedCount:1,canPublish:false})
  expect(stored.definition.items).toHaveLength(2);expect(stored.definition.report).toEqual(before.definition.report)
  expect(stored.definition.scoring.itemRules.at(-1)).toMatchObject({itemCode:'q2',transform:{type:'reverse'}})
  expect(m.sync).toHaveBeenCalledTimes(1)
  await expect(importPrivateToolCsv(c,id,request,true)).rejects.toMatchObject({code:'PRIVATE_TOOL_REVISION_CONFLICT'})
  expect(m.update).toHaveBeenCalledTimes(1)
 })
 it('requires current educational capability, never a Training identity',async()=>{
  await expect(importPrivateToolCsv({...c,principal:{...c.principal,accountDomain:'TRAINING' as never}},id,input())).rejects.toMatchObject({code:'PRIVATE_TOOL_AUTHOR_REQUIRED'})
  expect(m.find).not.toHaveBeenCalled()
 })
 it('does not reveal another author or product entry draft',async()=>{
  for(const scope of [{...c,principal:{...c.principal,userId:'00000000-0000-4000-8000-000000000004'}},{...c,entry:'TEACHER' as const}])
   await expect(importPrivateToolCsv(scope,id,input())).rejects.toMatchObject({code:'PRIVATE_TOOL_NOT_FOUND'})
  expect(m.images).not.toHaveBeenCalled()
 })
 it('binds preflight to exact input and current content hash',async()=>{
  const p=await preview(),request=proof(p)
  await expect(importPrivateToolCsv(c,id,{...request,content:request.content.replace('Second','Changed')},true)).rejects.toMatchObject({code:'PRIVATE_TOOL_CSV_PREVIEW_EXPIRED'})
  await expect(importPrivateToolCsv(c,id,{...request,expectedContentHash:'a'.repeat(64)},true)).rejects.toMatchObject({code:'PRIVATE_TOOL_REVISION_CONFLICT'})
  expect(m.update).not.toHaveBeenCalled()
 })
 it('rejects expired and forged preview evidence',async()=>{
  const p=await preview()
  await expect(importPrivateToolCsv(c,id,{...proof(p),previewExpiresAt:1},true)).rejects.toMatchObject({code:'PRIVATE_TOOL_CSV_PREVIEW_EXPIRED'})
  await expect(importPrivateToolCsv(c,id,{...proof(p),previewToken:'0'.repeat(64)},true)).rejects.toMatchObject({code:'PRIVATE_TOOL_CSV_PREVIEW_EXPIRED'})
  expect(m.update).not.toHaveBeenCalled()
 })
 it.each(['q2,"broken,true,total,default','q2,Second,true,unknown,default','q2,Second,maybe,total,default','q2,Second,true,,default'])('rejects malformed or unsupported mapping without modifying draft: %s',async line=>{
  const before=structuredClone(stored)
  const content=('item_code,prompt,reverse,score_keys,response_set_key\n'+line).replaceAll('default',stored.definition.responseSets[0].key)
  await expect(importPrivateToolCsv(c,id,input(content))).rejects.toMatchObject({code:'PRIVATE_TOOL_CSV_INVALID'})
  expect(stored).toEqual(before);expect(m.update).not.toHaveBeenCalled()
 })
 it('rejects 201 total items and 51 shared options',async()=>{
  const lines=Array.from({length:200},(_,i)=>`n${i},Item,false,total,${stored.definition.responseSets[0].key}`)
  await expect(importPrivateToolCsv(c,id,input('item_code,prompt,reverse,score_keys,response_set_key\n'+lines.join('\n')))).rejects.toMatchObject({code:'PRIVATE_TOOL_CSV_INVALID'})
  stored.definition.responseSets[0].options=Array.from({length:51},(_,i)=>({value:`v${i}`,label:`Option ${i}`,score:i}))
  stored.contentHash=privateToolContentHash('SCALE',stored.title,stored.definition)
  await expect(importPrivateToolCsv(c,id,input())).rejects.toMatchObject({code:'PRIVATE_TOOL_CSV_INVALID'})
  expect(m.update).not.toHaveBeenCalled()
 })
 it('honors atomic compare-and-swap failure instead of reporting saved',async()=>{
  const p=await preview();m.update.mockResolvedValueOnce({count:0})
  await expect(importPrivateToolCsv(c,id,proof(p),true)).rejects.toMatchObject({code:'PRIVATE_TOOL_REVISION_CONFLICT'})
  expect(m.sync).not.toHaveBeenCalled()
 })
})
