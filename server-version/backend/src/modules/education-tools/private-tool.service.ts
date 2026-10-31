import {lockOwnedDraftLibraryUses} from './library-source.use'
import {readTeacherCompositionNativeGroupChoices,readTeacherCompositionLibraryGroupChoices} from './teacher-composition-group-source'
import {readSchoolPrivateGroupChoices} from './school-private-group-source'
import {educationPublicScaleDisplay} from './public-source.scale-display'
import {readEducationLibrarySourceSummaries} from './library-source.catalog'
import {readEducationPublicSourceHeaders,educationPublicRequiredContextKeys} from './public-source.headers'
import {compilePrivateFormRuntime} from './private-tool.form-runtime-adapter'
import {EducationPrivateToolError} from './private-tool.contracts'
import {randomUUID} from 'node:crypto'
import {canonicalHash} from '../assessment-runtime/canonical'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {authorizePrivateTool as authorized,privateToolScope as scope} from './private-tool.access'
import {assertPrivateToolImages,syncPrivateToolDraftImages,retainPrivateToolVersionImages} from './private-tool.media'
import {buildScaleResult} from '../scale/scale-result'
import {previewScaleRawScoreFeedback} from '../scale/raw-score-feedback-preview'
import {normalizeFormAnswers} from '../assessment-core/form/runtime'
import {parseAnswerMap} from '../assessment-core/form/answers'
import type {FormDraft} from '../assessment-core/form/definition'
import type {ScaleDefinitionV2} from '../scale/scale-definition'
import {createPrivateToolInput,updatePrivateToolInput,freezePrivateToolInput,previewPrivateToolInput,privateToolId,privateToolFail,type PrivateToolContext,type PrivateToolKind} from './private-tool.contracts'
import {initialPrivateToolDefinition,privateToolDefinition,validatePrivateToolDefinition,privateToolContentHash} from './private-tool.definition'
import {compilePrivateComposition} from './private-tool.composition-compiler'
import {sealPrivateComposition,readOwnedCompositionIdentity} from './private-tool.composition-runtime'
import {privateCompositionAdministrationSchema,type PrivateCompositionDefinition} from './private-tool.composition-contracts'
import {readEducationPublicUse} from './public-source.catalog'
import {educationPublicSourceKey} from './public-source.identity'
import {educationBlockPublicSource} from './public-source.identity'
import {compositionLeafKey} from './private-tool.composition-compiler'
import {lockOwnedDraftNativeSources} from './native-source.locks'
import {assertSelectedSourceBindingsUnchanged,selectedSourceBindingsFromBlocks,selectedSourceBindingChanges} from './selected-source-binding'

