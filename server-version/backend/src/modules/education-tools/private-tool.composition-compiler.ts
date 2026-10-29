import {validateContextFormItems} from '../assessment-context/context'
import {requiredScaleContextKeys} from '../scale/policy/context-preflight'
import {readEducationStandardSources,type EducationStandardLeaf} from './public-source.standard'
import {Prisma,type EducationPrivateToolVersion} from '@prisma/client'
import {privateCompositionDefinitionSchema,type PrivateCompositionDefinition} from './private-tool.composition-contracts'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {privateToolScope} from './private-tool.access'
import {privateToolContentHash,validatePrivateToolDefinition} from './private-tool.definition'
import {privateToolImageReferences} from './private-tool.media-definition'
import {compilePrivateFormRuntime} from './private-tool.form-runtime-adapter'
import {assessmentAssetSelect,validateAssessmentAssetCatalog} from '../assessment-media/assessment-asset'
import type {ScaleDefinitionV2} from '../scale/scale-definition'
import {canonicalHash} from '../assessment-runtime/canonical'
import type {GovernedArtifact} from '../survey/governed-tool.model'
import {governedMediaBlocker,governedMediaRefs} from '../survey/governed-tool.media'
import {compileEducationApplicability,educationApplicabilitySchema} from '../scale-library-governance/education-applicability'
import {educationPublicSourceKey} from './public-source.identity'
import {readEducationPublicUse} from './public-source.catalog'
import {readEducationLibrarySources,type EducationLibraryLeaf} from './library-source.scale'
import {readEducationLibrarySourceUses} from './library-source.catalog'
import {readLockedEducationLibraryUses,type LockedEducationLibraryUses} from './library-source.use'
import {assertAssessmentAssetReferencesReady} from '../assessment-media/assessment-asset'

export type CompositionLeaf={provider:'LIBRARY_SCALE';kind:'SCALE';version:Pick<EducationPrivateToolVersion,'id'|'toolId'|'title'|'contentHash'>;definition:ScaleDefinitionV2;library:EducationLibraryLeaf}|{provider:'STANDARD_SCALE';kind:'SCALE';version:Pick<EducationPrivateToolVersion,'id'|'toolId'|'title'|'contentHash'>;definition:ScaleDefinitionV2;standard:EducationStandardLeaf}|({provider:'PRIVATE_VERSION';version:EducationPrivateToolVersion}&(
 {kind:'SCALE';definition:ScaleDefinitionV2}|{kind:'FORM';form:ReturnType<typeof compilePrivateFormRuntime>}))|
 {provider:'PUBLIC_FORM';kind:'FORM';version:Pick<EducationPrivateToolVersion,'id'|'toolId'|'title'|'contentHash'>;
  sourceInstruction?:string;form:ReturnType<typeof compilePrivateFormRuntime>}
export const compositionLeafKey=(source:{provider:string;versionId:string})=>source.provider+':'+source.versionId
export type CompiledPrivateComposition={definition:PrivateCompositionDefinition;leaves:Map<string,CompositionLeaf>;publicUseExpiresAt?:Date}

/** Already-authorized request only. One bounded source read, one optional media
 * read; no draft/latest selection, runtime writes, cross-product API or cache. */
