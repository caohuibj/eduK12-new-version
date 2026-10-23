import {createHash,createHmac,timingSafeEqual} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {config} from '../../config'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {parseScaleImport,SCALE_IMPORT_MAX_BYTES,ScaleImportValidationError} from '../assessment-core/scale/import-parser'
import {authorizePrivateTool,privateToolScope} from './private-tool.access'
import {privateToolId,privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {privateToolContentHash,privateToolDefinition} from './private-tool.definition'
import {assertPrivateToolImages,syncPrivateToolDraftImages} from './private-tool.media'

const hash=z.string().regex(/^[a-f0-9]{64}$/)
export const privateToolCsvPreviewInput=z.object({content:z.string().min(1).max(SCALE_IMPORT_MAX_BYTES),
 expectedRevision:z.number().int().positive(),expectedContentHash:hash}).strict()
export const privateToolCsvApplyInput=privateToolCsvPreviewInput.extend({digest:hash,previewToken:hash,
 previewExpiresAt:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).strict()
const ttl=10*60*1000
const sign=(digest:string,expires:number)=>createHmac('sha256',config.assetSigningSecret)
 .update('education-private-scale-csv-v1\0').update(digest).update('\0').update(String(expires)).digest('hex')
const equal=(a:string,b:string)=>timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'))
const boundary={visibility:'AUTHOR_PRIVATE',snapshotOnly:true,canPublish:false,canShare:false,canReadParticipantReports:false} as const

/** The shared parser is pure; identity, current capability, draft revision and
 * media retention are checked here, never via Training or Survey endpoints. */
export async function importPrivateToolCsv(c:PrivateToolContext,id:string,raw:unknown,apply=false){
 privateToolId.parse(id)
 const input=(apply?privateToolCsvApplyInput:privateToolCsvPreviewInput).parse(raw)
 const proof=apply?privateToolCsvApplyInput.parse(input):null
 return prisma.$transaction(async tx=>{
  // Same lock order as all other private-tool mutations: organization, authority,
  // tool, media. Preview is read-only, including no issuance table/event writes.
  await authorizePrivateTool(tx,c,apply)
  if(apply)await tx.$queryRaw(Prisma.sql`SELECT id FROM education_private_tools WHERE id=${id} AND entry=${c.entry}
   AND organization_id=${c.organizationId} AND owner_user_id=${c.principal.userId} FOR UPDATE`)
  const scope=privateToolScope(c)
  const row=await tx.educationPrivateTool.findFirst({where:{id,...scope}})
  if(!row)privateToolFail('PRIVATE_TOOL_NOT_FOUND',404)
  if(row.kind!=='SCALE')privateToolFail('PRIVATE_TOOL_CSV_SCALE_REQUIRED',400)
  if(row.contentHash!==privateToolContentHash('SCALE',row.title,row.definition))privateToolFail('PRIVATE_TOOL_HASH_MISMATCH')
  if(row.revision!==input.expectedRevision||row.contentHash!==input.expectedContentHash)privateToolFail('PRIVATE_TOOL_REVISION_CONFLICT')
  if(proof&&(proof.previewExpiresAt<=Date.now()||proof.previewExpiresAt>Date.now()+ttl||!equal(proof.previewToken,sign(proof.digest,proof.previewExpiresAt))))
   privateToolFail('PRIVATE_TOOL_CSV_PREVIEW_EXPIRED')
  let parsed:ReturnType<typeof parseScaleImport>
  try{parsed=parseScaleImport(input.content,row.definition)}catch(error){
   if(error instanceof ScaleImportValidationError)privateToolFail('PRIVATE_TOOL_CSV_INVALID',400,error.issues.map(issue=>({path:`CSV:${issue.line}`,message:issue.message})))
   throw error
  }
  // Education authoring retains its stricter 50-option product boundary.
  if(parsed.definition.responseSets.some(set=>set.options.length>50))privateToolFail('PRIVATE_TOOL_CSV_INVALID',400,[{path:'responseSets',message:'教育量表共享选项最多 50 项'}])
  const definition=privateToolDefinition('SCALE',parsed.definition)
  const media=await assertPrivateToolImages(tx,c,id,'SCALE',definition)
  const digest=canonicalHash({protocol:'education-private-scale-csv-v1',id,...scope,accountDomain:c.principal.accountDomain,
   revision:row.revision,baseContentHash:row.contentHash,baseDefinitionHash:canonicalHash(row.definition),
   csvHash:createHash('sha256').update(input.content,'utf8').digest('hex'),nextDefinitionHash:canonicalHash(definition)})
  const previewExpiresAt=Date.now()+ttl
  if(!apply)return {digest,previewToken:sign(digest,previewExpiresAt),previewExpiresAt,expectedRevision:row.revision,
   expectedContentHash:row.contentHash,count:parsed.count,totalItems:parsed.definition.items.length,
   responseSetKey:parsed.definition.responseSets[0].key,responseSet:parsed.definition.responseSets[0],
   scores:parsed.definition.scoring.scores.map(score=>({key:score.key,label:score.label,aggregation:score.source.aggregation})),items:parsed.items}
  if(!proof||!equal(proof.digest,digest)||proof.previewExpiresAt<=Date.now())privateToolFail('PRIVATE_TOOL_CSV_PREVIEW_EXPIRED')
  const contentHash=privateToolContentHash('SCALE',row.title,definition)
  const result=await tx.educationPrivateTool.updateMany({where:{id,...scope,revision:row.revision,contentHash:row.contentHash},
   data:{definition:definition as Prisma.InputJsonValue,contentHash,revision:{increment:1}}})
  if(result.count!==1)privateToolFail('PRIVATE_TOOL_REVISION_CONFLICT')
  await syncPrivateToolDraftImages(tx,id,media)
  // Fixed versions and participant data are intentionally untouched.
  return {...row,definition,contentHash,revision:row.revision+1,importedCount:parsed.count,...boundary}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:5000})
}