type Tx=Prisma.TransactionClient
const boundary={visibility:'AUTHOR_PRIVATE',snapshotOnly:true,canPublish:false,canShare:false,canReadParticipantReports:false} as const
// Serialization retries replay only this bounded private draft transaction; they
// never replay external work, publication, uploads, or participant submissions.
async function transact<T>(fn:(tx:Tx)=>Promise<T>,retryUnique=false,mutation=false):Promise<T>{
 for(let attempt=0;;attempt++){
  try{return await prisma.$transaction(fn,{isolationLevel:mutation?Prisma.TransactionIsolationLevel.ReadCommitted:Prisma.TransactionIsolationLevel.Serializable})}
  catch(error){
   const dbError=error as {code?:string;meta?:{code?:string}}
   const retryable=dbError.code==='P2034'||dbError.code==='P2010'&&dbError.meta?.code==='40001'||retryUnique&&dbError.code==='P2002'
   if(retryable&&attempt<2)continue
   if(retryable)privateToolFail('PRIVATE_TOOL_CONCURRENT_CHANGE',409)
   throw error
  }
 }
}
async function readOwned(tx:Tx,c:PrivateToolContext,id:string,lock=false){
 privateToolId.parse(id)
 if(lock)await tx.$queryRaw(Prisma.sql`SELECT id FROM education_private_tools WHERE id=${id} AND entry=${c.entry}
  AND organization_id=${c.organizationId} AND owner_user_id=${c.principal.userId} FOR UPDATE`)
 const row=await tx.educationPrivateTool.findFirst({where:{id,...scope(c)}})
 if(!row)privateToolFail('PRIVATE_TOOL_NOT_FOUND',404)
 if(row.contentHash!==privateToolContentHash(row.kind as PrivateToolKind,row.title,row.definition))privateToolFail('PRIVATE_TOOL_HASH_MISMATCH')
 return row
}
export async function createPrivateTool(c:PrivateToolContext,raw:unknown){
 const input=createPrivateToolInput.parse(raw)
 const definition=privateToolDefinition(input.kind,initialPrivateToolDefinition(input.kind,c.entry))
 return transact(async tx=>{
  await authorized(tx,c,{kind:input.kind})
  const row=await tx.educationPrivateTool.create({data:{id:randomUUID(),...scope(c),...input,
   definition:definition as Prisma.InputJsonValue,contentHash:privateToolContentHash(input.kind,input.title,definition)}})
  return {...row,...boundary}
 },false,true)
}
export async function listPrivateTools(c:PrivateToolContext,cursor?:string,kind?:PrivateToolKind){
 if(cursor)privateToolId.parse(cursor)
 return transact(async tx=>{
  await authorized(tx,c)
  // Existing Scale/Form cards retain their leaf editors. The questionnaire
  // adapter explicitly requests COMPOSITION; it cannot enter the Form editor.
  const where={...scope(c),kind:kind??{in:['SCALE','FORM']}}
  if(cursor&&!await tx.educationPrivateTool.findFirst({where:{id:cursor,...where},select:{id:true}}))
   privateToolFail('PRIVATE_TOOL_CURSOR_INVALID',400)
  // Use the database's native compound cursor: JS Date would truncate the
  // microseconds in created_at. Immutable createdAt keeps edits from shifting pages.
  const rows=await tx.educationPrivateTool.findMany({where,
   orderBy:[{createdAt:'desc'},{id:'desc'}],...(cursor?{cursor:{id:cursor},skip:1}:{}),take:51,
   select:{id:true,kind:true,title:true,revision:true,contentHash:true,createdAt:true,updatedAt:true}})
  return {list:rows.slice(0,50),nextCursor:rows.length>50?rows[49].id:null,...boundary}
 })
}
export async function readPrivateTool(c:PrivateToolContext,id:string){
 return transact(async tx=>{
  await authorized(tx,c);const tool=await readOwned(tx,c,id)
  if(tool.kind!=='COMPOSITION')return {...tool,...boundary}
  const definition=tool.definition as unknown as PrivateCompositionDefinition
  const ids=[...new Set(definition.blocks.filter(block=>block.source.provider==='PRIVATE_VERSION').map(block=>block.source.versionId))]
  const references=ids.length?await tx.educationPrivateToolVersion.findMany({where:{id:{in:ids},...scope(c),kind:{in:['SCALE','FORM']}},
   select:{id:true,toolId:true,kind:true,title:true,sourceRevision:true,contentHash:true}}):[]
  const groupChoices=await readSchoolPrivateGroupChoices(tx,c,references.filter(ref=>ref.kind==='SCALE').map(ref=>ref.id),{teacherComposition:true})
  const publicSources=definition.blocks.map(block=>educationBlockPublicSource(block.source)).filter((source):source is NonNullable<typeof source>=>source!==null)
  const publicKey=educationPublicSourceKey
  // A mutable draft may contain an as-yet unverified reference. It cannot be
  // used as an oracle for another public source's title/version without U.
  // Keep the owner's draft intact; resolve only currently authorized summaries.
  const allowed=await readEducationPublicUse(tx,c,publicSources.map(publicKey),false,selectedSourceBindingsFromBlocks(definition.blocks))
  const visibleSources=publicSources.filter(source=>allowed.has(publicKey(source)))
  const publicHeaders=await readEducationPublicSourceHeaders(tx,visibleSources,false,c.entry)
  const nativeGroupChoices=c.entry==='TEACHER'&&definition.administration.responseMode==='SELF'?await readTeacherCompositionNativeGroupChoices(tx,[...publicHeaders.values()]):new Map()
  const libraryHeaders=await readEducationLibrarySourceSummaries(tx,c,definition.blocks.filter(block=>block.source.provider==='LIBRARY_SCALE').map(block=>block.source),definition.administration.responseMode,definition.administration.responseMode==='EXPERT_REPORT'?definition.administration.targetKind:undefined)
  const libraryGroupChoices=c.entry==='TEACHER'&&definition.administration.responseMode==='SELF'?await readTeacherCompositionLibraryGroupChoices(tx,libraryHeaders.map(header=>({versionId:header.sourceId,contentHash:header.contentHash}))):new Map()
  return {...tool,references:[...references.map(ref=>({...ref,sourceProvider:'PRIVATE_VERSION' as const,...(groupChoices.has(ref.id)?{groupChoice:groupChoices.get(ref.id)}:{})})),
   ...[...publicHeaders.values()].map(header=>({id:header.id,kind:header.kind==='FORM'?'FORM' as const:header.kind==='STANDARD_SCALE'?'SCALE' as const:['COGNITIVE_CONFIG','COGNITIVE_PROFILE'].includes(header.kind)?'COGNITIVE' as const:'SJT' as const,title:header.title,contentHash:header.hash,version:header.versions.content,versions:header.versions,requiredContextKeys:educationPublicRequiredContextKeys(header),referenceContextKeys:header.referenceContextKeys,
    sourceProvider:header.kind==='FORM'?'PUBLIC_FORM' as const:header.kind==='COGNITIVE_PROFILE'?'COGNITIVE_CONFIG' as const:header.kind,...(nativeGroupChoices.has(header.key)?{groupChoice:nativeGroupChoices.get(header.key)}:{})})),
   ...libraryHeaders.map(header=>({id:header.sourceId,kind:header.kind,title:header.title,contentHash:header.contentHash,version:header.versions.content,versions:header.versions,sourceProvider:'LIBRARY_SCALE' as const,...(libraryGroupChoices.has(header.sourceId)?{groupChoice:libraryGroupChoices.get(header.sourceId)}:{})}))],...boundary}
 })
}
export async function updatePrivateTool(c:PrivateToolContext,id:string,raw:unknown){
 const input=updatePrivateToolInput.parse(raw)
 return transact(async tx=>{
  await authorized(tx,c,{toolId:id})
  const row=await readOwned(tx,c,id,true)
  if(row.revision!==input.expectedRevision)privateToolFail('PRIVATE_TOOL_REVISION_CONFLICT')
  const definition=privateToolDefinition(row.kind as PrivateToolKind,input.definition)
  let sourceChanges:ReturnType<typeof selectedSourceBindingChanges>=null
  if(row.kind==='COMPOSITION'){
   const previous=row.definition as unknown as PrivateCompositionDefinition,next=definition as PrivateCompositionDefinition
   assertSelectedSourceBindingsUnchanged(previous.blocks,next.blocks)
   sourceChanges=selectedSourceBindingChanges(previous.blocks,next.blocks)
   const pins=selectedSourceBindingsFromBlocks(next.blocks)
   if(pins.size){
    const allowed=await readEducationPublicUse(tx,c,[...pins.keys()],true,pins)
    if(allowed.size!==pins.size)privateToolFail('SELECTED_CONFIGURATION_USE_REQUIRED',403)
   }
  }
  const media=await assertPrivateToolImages(tx,c,id,row.kind as PrivateToolKind,definition)
  const contentHash=privateToolContentHash(row.kind as PrivateToolKind,input.title,definition)
  const result=await tx.educationPrivateTool.updateMany({where:{id,...scope(c),revision:input.expectedRevision},
   data:{title:input.title,definition:definition as Prisma.InputJsonValue,contentHash,revision:{increment:1}}})
  if(result.count!==1)privateToolFail('PRIVATE_TOOL_REVISION_CONFLICT')
  await syncPrivateToolDraftImages(tx,id,media)
  if(sourceChanges){
   const change={schemaVersion:1,entry:c.entry,organizationId:c.organizationId,previousRevision:row.revision,revision:row.revision+1,
    previousContentHash:row.contentHash,contentHash,...sourceChanges}
   await tx.assessmentManagementEvent.create({data:{id:randomUUID(),actorId:c.principal.userId,resourceId:id,
    action:'EDUCATION_PRIVATE_SOURCE_BINDINGS_CHANGED',metadata:{...change,changeHash:canonicalHash(change)}}})
  }
  return {id,revision:row.revision+1,contentHash,...boundary}
 },false,true)
}
export async function validatePrivateTool(c:PrivateToolContext,id:string){
 return transact(async tx=>{
  await lockOwnedDraftNativeSources(tx,c,id)
  await authorized(tx,c);const row=await readOwned(tx,c,id)
  await assertPrivateToolImages(tx,c,id,row.kind as PrivateToolKind,row.definition)
  const {valid,issues}=validatePrivateToolDefinition(row.kind as PrivateToolKind,row.definition)
  if(row.kind==='COMPOSITION'&&valid)await compilePrivateComposition(tx,c,row.definition)
  return {valid,issues,revision:row.revision,contentHash:row.contentHash,validationScope:'PRIVATE_TECHNICAL_SNAPSHOT',...boundary}
 })
}
const scaleAnswers=z.array(z.object({itemCode:z.string().min(1),responseValue:z.union([z.string(),z.number().finite()])}).strict()).max(1000)
export async function previewPrivateTool(c:PrivateToolContext,id:string,raw:unknown){
 const input=previewPrivateToolInput.parse(raw)
 return transact(async tx=>{
  await lockOwnedDraftNativeSources(tx,c,id)
  await authorized(tx,c);const row=await readOwned(tx,c,id)
  if(row.kind==='COMPOSITION'){
   if(input.answers!==undefined||input.rawScores!==undefined)privateToolFail('PRIVATE_TOOL_PREVIEW_INPUT_INVALID',400)
   const compiled=await compilePrivateComposition(tx,c,row.definition)
   return {result:{kind:'COMPOSITION_PREVIEW',instruction:compiled.definition.instruction,blocks:compiled.definition.blocks.map(block=>{
    const leaf=compiled.leaves.get(compositionLeafKey(block.source))!
    return {blockId:block.blockId,instruction:block.instruction,kind:leaf.kind,title:leaf.version.title,
     definition:leaf.kind==='SCALE'?(leaf.provider==='PRIVATE_VERSION'?leaf.definition:educationPublicScaleDisplay(leaf.definition)):leaf.kind==='FORM'?leaf.form.definition:
      leaf.kind==='COGNITIVE'?{instruction:leaf.native.config.instruction,profile:leaf.native.descriptor.profile,profileDefinitionVersion:leaf.native.descriptor.profileDefinitionVersion,resolvedConfigHash:leaf.native.descriptor.resolvedConfigHash}:{instrumentVersion:leaf.native.instrumentVersion}}
   })},previewOnly:true,persistedAnswers:false,contentHash:row.contentHash,...boundary}
  }
  await assertPrivateToolImages(tx,c,id,row.kind as PrivateToolKind,row.definition)
  const checked=validatePrivateToolDefinition(row.kind as PrivateToolKind,row.definition)
  if(!checked.valid||!checked.definition)privateToolFail('PRIVATE_TOOL_DEFINITION_INCOMPLETE',400,checked.issues)
  let result:unknown
  if(row.kind==='SCALE'){
   const definition=checked.definition as ScaleDefinitionV2
   if(input.rawScores){
    if(input.answers!==undefined)privateToolFail('PRIVATE_TOOL_PREVIEW_INPUT_INVALID',400)
    try{result=previewScaleRawScoreFeedback(definition,input.rawScores)}
    catch{privateToolFail('PRIVATE_TOOL_PREVIEW_INPUT_INVALID',400)}
   }else result=buildScaleResult({scaleId:row.id,instrumentKey:'education-private:'+row.id,name:row.title,
    instrumentVersion:String(row.revision),definition,answers:scaleAnswers.parse(input.answers)})
  }else{
   if(input.rawScores!==undefined)privateToolFail('PRIVATE_TOOL_FORM_UNSCORED',400)
   result=normalizeFormAnswers(checked.definition as FormDraft,parseAnswerMap(input.answers,'answers'))
  }
  return {result,previewOnly:true,persistedAnswers:false,contentHash:row.contentHash,...boundary}
 })
}
export async function freezePrivateTool(c:PrivateToolContext,id:string,raw:unknown){
 const input=freezePrivateToolInput.parse(raw)
 return transact(async tx=>{
  await lockOwnedDraftNativeSources(tx,c,id)
  const libraryUses=await lockOwnedDraftLibraryUses(tx,c,id)
  await authorized(tx,c,{toolId:id})
  const row=await readOwned(tx,c,id,true)
  const prior=await tx.educationPrivateToolVersion.findFirst({where:{toolId:id,...scope(c),sourceRevision:input.expectedRevision}})
  if(prior){
   if(prior.contentHash!==input.expectedContentHash)privateToolFail('PRIVATE_TOOL_FREEZE_CONFLICT')
   if(prior.kind==='COMPOSITION')return {...prior,runtime:await readOwnedCompositionIdentity(tx,c,prior),state:'PRIVATE_SNAPSHOT',created:false,...boundary}
   await assertPrivateToolImages(tx,c,id,prior.kind as 'SCALE'|'FORM',prior.definition)
   return {...prior,state:'PRIVATE_SNAPSHOT',created:false,...boundary}
  }
  if(row.revision!==input.expectedRevision||row.contentHash!==input.expectedContentHash)privateToolFail('PRIVATE_TOOL_REVISION_CONFLICT')
  if(row.kind==='COMPOSITION'){
   const compiled=await compilePrivateComposition(tx,c,row.definition,{purpose:'FREEZE',libraryUses})
   const version=await tx.educationPrivateToolVersion.create({data:{id:randomUUID(),toolId:id,...scope(c),kind:row.kind,
    sourceRevision:row.revision,title:row.title,definition:row.definition as Prisma.InputJsonValue,contentHash:row.contentHash}})
   const runtime=await sealPrivateComposition(tx,c,version,compiled)
   return {...version,runtime,state:'PRIVATE_SNAPSHOT',created:true,...boundary}
  }
  const media=await assertPrivateToolImages(tx,c,id,row.kind as 'SCALE'|'FORM',row.definition)
  const checked=validatePrivateToolDefinition(row.kind as 'SCALE'|'FORM',row.definition)
  if(!checked.valid)privateToolFail('PRIVATE_TOOL_DEFINITION_INCOMPLETE',400,checked.issues)
  const version=await tx.educationPrivateToolVersion.create({data:{id:randomUUID(),toolId:id,...scope(c),kind:row.kind,
   sourceRevision:row.revision,title:row.title,definition:row.definition as Prisma.InputJsonValue,contentHash:row.contentHash}})
  await retainPrivateToolVersionImages(tx,version.id,media)
  return {...version,state:'PRIVATE_SNAPSHOT',created:true,...boundary}
 },true,true)
}
export async function listPrivateToolVersions(c:PrivateToolContext,id:string,cursor?:string){
 privateToolId.parse(id)
 if(cursor)privateToolId.parse(cursor)
 return transact(async tx=>{
  await authorized(tx,c)
  // Version selection needs ownership and immutable summaries, not the mutable
  // draft's question body or a full draft hash on every metadata page.
  const tool=await tx.educationPrivateTool.findFirst({where:{id,...scope(c)},select:{id:true,kind:true}})
  if(!tool)privateToolFail('PRIVATE_TOOL_NOT_FOUND',404)
  if(cursor&&!await tx.educationPrivateToolVersion.findFirst({where:{id:cursor,toolId:id,...scope(c)},select:{id:true}}))
   privateToolFail('PRIVATE_TOOL_CURSOR_INVALID',400)
  // Project only the fixed administration header, never the question body.
  // The database tuple preserves microsecond cursor order without JS Date.
  const rows=tool.kind==='COMPOSITION'?(await tx.$queryRaw<Array<{id:string;sourceRevision:number;title:string;contentHash:string;createdAt:Date;administration:unknown}>>(Prisma.sql`
   SELECT v.id,v.source_revision AS "sourceRevision",v.title,v.content_hash AS "contentHash",v.created_at AS "createdAt",
    v.definition->'administration' AS administration,v.definition->'groupReporting' AS "groupReporting" FROM education_private_tool_versions v
   WHERE v.tool_id=${id} AND v.entry=${c.entry} AND v.organization_id=${c.organizationId} AND v.owner_user_id=${c.principal.userId}
    AND (${cursor??null}::text IS NULL OR (v.created_at,v.id)<(SELECT created_at,id FROM education_private_tool_versions WHERE id=${cursor??null}))
   ORDER BY v.created_at DESC,v.id DESC LIMIT 51`)).map(row=>({...row,administration:privateCompositionAdministrationSchema.parse(row.administration)})):
   await tx.educationPrivateToolVersion.findMany({where:{toolId:id,...scope(c)},
   orderBy:[{createdAt:'desc'},{id:'desc'}],...(cursor?{cursor:{id:cursor},skip:1}:{}),take:51,
   select:{id:true,sourceRevision:true,title:true,contentHash:true,createdAt:true}})
  const groupChoices=await readSchoolPrivateGroupChoices(tx,c,tool.kind==='SCALE'?rows.slice(0,50).map(row=>row.id):[])
  return {list:rows.slice(0,50).map(row=>({...row,...(groupChoices.has(row.id)?{groupChoice:groupChoices.get(row.id)}:{})})),nextCursor:rows.length>50?rows[49].id:null,...boundary}
 })
}
export async function readPrivateToolVersion(c:PrivateToolContext,id:string,versionId:string){
 privateToolId.parse(versionId)
 return transact(async tx=>{
  await authorized(tx,c);await readOwned(tx,c,id)
  const version=await tx.educationPrivateToolVersion.findFirst({where:{id:versionId,toolId:id,...scope(c)}})
  if(!version)privateToolFail('PRIVATE_TOOL_VERSION_NOT_FOUND',404)
  if(version.contentHash!==privateToolContentHash(version.kind as PrivateToolKind,version.title,version.definition))privateToolFail('PRIVATE_TOOL_HASH_MISMATCH')
  return {...version,state:'PRIVATE_SNAPSHOT',...boundary}
 })
}

