import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {retainAssessmentAssetReferences} from '../assessment-media/assessment-asset'
import {authorizedProject,SurveyBuilderError} from './builder.service'
import {assertSurveyDraft,initialSurveyDefinition,SurveyDraftError,type SurveyKind} from './builder.definition'
import {previewResearchInstrument,type PreviewAnswers} from './builder.compiler'
import {previewBulk,applyBulk,type BulkInput} from './builder.import'
import {dryRunSurveyForm,SurveyFinalValidationError} from './final.compute'
import {researcherCatalog,catalogSnapshotsForDrafts} from './catalog.service'
import {assertSurveyMediaOwned} from './media.references'

type Tx=Prisma.TransactionClient
export const toolKind=z.enum(['FORM','SCALE','COMPOSITION'])
export const toolReference=z.object({source:z.enum(['owned','granted']),id:z.string().uuid(),revision:z.number().int().nonnegative().optional(),title:z.string().max(200).optional()}).strict()
export const compositionDefinition=z.object({schemaVersion:z.literal(1),items:z.array(toolReference).max(20)}).strict()
export type ToolReference=z.infer<typeof toolReference>
export type Template={id:string;owner_user_id:string;kind:'FORM'|'SCALE'|'COMPOSITION';title:string;definition:any;revision:number;status:string;creation_digest:string;created_at:Date;updated_at:Date}
const fail=(status:number,message:string):never=>{throw new SurveyBuilderError(status,message)}
const view=(row:Template)=>({id:row.id,kind:row.kind,title:row.title,definition:row.definition,revision:row.revision,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at})
export async function authorizeToolOwner(tx:Tx,userId:string){
  const rows=await tx.$queryRaw<Array<{expires_at:Date|null;checked_at:Date}>>`
    WITH locked AS MATERIALIZED (
      SELECT u.expires_at FROM users u JOIN survey_researcher_grants g ON g.user_id=u.id
      JOIN survey_mfa_credentials m ON m.user_id=u.id
      WHERE u.id=${userId} AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
      AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp()) AND g.status='ACTIVE' AND m.enabled
      FOR SHARE OF u,g,m
    ) SELECT locked.*,clock_timestamp() AS checked_at FROM locked`
  if(!rows[0]||(rows[0].expires_at&&rows[0].expires_at<=rows[0].checked_at))fail(403,'研究者资格不可用')
}
export async function ownedTemplate(tx:Tx,userId:string,id:string,lock=false){
  const rows=await tx.$queryRaw<Template[]>`SELECT * FROM survey_tool_templates WHERE id=${id} AND owner_user_id=${userId} ${lock?Prisma.sql`FOR SHARE`:Prisma.empty}`
  if(!rows.length)fail(404,'工具不存在')
  return rows[0]
}
const json=(value:unknown)=>JSON.stringify(value)
export async function listTemplates(userId:string,input:{page:number;query:string;kind:string}){
  return prisma.$transaction(async tx=>{
    await authorizeToolOwner(tx,userId)
    const filter=Prisma.sql`owner_user_id=${userId} AND status='DRAFT' AND (${input.kind}='' OR kind=${input.kind}) AND position(lower(${input.query}) in lower(title))>0`
    const list=await tx.$queryRaw<Template[]>`SELECT id,kind,title,revision,status,created_at,updated_at FROM survey_tool_templates WHERE ${filter} ORDER BY updated_at DESC,id LIMIT 12 OFFSET ${(input.page-1)*12}`
    const [count]=await tx.$queryRaw<Array<{total:bigint}>>`SELECT count(*) AS total FROM survey_tool_templates WHERE ${filter}`
    return {list:list.map(view),total:Number(count.total),page:input.page,pageSize:12}
  })
}
export async function getTemplate(userId:string,id:string){return prisma.$transaction(async tx=>{await authorizeToolOwner(tx,userId);return view(await ownedTemplate(tx,userId,id))})}
export async function createTemplate(userId:string,input:{requestId:string;kind:Template['kind'];title:string}){
  return prisma.$transaction(async tx=>{
    await authorizeToolOwner(tx,userId)
    const digest=canonicalHash(input)
    const definition=input.kind==='COMPOSITION'?{schemaVersion:1,items:[]}:input.kind==='FORM'?{schemaVersion:2,pages:[]}:initialSurveyDefinition(input.kind)
    // INSERT conflict is resolved only against the same owner and exact original request.
    await tx.$executeRaw`INSERT INTO survey_tool_templates(id,owner_user_id,kind,title,definition,creation_digest)
      VALUES (${input.requestId},${userId},${input.kind},${input.title},${json(definition)}::jsonb,${digest}) ON CONFLICT(id) DO NOTHING`
    const row=await ownedTemplate(tx,userId,input.requestId)
    if(row.creation_digest!==digest)fail(409,'创建请求已用于其他工具')
    return view(row)
  })
}
function definitionFor(kind:Template['kind'],definition:unknown){
  return kind==='COMPOSITION'?compositionDefinition.parse(definition):assertSurveyDraft(kind,definition)
}
export async function saveTemplate(userId:string,id:string,input:{revision:number;title:string;definition:unknown}){
  return prisma.$transaction(async tx=>{
    await authorizeToolOwner(tx,userId)
    const row=await ownedTemplate(tx,userId,id)
    const definition=definitionFor(row.kind,input.definition)
    // Validate reference ownership even for an unfinished composition; no nested bundles.
    if(row.kind==='COMPOSITION')await resolveItems(tx,userId,compositionDefinition.parse(definition).items,false)
    const changed=await tx.$executeRaw`UPDATE survey_tool_templates SET title=${input.title},definition=${json(definition)}::jsonb,revision=revision+1,updated_at=clock_timestamp()
      WHERE id=${id} AND owner_user_id=${userId} AND revision=${input.revision} AND status='DRAFT'`
    if(changed!==1)fail(409,'工具版本或状态已变化，请重新读取；本地修改仍保留')
    return view(await ownedTemplate(tx,userId,id))
  })
}
export async function archiveTemplate(userId:string,id:string,revision:number){return prisma.$transaction(async tx=>{
  await authorizeToolOwner(tx,userId)
  const changed=await tx.$executeRaw`UPDATE survey_tool_templates SET status='ARCHIVED',revision=revision+1,updated_at=clock_timestamp() WHERE id=${id} AND owner_user_id=${userId} AND revision=${revision} AND status='DRAFT'`
  if(changed!==1)fail(409,'工具状态或版本已变化')
  return {archived:true}
})}
type Resolved={kind:SurveyKind;title:string;definition:any;grantId?:string;scopeId?:string;sourceId:string;revision?:number}
async function resolveItems(tx:Tx,userId:string,items:ToolReference[],ready:boolean):Promise<Resolved[]>{
  if(ready&&!items.length)fail(400,'组合问卷至少选用一个工具')
  if(new Set(items.map(item=>item.source+':'+item.id)).size!==items.length)fail(400,'组合问卷不能重复选用同一工具')
  const grants=await catalogSnapshotsForDrafts(tx,userId,items.filter(item=>item.source==='granted').map(item=>item.id))
  const result:Resolved[]=[]
  // Stable order avoids opposite-order template locks in concurrent imports.
  const owned=new Map<string,Template>()
  for(const id of items.filter(item=>item.source==='owned').map(item=>item.id).sort())owned.set(id,await ownedTemplate(tx,userId,id,ready))
  for(const item of items){
    if(item.source==='granted'){
      const source=grants.get(item.id)!
      result.push({kind:source.ref.kind,title:source.title,definition:source.displayDefinition,grantId:item.id,sourceId:item.id})
    }else{
      const row=owned.get(item.id)!
      if(row.kind==='COMPOSITION'||row.status!=='DRAFT')fail(409,'请选择可用的表单或量表；普通组合问卷不嵌套组合包')
      if(item.revision!==row.revision)fail(409,'选用的工具已更新，请重新选择当前修订')
      const kind=z.enum(['FORM','SCALE']).parse(row.kind)
      if(ready){
        const check=previewResearchInstrument({kind,instrumentKey:'library_tool',title:row.title,definition:row.definition})
        if(!check.ok)throw new SurveyDraftError(check.issues)
        await assertSurveyMediaOwned(tx,userId,row.id,[{kind,definition:row.definition}],true)
      }
      result.push({kind,title:row.title,definition:row.definition,scopeId:row.id,sourceId:row.id,revision:row.revision})
    }
  }
  return result
}
export async function catalogTemplates(userId:string,page:number){return prisma.$transaction(async tx=>{await authorizeToolOwner(tx,userId);return researcherCatalog(tx,userId,page)})}
export async function inspectTemplate(userId:string,id:string,answers?:PreviewAnswers){return prisma.$transaction(async tx=>{
  await authorizeToolOwner(tx,userId);const row=await ownedTemplate(tx,userId,id)
  if(row.kind==='COMPOSITION'){const units=await resolveItems(tx,userId,compositionDefinition.parse(row.definition).items,true);return {ok:true,issues:[],unitCount:units.length,revision:row.revision}}
  return {...previewResearchInstrument({kind:row.kind,instrumentKey:'library_tool',title:row.title,definition:row.definition,answers}),revision:row.revision}
})}
export async function dryRunTemplate(userId:string,id:string,answers:unknown){return prisma.$transaction(async tx=>{
  await authorizeToolOwner(tx,userId);const row=await ownedTemplate(tx,userId,id)
  if(row.kind!=='FORM')fail(400,'仅表单支持试提交')
  try{return {ok:true,issues:[],...dryRunSurveyForm(row.definition,answers)}}catch(cause){if(cause instanceof SurveyFinalValidationError)return {ok:false,issues:[{path:cause.path,message:cause.message}],missing:[]};throw cause}
})}
export async function bulkTemplate(userId:string,id:string,batch:BulkInput,apply?:{revision:number;digest:string}){return prisma.$transaction(async tx=>{
  await authorizeToolOwner(tx,userId);const row=await ownedTemplate(tx,userId,id)
  if(row.kind==='COMPOSITION'||row.status!=='DRAFT')fail(409,'此工具不能批量录入')
  const kind=z.enum(['FORM','SCALE']).parse(row.kind)
  if(apply&&apply.revision!==row.revision)fail(409,'工具已变化，请重新预览导入')
  const candidate=previewBulk(batch,kind,(row.definition as {schemaVersion:1|2}).schemaVersion)
  if(!apply){if(candidate.ok)applyBulk(kind,row.definition,batch,candidate.digest);return {...candidate,revision:row.revision}}
  const definition=applyBulk(kind,row.definition,batch,apply.digest)
  const changed=await tx.$executeRaw`UPDATE survey_tool_templates SET definition=${json(definition)}::jsonb,revision=revision+1,updated_at=clock_timestamp() WHERE id=${id} AND owner_user_id=${userId} AND status='DRAFT' AND revision=${apply.revision}`
  if(changed!==1)fail(409,'工具已变化，请重新预览导入')
  return view(await ownedTemplate(tx,userId,id))
})}
export async function selectTemplate(userId:string,projectId:string,input:{requestId:string;tool:ToolReference}){
  return prisma.$transaction(async tx=>{
    await authorizedProject(tx,userId,projectId,true)
    await authorizeToolOwner(tx,userId)
    const digest=canonicalHash({projectId,tool:input.tool})
    const prior=await tx.$queryRaw<Array<{owner_user_id:string;project_id:string;request_digest:string;instrument_ids:string[]}>>`SELECT * FROM survey_tool_selections WHERE id=${input.requestId}`
    if(prior.length){
      if(prior[0].owner_user_id!==userId||prior[0].project_id!==projectId||prior[0].request_digest!==digest)fail(409,'选用请求冲突')
      return {instrumentIds:prior[0].instrument_ids,replayed:true}
    }
    let refs=[input.tool]
    if(input.tool.source==='owned'){
      const row=await ownedTemplate(tx,userId,input.tool.id,true)
      if(row.status!=='DRAFT'||row.revision!==input.tool.revision)fail(409,'工具已更新，请重新读取后选用')
      if(row.kind==='COMPOSITION')refs=compositionDefinition.parse(row.definition).items
    }
    const units=await resolveItems(tx,userId,refs,true),ids:string[]=[]
    for(const unit of units){
      const id=randomUUID();ids.push(id)
      await tx.surveyInstrumentDraft.create({data:{id,projectId,instrumentKey:'i_'+id.replace(/-/g,''),kind:unit.kind,title:unit.title,
        definition:unit.definition as Prisma.InputJsonValue,catalogGrantId:unit.grantId??null,
        ...(unit.kind==='SCALE'&&!unit.grantId?{authoringFamilyId:randomUUID(),authoringVersion:1}:{})}})
      if(unit.scopeId){
        const refs=await assertSurveyMediaOwned(tx,userId,unit.scopeId,[{kind:unit.kind,definition:unit.definition}],true)
        if(refs.length)await retainAssessmentAssetReferences({owner:{entityType:'SurveyProject',entityId:projectId,field:'tool-library'},references:refs,db:tx})
      }
    }
    await tx.$executeRaw`INSERT INTO survey_tool_selections(id,owner_user_id,project_id,request_digest,instrument_ids) VALUES (${input.requestId},${userId},${projectId},${digest},${json(ids)}::jsonb)`
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:userId,projectId,action:'LIBRARY_TOOLS_SELECTED',metadata:{tool:input.tool,units:units.map(unit=>({sourceId:unit.sourceId,revision:unit.revision??null,grantId:unit.grantId??null})),instrumentIds:ids}}})
    return {instrumentIds:ids,replayed:false}
  })
}

