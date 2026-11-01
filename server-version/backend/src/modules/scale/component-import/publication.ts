import {Prisma} from '@prisma/client'
import {randomUUID} from 'node:crypto'
import {prisma} from '../../../config/database'
import {canonicalHash} from '../../assessment-runtime/canonical'
import {composeTriplet,type Part,type Axis,type Triplet} from '../../survey/standard-triplet.model'
import {toolReference} from '../../survey/tool-reference'
import {assertStandardSystem,persistStandardTripletApproval,runStandardTrial,standardReleaseRow,type StandardRelease} from '../../survey/standard-triplet.service'
import {exactStandardCombinationEntryProducts} from '../../assessment-governance/tool-entry-policy'
import {getScaleInstrumentSource} from '../onboarding/instrument-registry'
import {importedNativeDefinition} from './native-source'
import type {AdminSessionProof} from '../../admin-permissions/proof'
import {databaseContentSource,importedContentPart,importedPolicySource} from './native-source'
import {compileScalePolicy} from '../policy/compile'
import {scaleAssessmentMediaReferences} from '../scale-image-retention'
import {assertAssessmentAssetReferencesReady,retainAssessmentAssetReferences} from '../../assessment-media/assessment-asset'
import {authorizedTrainingMaterial} from '../../assessment-media/training-materials'
import {selectedStandardReport} from '../../measurement-content/standard-combination'
import {componentFail,draftView,type ComponentDraftRow} from './service'
import {emptyReport,type ComponentDraft} from './contract'
export async function componentRevisionPrefill(actor:string,pointer:{releaseId:string;combinationHash:string}){
 await assertStandardSystem(prisma,actor)
 const row=await standardReleaseRow(prisma,pointer.releaseId)
 if(row.combination_hash!==pointer.combinationHash)componentFail(409,'来源组合摘要不一致')
 const t=row.snapshot,part=t.parts.CONTENT,imported=databaseContentSource(part),source=getScaleInstrumentSource(t.toolKey,t.instrumentVersion)
 const metadata=imported?(part.payload as {administration:{metadata:NonNullable<ComponentDraft['changedParts']['CONTENT']>['metadata']}}).administration.metadata:source?{
  title:source.catalog.identity.canonicalName,catalog:source.catalog,...Object.fromEntries(['instruction','applicability','disclosure','localization','usageRequirements','educationApplicability','educationExpertApplicability','educationalFeedback'].flatMap(k=>{const v=source[k as keyof typeof source];return v===undefined?[]:[[k,v]]})),
 }:null
 if(!metadata)componentFail(409,'没有可编辑的冻结来源元数据')
 return {toolKey:t.toolKey,configurationName:t.title+' · 新配置',baseCombination:pointer,changedParts:{
  CONTENT:{version:t.instrumentVersion,definition:imported?importedNativeDefinition(part):{...source!.executable!.definition,report:emptyReport(source!.executable!.definition.scoring.scores),referencePolicy:{type:'none'}},metadata:metadata!},
  PARAMETERS:{version:t.parts.PARAMETERS.version,payload:t.parts.PARAMETERS.payload},REPORT:{version:t.parts.REPORT.version,payload:t.parts.REPORT.payload},
 }}
}