/** Metadata of real immutable author versions, never a synthetic registered resource. */
export async function listPrivateScaleRuntimeCandidates(c:PrivateToolContext,cursor?:string){
 if(cursor)privateToolId.parse(cursor)
 return transact(async tx=>{
  await authorized(tx,c)
  const where={...scope(c),kind:'SCALE' as const}
  if(cursor&&!await tx.educationPrivateToolVersion.findFirst({where:{id:cursor,...where},select:{id:true}}))
   privateToolFail('PRIVATE_TOOL_CURSOR_INVALID',400)
  const rows=await tx.educationPrivateToolVersion.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],
   ...(cursor?{cursor:{id:cursor},skip:1}:{}),take:51,
   select:{id:true,toolId:true,title:true,sourceRevision:true,contentHash:true,createdAt:true}})
  const groupChoices=await readSchoolPrivateGroupChoices(tx,c,rows.slice(0,50).map(row=>row.id))
  return {list:rows.slice(0,50).map(({id,...row})=>({...row,versionId:id,...(groupChoices.has(id)?{groupChoice:groupChoices.get(id)}:{})})),nextCursor:rows.length>50?rows[49].id:null,...boundary}
 })
}

/** Fixed FORM versions remain selectable as author artifacts; incompatible
 * runtime features are reported explicitly, never stripped from the source. */
