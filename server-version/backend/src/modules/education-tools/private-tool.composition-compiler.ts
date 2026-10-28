import type {EducationPrivateToolVersion,Prisma} from '@prisma/client'
import {privateCompositionDefinitionSchema,type PrivateCompositionDefinition} from './private-tool.composition-contracts'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {privateToolScope} from './private-tool.access'
import {privateToolContentHash,validatePrivateToolDefinition} from './private-tool.definition'
import {privateToolImageReferences} from './private-tool.media-definition'
import {compilePrivateFormRuntime} from './private-tool.form-runtime-adapter'
import {assessmentAssetSelect,validateAssessmentAssetCatalog} from '../assessment-media/assessment-asset'
import type {ScaleDefinitionV2} from '../scale/scale-definition'

export type CompositionLeaf={version:EducationPrivateToolVersion}&(
 {kind:'SCALE';definition:ScaleDefinitionV2}|{kind:'FORM';form:ReturnType<typeof compilePrivateFormRuntime>})
export type CompiledPrivateComposition={definition:PrivateCompositionDefinition;leaves:Map<string,CompositionLeaf>}

/** Already-authorized request only. One bounded source read, one optional media
 * read; no draft/latest selection, runtime writes, cross-product API or cache. */
export async function compilePrivateComposition(tx:Prisma.TransactionClient,c:PrivateToolContext,raw:unknown):Promise<CompiledPrivateComposition>{
 const definition=privateCompositionDefinitionSchema.parse(raw)
 if(!definition.blocks.length)privateToolFail('PRIVATE_TOOL_DEFINITION_INCOMPLETE',400,[{path:'blocks',severity:'error',message:'请加入至少一个固定版本工具'}])
 if(definition.administration.population!==(c.entry==='SCHOOL'?'STUDENT':'TEACHER'))
  privateToolFail('PRIVATE_COMPOSITION_VARIANT_UNSUPPORTED',400)
 const ids=[...new Set(definition.blocks.map(block=>block.source.versionId))]
 const rows=await tx.educationPrivateToolVersion.findMany({where:{id:{in:ids},...privateToolScope(c),kind:{in:['SCALE','FORM']}}})
 const byId=new Map(rows.map(row=>[row.id,row])),leaves=new Map<string,CompositionLeaf>()
 for(const block of definition.blocks){
  const row=byId.get(block.source.versionId)
  if(!row||row.kind!==block.source.kind||row.contentHash!==block.source.contentHash)
   privateToolFail('PRIVATE_COMPOSITION_SOURCE_NOT_FOUND',404)
  if(leaves.has(row.id))continue
  if(row.contentHash!==privateToolContentHash(block.source.kind,row.title,row.definition))privateToolFail('PRIVATE_TOOL_HASH_MISMATCH')
  if(row.kind==='SCALE'){
   const checked=validatePrivateToolDefinition('SCALE',row.definition)
   if(!checked.valid||!checked.definition)privateToolFail('PRIVATE_TOOL_DEFINITION_INCOMPLETE',400,checked.issues)
   const scale=checked.definition as ScaleDefinitionV2
   if(scale.referencePolicy.type!=='none')privateToolFail('PRIVATE_TOOL_RUNTIME_REFERENCE_UNSUPPORTED')
   leaves.set(row.id,{version:row,kind:'SCALE',definition:scale})
  }else leaves.set(row.id,{version:row,kind:'FORM',form:compilePrivateFormRuntime(row.definition)})
 }
 const references=[...leaves.values()].map(leaf=>({versionId:leaf.version.id,
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
  const leaf=leaves.get(block.source.versionId)!
  return n+(leaf.kind==='SCALE'?1:leaf.form.sections.reduce((sum,page)=>sum+page.items.length,0))
 },0)
 if(count>1000)privateToolFail('PRIVATE_COMPOSITION_RUNTIME_TOO_LARGE',400)
 return {definition,leaves}
}