export async function copyProjectTool(userId:string,projectId:string,instrumentId:string,requestId:string){return prisma.$transaction(async tx=>{
  await authorizedProject(tx,userId,projectId,false)
  const source=await tx.surveyInstrumentDraft.findFirst({where:{id:instrumentId,projectId}})
  if(!source||source.catalogGrantId||!['FORM','SCALE'].includes(source.kind))fail(409,'仅本人自编表单和量表可以存入独立工具集')
  const digest=canonicalHash({projectId,instrumentId,revision:source!.revision})
  const refs=await assertSurveyMediaOwned(tx,userId,projectId,[{kind:source!.kind as SurveyKind,definition:source!.definition}])
  await tx.$executeRaw`INSERT INTO survey_tool_templates(id,owner_user_id,kind,title,definition,creation_digest) VALUES (${requestId},${userId},${source!.kind},${source!.title},${json(source!.definition)}::jsonb,${digest}) ON CONFLICT(id) DO NOTHING`
  const row=await ownedTemplate(tx,userId,requestId)
  if(row.creation_digest!==digest)fail(409,'存入工具集请求冲突')
  if(refs.length)await retainAssessmentAssetReferences({owner:{entityType:'SurveyToolTemplate',entityId:requestId,field:'tool-library'},references:refs,db:tx})
  return view(row)
})}