export async function listPrivateFormRuntimeCandidates(c:PrivateToolContext,cursor?:string){
 if(cursor)privateToolId.parse(cursor)
 return transact(async tx=>{
  await authorized(tx,c)
  const where={...scope(c),kind:'FORM' as const}
  if(cursor&&!await tx.educationPrivateToolVersion.findFirst({where:{id:cursor,...where},select:{id:true}}))
   privateToolFail('PRIVATE_TOOL_CURSOR_INVALID',400)
  const rows=await tx.educationPrivateToolVersion.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],
   ...(cursor?{cursor:{id:cursor},skip:1}:{}),take:51,
   select:{id:true,toolId:true,title:true,sourceRevision:true,contentHash:true,createdAt:true,definition:true}})
  const list=rows.slice(0,50).map(({id,definition,...row})=>{
   let compatibility:{compatible:boolean;code:string|null;issues:unknown[]}={compatible:true,code:null,issues:[]}
   try{compilePrivateFormRuntime(definition)}catch(error){
    if(!(error instanceof EducationPrivateToolError))throw error
    compatibility={compatible:false,code:error.code,issues:error.issues}
   }
   return {...row,versionId:id,compatibility}
  })
  return {list,nextCursor:rows.length>50?rows[49].id:null,...boundary}
 })
}