export async function componentCandidate(tx:Prisma.TransactionClient,row:ComponentDraftRow){
 const draft=draftView(row),parts={} as Record<Axis,Part>,blockers:string[]=[],inheritedAssetKeys:string[]=[]
 if(draft.baseCombination){
  const [base]=await tx.$queryRaw<StandardRelease[]>`SELECT * FROM survey_standard_releases WHERE id=${draft.baseCombination.releaseId} FOR SHARE`
  if(!base||base.tool_key!==draft.toolKey||base.combination_hash!==draft.baseCombination.combinationHash)componentFail(409,'基础组合精确身份已变化')
  Object.assign(parts,base.snapshot.parts)
  inheritedAssetKeys.push(...[...scaleAssessmentMediaReferences(base.snapshot.definition),...selectedStandardReport(base.snapshot.parts.REPORT.payload).assetRefs.map(a=>({assetId:a.assetId,contentHash:a.sha256,mimeType:a.mediaType}))].map(a=>canonicalHash(a)))
 }
 const c=draft.changedParts.CONTENT
 if(c){
  if(getScaleInstrumentSource(draft.toolKey,c.version))blockers.push('该 C 版本属于代码来源，请使用新的内容版本')
  parts.CONTENT=importedContentPart(draft.toolKey,c)
 }
 for(const axis of ['PARAMETERS','REPORT'] as const){
  const changed=draft.changedParts[axis]
  if(changed)parts[axis]={axis,version:changed.version,hash:canonicalHash(changed.payload),payload:changed.payload,sourceVersion:parts.CONTENT?.sourceVersion??'',
   reference:toolReference('SCALE',draft.toolKey,{importedComponent:true,axis,version:changed.version})}
 }
 for(const axis of ['CONTENT','PARAMETERS','REPORT'] as const){
  const part=parts[axis]
  if(!part){blockers.push(axis==='CONTENT'?'尚无 C，P/R 草稿已保留，需提供内容或选择明确基础组合':axis+' 未提供；请选择基础组合或明确不配置');continue}
  const prior=await tx.$queryRaw<Array<{axis:Axis;version:string;content_hash:string;payload:unknown;source_version:string;reference:Part['reference']}>>`SELECT * FROM survey_standard_versions
   WHERE tool_key=${draft.toolKey} AND axis=${axis} AND (version=${part.version} OR content_hash=${part.hash}) ORDER BY created_at,id FOR SHARE`
  if(prior.some(p=>p.version===part.version&&p.content_hash!==part.hash))blockers.push(axis+' 同一正式版本已有不同内容')
  const same=prior.find(p=>p.content_hash===part.hash)
  if(same)parts[axis]={axis,version:same.version,hash:same.content_hash,payload:same.payload,sourceVersion:same.source_version,reference:same.reference}
 }
 let triplet:Triplet|null=null
 if(parts.CONTENT&&parts.PARAMETERS&&parts.REPORT){
  try{
   triplet=composeTriplet(draft.toolKey,parts)
   if(databaseContentSource(parts.CONTENT))compileScalePolicy(importedPolicySource(parts.CONTENT))
   blockers.push(...triplet.blockers)
  }catch(e){blockers.push(e instanceof Error?e.message:'组合不能形成可执行配置')}
 }
 const previewHash=canonicalHash({draftId:row.id,revision:row.revision,draft:{toolKey:draft.toolKey,configurationName:draft.configurationName,baseCombination:draft.baseCombination,changedParts:draft.changedParts},combinationHash:triplet?.combinationHash??null,blockers})
 return {draftId:row.id,revision:row.revision,configurationName:draft.configurationName,baseCombination:draft.baseCombination,
  changedParts:Object.keys(draft.changedParts),inheritedParts:(['CONTENT','PARAMETERS','REPORT'] as const).filter(a=>!draft.changedParts[a]&&parts[a]),
  parts,triplet,blockers:[...new Set(blockers)],previewHash,inheritedAssetKeys,
  reviewNotice:'参数变更可能需要同步修改报告文案。结构检查不能自动确认所有文字中的阈值含义，请核对本次参数与对应报告。'}
}
export async function previewComponentPublication(actor:string,id:string){
 return prisma.$transaction(async tx=>{
  await assertStandardSystem(tx,actor)
  const [row]=await tx.$queryRaw<ComponentDraftRow[]>`SELECT * FROM scale_component_drafts WHERE id=${id} FOR SHARE`
  if(!row)return componentFail(404,'草稿不存在')
  return componentCandidate(tx,row)
 },{timeout:15000})
}
export async function publishComponentDraft(actor:string,id:string,input:{requestId:string;expectedRevision:number;expectedPreviewHash:string;expectedBase:ComponentDraft['baseCombination'];reason:string;allowedProducts:unknown},proof?:AdminSessionProof){
 const products=exactStandardCombinationEntryProducts(input.allowedProducts),intentHash=canonicalHash({...input,allowedProducts:products})
 const releaseId=await prisma.$transaction(async tx=>{
  await assertStandardSystem(tx,actor,proof)
  const [row]=await tx.$queryRaw<ComponentDraftRow[]>`SELECT * FROM scale_component_drafts WHERE id=${id} FOR UPDATE`
  if(!row)return componentFail(404,'草稿不存在')
  if(row.published_release_id){
   const [intent]=await tx.$queryRaw<Array<{metadata:{intentHash:string}}>>`SELECT metadata FROM survey_events WHERE action='SCALE_COMPONENT_DRAFT_APPROVED' AND metadata->>'draftId'=${id} AND metadata->>'requestId'=${input.requestId} AND actor_user_id=${actor} LIMIT 1`
   if(intent?.metadata.intentHash!==intentHash)componentFail(409,'该草稿已经冻结，不能重放不同发布意图')
   return row.published_release_id
  }
  if(row.revision!==input.expectedRevision||canonicalHash(draftView(row).baseCombination)!==canonicalHash(input.expectedBase))componentFail(409,'草稿修订或基础组合已变化，请重新预览')
  const candidate=await componentCandidate(tx,row)
  if(candidate.previewHash!==input.expectedPreviewHash)componentFail(409,'发布预览摘要不同，请重新核对')
  if(!candidate.triplet||candidate.blockers.length)componentFail(409,candidate.blockers.join('；'))
  const t=candidate.triplet!
  const media=[...scaleAssessmentMediaReferences(t.definition),...selectedStandardReport(t.parts.REPORT.payload).assetRefs.map(a=>({assetId:a.assetId,contentHash:a.sha256,mimeType:a.mediaType}))]
  for(const asset of new Map(media.map(a=>[a.assetId,a])).values())if(!candidate.inheritedAssetKeys.includes(canonicalHash(asset)))await authorizedTrainingMaterial(tx,actor,asset.assetId)
  await assertAssessmentAssetReferencesReady(media,tx)
  await retainAssessmentAssetReferences({owner:{entityType:'AssessmentPublishedDefinition',entityId:'STANDARD_COMBINATION:'+t.combinationHash,field:'media'},references:media,db:tx})
  const release=await persistStandardTripletApproval(tx,actor,{toolKey:t.toolKey,CONTENT:t.parts.CONTENT.hash,PARAMETERS:t.parts.PARAMETERS.hash,REPORT:t.parts.REPORT.hash,requestId:input.requestId,expectedCombinationHash:t.combinationHash,reason:input.reason,allowedProducts:products},t,products)
  await tx.$executeRaw`UPDATE scale_component_drafts SET published_release_id=${release},revision=revision+1,updated_by=${actor},updated_at=clock_timestamp() WHERE id=${id}`
  await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:actor,action:'SCALE_COMPONENT_DRAFT_APPROVED',metadata:{draftId:id,revision:row.revision,releaseId:release,requestId:input.requestId,intentHash,configurationName:row.configuration_name,previewHash:candidate.previewHash}}})
  return release
 },{timeout:15000})
 const row=await standardReleaseRow(prisma,releaseId)
 if(row.state==='APPROVED')await runStandardTrial(actor,releaseId,row.version,proof)
 const current=await standardReleaseRow(prisma,releaseId)
 return {id:current.id,state:current.state,version:current.version,combinationHash:current.combination_hash,blockers:current.blockers}
}
