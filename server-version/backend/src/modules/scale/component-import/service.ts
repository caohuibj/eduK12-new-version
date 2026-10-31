import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../../config/database'
import {assertStandardSystem,type StandardRelease} from '../../survey/standard-triplet.service'
import {AdminPermissionError} from '../../admin-permissions/service'
import {canonicalHash} from '../../assessment-runtime/canonical'
import {parseComponentWorkbook} from './excel'
import {parseComponentDraft,type ComponentDraft} from './contract'

export type ComponentDraftRow={id:string;tool_key:string;configuration_name:string;base_combination_id:string|null;base_combination_hash:string|null;changed_parts:ComponentDraft['changedParts'];revision:number;request_digest:string;published_release_id:string|null;created_by:string;updated_by:string;created_at:Date;updated_at:Date}
export const draftView=(r:ComponentDraftRow)=>({id:r.id,revision:r.revision,publishedReleaseId:r.published_release_id,updatedAt:r.updated_at,
 toolKey:r.tool_key,configurationName:r.configuration_name,baseCombination:r.base_combination_id?{releaseId:r.base_combination_id,combinationHash:r.base_combination_hash!}:null,changedParts:r.changed_parts})
export const componentFail=(status:number,message:string):never=>{throw new AdminPermissionError(status,message)}
async function parseFile(buffer:Buffer){try{return await parseComponentWorkbook(buffer)}catch(e){return componentFail(400,e instanceof Error?e.message:'Excel格式错误')}}
async function checkBase(tx:Prisma.TransactionClient,draft:ComponentDraft){
 if(!draft.baseCombination)return
 const [base]=await tx.$queryRaw<StandardRelease[]>`SELECT * FROM survey_standard_releases WHERE id=${draft.baseCombination.releaseId} FOR SHARE`
 if(!base||base.tool_key!==draft.toolKey||base.combination_hash!==draft.baseCombination.combinationHash)componentFail(409,'基础组合身份不匹配，请选择明确的同量表配置')
}
export async function previewComponentImport(actor:string,buffer:Buffer){
 await assertStandardSystem(prisma,actor)
 const result=await parseFile(buffer)
 return {...result,entries:result.entries.map(({draft,...entry})=>({...entry,configurationName:draft?.configurationName,baseCombination:draft?.baseCombination,changedParts:draft?Object.keys(draft.changedParts):[],draftDigest:draft?canonicalHash(draft):null}))}
}
export async function saveComponentImport(actor:string,input:{requestId:string;expectedDigest:string;buffer:Buffer}){
 await assertStandardSystem(prisma,actor)
 const parsed=await parseFile(input.buffer)
 if(parsed.digest!==input.expectedDigest)componentFail(409,'文件与预览摘要不同，请重新预览')
 const existing=await prisma.$queryRaw<Array<{request_digest:string}>>`SELECT request_digest FROM scale_component_drafts WHERE request_id=${input.requestId} LIMIT 1`
 if(existing[0]&&existing[0].request_digest!==parsed.digest)componentFail(409,'同请求编号不能换用另一份导入内容')
 const entries=[]
 for(const entry of parsed.entries){
  if(!entry.draft||entry.issues.length){entries.push({index:entry.index,toolKey:entry.toolKey,status:'INVALID',issues:entry.issues});continue}
  try{
   const draft=entry.draft
   const result=await prisma.$transaction(async tx=>{
    await assertStandardSystem(tx,actor)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'scale-component-import:'+input.requestId}))`
    const prior=await tx.$queryRaw<ComponentDraftRow[]>`SELECT * FROM scale_component_drafts WHERE request_id=${input.requestId} ORDER BY request_index FOR SHARE`
    if(prior.some(r=>r.request_digest!==parsed.digest||r.created_by!==actor))componentFail(409,'请求编号已用于另一份导入意图')
    const same=prior.find((r:ComponentDraftRow&{request_index?:number})=>r.request_index===entry.index)
    if(same)return {status:'EXISTING',draft:draftView(same)}
    await checkBase(tx,draft)
    const id=randomUUID(),[row]=await tx.$queryRaw<ComponentDraftRow[]>`INSERT INTO scale_component_drafts(id,tool_key,configuration_name,base_combination_id,base_combination_hash,changed_parts,request_id,request_index,request_digest,created_by,updated_by)
      VALUES(${id},${draft.toolKey},${draft.configurationName},${draft.baseCombination?.releaseId??null},${draft.baseCombination?.combinationHash??null},${JSON.stringify(draft.changedParts)}::jsonb,${input.requestId},${entry.index},${parsed.digest},${actor},${actor}) RETURNING *`
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:actor,action:'SCALE_COMPONENT_DRAFT_IMPORTED',metadata:{draftId:id,requestId:input.requestId,digest:parsed.digest,index:entry.index}}})
    return {status:'IMPORTED',draft:draftView(row)}
   },{timeout:15000})
   entries.push({index:entry.index,toolKey:entry.toolKey,...result,issues:[]})
  }catch(e){
   if(e instanceof AdminPermissionError&&e.statusCode===403)throw e
   entries.push({index:entry.index,toolKey:entry.toolKey,status:'FAILED',issues:[{sheet:'基本信息',row:entry.index+2,path:'baseCombination',message:e instanceof AdminPermissionError?e.message:'保存结果需核对，请用原请求编号重试'}]})
  }
 }
 return {digest:parsed.digest,entries}
}
export async function readComponentDraft(actor:string,id:string){
 await assertStandardSystem(prisma,actor)
 const [r]=await prisma.$queryRaw<ComponentDraftRow[]>`SELECT * FROM scale_component_drafts WHERE id=${id}`
 if(!r)return componentFail(404,'草稿不存在')
 return draftView(r)
}
export async function listComponentDrafts(actor:string,page:number){
 await assertStandardSystem(prisma,actor)
 const rows=await prisma.$queryRaw<Array<{id:string;tool_key:string;configuration_name:string;revision:number;published_release_id:string|null;updated_at:Date}>>`SELECT id,tool_key,configuration_name,revision,published_release_id,updated_at FROM scale_component_drafts ORDER BY created_at DESC,id DESC LIMIT 26 OFFSET ${(page-1)*25}`
 return {page,hasMore:rows.length>25,list:rows.slice(0,25).map(r=>({id:r.id,toolKey:r.tool_key,configurationName:r.configuration_name,revision:r.revision,publishedReleaseId:r.published_release_id,updatedAt:r.updated_at}))}
}
export async function editComponentDraft(actor:string,id:string,input:{expectedRevision:number;draft:unknown}){
 const draft=parseComponentDraft(input.draft)
 return prisma.$transaction(async tx=>{
  await assertStandardSystem(tx,actor)
  const [row]=await tx.$queryRaw<ComponentDraftRow[]>`SELECT * FROM scale_component_drafts WHERE id=${id} FOR UPDATE`
  if(!row)return componentFail(404,'草稿不存在')
  if(row.published_release_id)componentFail(409,'已批准版本不可编辑，请创建新版本')
  if(row.revision!==input.expectedRevision||row.tool_key!==draft.toolKey)componentFail(409,'草稿修订或量表身份不同，请刷新核对')
  await checkBase(tx,draft)
  const [updated]=await tx.$queryRaw<ComponentDraftRow[]>`UPDATE scale_component_drafts SET configuration_name=${draft.configurationName},base_combination_id=${draft.baseCombination?.releaseId??null},base_combination_hash=${draft.baseCombination?.combinationHash??null},changed_parts=${JSON.stringify(draft.changedParts)}::jsonb,revision=revision+1,updated_by=${actor},updated_at=clock_timestamp() WHERE id=${id} RETURNING *`
  await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:actor,action:'SCALE_COMPONENT_DRAFT_EDITED',metadata:{draftId:id,revision:updated.revision,digest:canonicalHash(draft)}}})
  return draftView(updated)
 })
}
