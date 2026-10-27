import {createHash,createHmac,timingSafeEqual} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {config} from '../../config'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {parseText,parseCsv,type ImportIssue} from '../assessment-core/form/import-parser'
import {formImportQuestions,formImportIssues,formImportKey} from '../assessment-core/form/import-builder'
import {assessmentKeySchema} from '../assessment-core/definition-primitives'
import {formDraftSchema,validateFormDefinition,formAnswerFieldCount,type FormDraft} from '../assessment-core/form/definition'
import {authorizePrivateTool,privateToolScope} from './private-tool.access'
import {privateToolId,privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {privateToolContentHash,privateToolDefinition} from './private-tool.definition'
import {assertPrivateToolImages,syncPrivateToolDraftImages} from './private-tool.media'

const hash=z.string().regex(/^[a-f0-9]{64}$/),protocol='education-private-form-import-v1',ttl=10*60*1000
export const privateFormImportInput=z.object({format:z.enum(['CSV','TEXT']),content:z.string().min(1).max(200000),batchId:z.string().guid(),
 targetPageKey:assessmentKeySchema.optional(),expectedRevision:z.number().int().positive(),expectedContentHash:hash}).strict()
export const privateFormImportApplyInput=privateFormImportInput.extend({digest:hash,previewToken:hash,previewExpiresAt:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).strict()
type Input=z.infer<typeof privateFormImportInput>
const sign=(digest:string,expires:number)=>createHmac('sha256',config.assetSigningSecret).update(protocol+'\0').update(digest).update('\0').update(String(expires)).digest('hex')
const equal=(a:string,b:string)=>timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'))
const boundary={visibility:'AUTHOR_PRIVATE',snapshotOnly:true,canPublish:false,canShare:false,canReadParticipantReports:false} as const

/** Only append new stable identities. Never validate/normalize away an existing
 * incomplete draft, option reference, media reference or frozen version. */
export function planPrivateFormImport(definition:unknown,input:Input){
 const form=formDraftSchema.parse(definition)
 if(Buffer.byteLength(input.content,'utf8')>200000)privateToolFail('PRIVATE_TOOL_FORM_IMPORT_INVALID',400,[{line:1,message:'导入内容不能超过 200000 字节'}])
 const parsed=input.format==='CSV'?parseCsv(input.content):parseText(input.content)
 const issues:ImportIssue[]=[...parsed.issues,...formImportIssues(parsed.rows,form.schemaVersion)]
 if(parsed.rows.length>200)return {ok:false,issues,count:parsed.rows.length,totalQuestions:form.pages.reduce((n,p)=>n+p.questions.length,0),totalFields:formAnswerFieldCount(form),items:[],groups:[],definition:form}
 const questions=formImportQuestions(parsed.rows,input.batchId)
 const groups:FormDraft['pages']=[]
 for(let start=0;start<questions.length;start+=80)groups.push({pageKey:formImportKey(input.batchId,'page'+start),title:'导入题目'+(questions.length>80?' '+(groups.length+1):''),questions:questions.slice(start,start+80)})
 // Validate imported content strictly, without requiring existing unfinished
 // questions to pass the separate preview/freeze gate.
 const checked=validateFormDefinition({schemaVersion:form.schemaVersion,pages:groups},{forPreview:true})
 for(const issue of checked.issues.filter(issue=>issue.severity==='error')){
  const path=/^pages\.(\d+)\.questions\.(\d+)/.exec(issue.path)
  const row=path?parsed.rows[Number(path[1])*80+Number(path[2])]:undefined
  issues.push({line:row?.sourceLine??1,message:issue.message})
 }
 const allKeys=new Set(form.pages.flatMap(page=>[page.pageKey,...page.questions.flatMap(q=>[q.itemKey,...q.options.map(o=>o.optionKey),...q.rows.map(r=>r.rowKey)])]))
 if([...groups.map(p=>p.pageKey),...questions.flatMap(q=>[q.itemKey,...q.options.map(o=>o.optionKey),...q.rows.map(r=>r.rowKey)])].some(key=>allKeys.has(key)))
  issues.push({line:1,message:'此批次的题目已存在，请重新读取草稿核对，不要重复导入'})
 const target=input.targetPageKey?form.pages.find(page=>page.pageKey===input.targetPageKey):undefined
 if(input.targetPageKey&&!target)issues.push({line:1,message:'目标分组已不存在，请重新读取草稿'})
 if(target&&target.questions.length+questions.length>80)issues.push({line:1,message:'每个分组最多 80 题，请选择“新建导入分组”'})
 const next:FormDraft={...form,pages:target?form.pages.map(page=>page===target?{...page,questions:[...page.questions,...questions]}:page):[...form.pages,...groups]}
 if(next.pages.length>40)issues.push({line:1,message:'表单最多 40 个分组，请减少导入内容或选择现有分组'})
 const totalFields=formAnswerFieldCount(next)
 if(totalFields>500)issues.push({line:1,message:'导入后超过 500 个作答字段；矩阵每行及其他填写各计 1 个字段'})
 if(Buffer.byteLength(JSON.stringify(next),'utf8')>512000)issues.push({line:1,message:'导入后超过现有草稿的 512000 字节保存限制'})
 return {ok:issues.length===0,issues,count:questions.length,totalQuestions:next.pages.reduce((n,p)=>n+p.questions.length,0),totalFields,
  items:parsed.rows.map(row=>({line:row.sourceLine,type:row.type,prompt:row.prompt,required:row.required,options:row.options,rows:row.rows})),
  groups:target?[{title:target.title,addedCount:questions.length}]:groups.map(page=>({title:page.title,addedCount:page.questions.length})),definition:next}
}
export async function importPrivateForm(c:PrivateToolContext,id:string,raw:unknown,apply=false){
 privateToolId.parse(id)
 const input=(apply?privateFormImportApplyInput:privateFormImportInput).parse(raw),proof=apply?privateFormImportApplyInput.parse(input):null
 // Enable the new adapter only on School. Teacher's existing feature surface is unchanged.
 if(c.entry!=='SCHOOL')privateToolFail('PRIVATE_TOOL_FORM_IMPORT_NOT_AVAILABLE',403)
 return prisma.$transaction(async tx=>{
  await authorizePrivateTool(tx,c,apply)
  if(apply)await tx.$queryRaw(Prisma.sql`SELECT id FROM education_private_tools WHERE id=${id} AND entry=${c.entry} AND organization_id=${c.organizationId} AND owner_user_id=${c.principal.userId} FOR UPDATE`)
  const scope=privateToolScope(c),row=await tx.educationPrivateTool.findFirst({where:{id,...scope}})
  if(!row)privateToolFail('PRIVATE_TOOL_NOT_FOUND',404)
  if(row.kind!=='FORM')privateToolFail('PRIVATE_TOOL_FORM_REQUIRED',400)
  if(row.contentHash!==privateToolContentHash('FORM',row.title,row.definition))privateToolFail('PRIVATE_TOOL_HASH_MISMATCH')
  if(row.revision!==input.expectedRevision||row.contentHash!==input.expectedContentHash)privateToolFail('PRIVATE_TOOL_REVISION_CONFLICT')
  if(proof&&(proof.previewExpiresAt<=Date.now()||proof.previewExpiresAt>Date.now()+ttl||!equal(proof.previewToken,sign(proof.digest,proof.previewExpiresAt))))privateToolFail('PRIVATE_TOOL_FORM_IMPORT_PREVIEW_EXPIRED')
  const {definition:planned,...preview}=planPrivateFormImport(row.definition,input)
  if(!preview.ok){if(apply)privateToolFail('PRIVATE_TOOL_FORM_IMPORT_INVALID',400,preview.issues);return preview}
  const definition=privateToolDefinition('FORM',planned)
  const media=await assertPrivateToolImages(tx,c,id,'FORM',definition)
  const digest=canonicalHash({protocol,id,...scope,accountDomain:c.principal.accountDomain,revision:row.revision,baseContentHash:row.contentHash,
   format:input.format,batchId:input.batchId,targetPageKey:input.targetPageKey??null,contentHash:createHash('sha256').update(input.content,'utf8').digest('hex'),nextDefinitionHash:canonicalHash(definition)})
  const previewExpiresAt=Date.now()+ttl
  if(!apply)return {...preview,digest,previewToken:sign(digest,previewExpiresAt),previewExpiresAt,expectedRevision:row.revision,expectedContentHash:row.contentHash}
  if(!proof||!equal(proof.digest,digest)||proof.previewExpiresAt<=Date.now())privateToolFail('PRIVATE_TOOL_FORM_IMPORT_PREVIEW_EXPIRED')
  const contentHash=privateToolContentHash('FORM',row.title,definition)
  const result=await tx.educationPrivateTool.updateMany({where:{id,...scope,revision:row.revision,contentHash:row.contentHash},data:{definition:definition as Prisma.InputJsonValue,contentHash,revision:{increment:1}}})
  if(result.count!==1)privateToolFail('PRIVATE_TOOL_REVISION_CONFLICT')
  await syncPrivateToolDraftImages(tx,id,media)
  return {...row,definition,contentHash,revision:row.revision+1,importedCount:preview.count,...boundary}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