export async function compilePrivateComposition(tx:Prisma.TransactionClient,c:PrivateToolContext,raw:unknown,options:{purpose?:'FREEZE';libraryUses?:LockedEducationLibraryUses}={}):Promise<CompiledPrivateComposition>{
 const definition=privateCompositionDefinitionSchema.parse(raw)
 if(!definition.blocks.length)privateToolFail('PRIVATE_TOOL_DEFINITION_INCOMPLETE',400,[{path:'blocks',severity:'error',message:'请加入至少一个固定版本工具'}])
 if(definition.administration.population!==(c.entry==='SCHOOL'?'STUDENT':'TEACHER'))
  privateToolFail('PRIVATE_COMPOSITION_VARIANT_UNSUPPORTED',400)
 // A student respondent's background cannot silently become the evaluated
 // teacher's scientific reference context. This slice admits no personal page.
 if(definition.administration.responseMode==='STUDENT_REPORT'&&definition.contextFields?.length)
  privateToolFail('PRIVATE_COMPOSITION_STUDENT_CONTEXT_UNSUPPORTED',400)
 const librarySources=definition.blocks.filter(block=>block.source.provider==='LIBRARY_SCALE').map(block=>block.source)
 const libraryIds=[...new Set(librarySources.map(source=>source.versionId))]
 const libraryUses=libraryIds.length?(options.purpose==='FREEZE'?readLockedEducationLibraryUses(tx,c,options.libraryUses):
  await readEducationLibrarySourceUses(tx,c,libraryIds)):new Map()
 if(libraryIds.some(id=>!libraryUses.has(id)))privateToolFail('LIBRARY_SOURCE_USE_REQUIRED',403)
 const publicSources=definition.blocks.filter(block=>['PUBLIC_FORM','STANDARD_SCALE'].includes(block.source.provider)).map(block=>block.source)
 const publicKeys=publicSources.map(source=>educationPublicSourceKey({kind:source.provider==='PUBLIC_FORM'?'FORM':'STANDARD_SCALE',id:source.versionId,hash:source.contentHash}))
 const publicUse=await readEducationPublicUse(tx,c,publicKeys,true)
 if(publicUse.size!==new Set(publicKeys).size)privateToolFail('PUBLIC_SOURCE_USE_REQUIRED',403)
 const ids=[...new Set(definition.blocks.filter(block=>block.source.provider==='PRIVATE_VERSION').map(block=>block.source.versionId))]
 const rows=ids.length?await tx.educationPrivateToolVersion.findMany({where:{id:{in:ids},...privateToolScope(c),kind:{in:['SCALE','FORM']}}}):[]
 const byId=new Map(rows.map(row=>[row.id,row])),leaves=new Map<string,CompositionLeaf>()
 for(const block of definition.blocks.filter(block=>block.source.provider==='PRIVATE_VERSION')){
  const row=byId.get(block.source.versionId)
  if(!row||row.kind!==block.source.kind||row.contentHash!==block.source.contentHash)
   privateToolFail('PRIVATE_COMPOSITION_SOURCE_NOT_FOUND',404)
  const key=compositionLeafKey(block.source)
  if(leaves.has(key))continue
  if(row.contentHash!==privateToolContentHash(block.source.kind,row.title,row.definition))privateToolFail('PRIVATE_TOOL_HASH_MISMATCH')
  if(row.kind==='SCALE'){
   const checked=validatePrivateToolDefinition('SCALE',row.definition)
   if(!checked.valid||!checked.definition)privateToolFail('PRIVATE_TOOL_DEFINITION_INCOMPLETE',400,checked.issues)
   const scale=checked.definition as ScaleDefinitionV2
   if(scale.referencePolicy.type!=='none')privateToolFail('PRIVATE_TOOL_RUNTIME_REFERENCE_UNSUPPORTED')
   leaves.set(key,{provider:'PRIVATE_VERSION',version:row,kind:'SCALE',definition:scale})
  }else leaves.set(key,{provider:'PRIVATE_VERSION',version:row,kind:'FORM',form:compilePrivateFormRuntime(row.definition)})
 }
 const standards=await readEducationStandardSources(tx,publicSources.filter(source=>source.provider==='STANDARD_SCALE'),definition.administration)
 for(const standard of standards.values())leaves.set('STANDARD_SCALE:'+standard.row.id,{provider:'STANDARD_SCALE',kind:'SCALE',standard,definition:standard.row.snapshot.definition,
  version:{id:standard.row.id,toolId:standard.row.id,title:standard.row.snapshot.title,contentHash:standard.row.combination_hash}})
 const libraries=await readEducationLibrarySources(tx,librarySources,definition.administration)
 for(const library of libraries.values())leaves.set('LIBRARY_SCALE:'+library.row.entryId,{provider:'LIBRARY_SCALE',kind:'SCALE',library,definition:library.definition,
  version:{id:library.row.entryId,toolId:library.row.entryId,title:library.row.snapshot.title,contentHash:library.row.snapshotHash}})
 const formSources=publicSources.filter(source=>source.provider==='PUBLIC_FORM')
 const publicIds=[...new Set(formSources.map(source=>source.versionId))]
 const publicRows=publicIds.length?await tx.$queryRaw<Array<{id:string;title:string;snapshot_hash:string;snapshot:GovernedArtifact}>>(Prisma.sql`
  SELECT id,title,snapshot_hash,snapshot FROM survey_governed_tools WHERE id IN (${Prisma.join(publicIds)}) AND family='FORM' AND state='ONLINE' ORDER BY id FOR SHARE`):[]
 const publicMedia:Array<{id:string;refs:ReturnType<typeof governedMediaRefs>}>=[]
 for(const source of formSources){
  const key=compositionLeafKey(source)
  const row=publicRows.find(row=>row.id===source.versionId)
  if(!row||row.snapshot_hash!==source.contentHash||canonicalHash(row.snapshot)!==source.contentHash||row.snapshot.family!=='FORM'
   ||!row.snapshot.unit||row.snapshot.unit.ref.kind!=='FORM')privateToolFail('PUBLIC_FORM_SOURCE_UNAVAILABLE',404)
  if(leaves.has(key))continue
  const declared=educationApplicabilitySchema.safeParse(row.snapshot.reference.metadata.annotations&&
   (row.snapshot.reference.metadata.annotations as Record<string,unknown>).educationApplicability)
  if(!declared.success)privateToolFail('PUBLIC_FORM_APPLICABILITY_REQUIRED',400)
  const declaration=compileEducationApplicability(declared.data)
  if(!declaration.variants.some(variant=>variant.population===definition.administration.population&&variant.responseMode===definition.administration.responseMode))
   privateToolFail('PUBLIC_FORM_VARIANT_UNSUPPORTED',400)
  const unit=row.snapshot.unit
  if(governedMediaBlocker(unit))privateToolFail('PUBLIC_FORM_MEDIA_NOT_SHARED',403)
  const refs=governedMediaRefs(unit)
  if(refs.length)publicMedia.push({id:row.id,refs})
  leaves.set(key,{provider:'PUBLIC_FORM',kind:'FORM',version:{id:row.id,toolId:row.id,title:row.title,contentHash:row.snapshot_hash},
   ...(unit.instruction?{sourceInstruction:unit.instruction}:{}),form:compilePrivateFormRuntime(unit.displayDefinition)})
 }
 if(publicMedia.length){
  const refs=[...new Map(publicMedia.flatMap(row=>row.refs).map(ref=>[ref.assetId,ref])).values()]
  const pins=await tx.assetReference.findMany({where:{entityType:'SurveyGovernedTool',entityId:{in:publicMedia.map(row=>row.id)},field:'media',assetId:{in:refs.map(ref=>ref.assetId)}},select:{entityId:true,assetId:true}})
  if(publicMedia.some(row=>row.refs.some(ref=>!pins.some(pin=>pin.entityId===row.id&&pin.assetId===ref.assetId))))privateToolFail('PUBLIC_FORM_MEDIA_NOT_SHARED',403)
  await assertAssessmentAssetReferencesReady(refs,tx)
 }
 const fields=definition.contextFields??[]
 const contextIssues=validateContextFormItems(fields.map((field,index)=>({id:String(index),type:field.formType,label:field.formLabel,required:true,position:0,contextKey:field.contextKey,options:field.formOptions})),[1])
 if(contextIssues.length)privateToolFail('PRIVATE_COMPOSITION_CONTEXT_INVALID',400,contextIssues.map(issue=>({...issue,severity:'error' as const})))
 for(const leaf of leaves.values())if(leaf.provider==='STANDARD_SCALE'){
  const policy=leaf.standard.row.snapshot.parts.CONTENT.reference.metadata.applicability as Parameters<typeof requiredScaleContextKeys>[0]
  if(requiredScaleContextKeys(policy).some(key=>!fields.some(field=>field.contextKey===key)))privateToolFail('PRIVATE_COMPOSITION_CONTEXT_REQUIRED',400)
 }
 // U was checked before loading public bodies; its SHARE locks remain through
 // freeze. Only interval expiry needs a final post-materialization clock check.
 const references=[...leaves.values()].filter(leaf=>leaf.provider==='PRIVATE_VERSION').map(leaf=>({versionId:leaf.version.id,
  refs:privateToolImageReferences(leaf.kind,leaf.kind==='SCALE'?leaf.definition:leaf.form.definition)}))
 const assets=[...new Set(references.flatMap(row=>row.refs.all.map(ref=>ref.assetId)))]
 if(assets.length){
  const rows=await tx.storedAsset.findMany({where:{id:{in:assets},ownerId:c.principal.userId,accessScope:'PRIVATE',
   scopeId:{startsWith:`education-private:${c.entry}:${c.organizationId}:`},deletedAt:null},
   select:{...assessmentAssetSelect,references:{where:{entityType:'EducationPrivateToolVersion',entityId:{in:ids},field:{in:['stimuli','reports']}},select:{entityId:true,field:true}}}})
  for(const {versionId,refs} of references){
   if(!validateAssessmentAssetCatalog(refs.all,rows).valid||(['stimuli','reports'] as const).some(field=>
    refs[field].some(ref=>!rows.some(row=>row.id===ref.assetId&&row.references.some(pin=>pin.entityId===versionId&&pin.field===field)))))
    privateToolFail('PRIVATE_TOOL_RUNTIME_MEDIA_IDENTITY_INVALID')
  }
 }
 const count=definition.blocks.reduce((n,block)=>{
  const leaf=leaves.get(compositionLeafKey(block.source))!
  return n+(leaf.kind==='SCALE'?1:leaf.form.sections.reduce((sum,page)=>sum+page.items.length,0))
 },0)
 if(count>1000)privateToolFail('PRIVATE_COMPOSITION_RUNTIME_TOO_LARGE',400)
 const deadlines=[...[...publicUse.values()].map(use=>use.expiresAt),...[...libraryUses.values()].map(use=>use.expiresAt).filter((date):date is Date=>date instanceof Date)]
 return {definition,leaves,...(deadlines.length?{publicUseExpiresAt:new Date(Math.min(...deadlines.map(date=>date.getTime())))}:{})}
}
