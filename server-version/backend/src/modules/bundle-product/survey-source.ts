import type {Prisma} from '@prisma/client'
import type {ScaleDefinitionV2} from '../scale/scale-definition'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getCatalogSourceSnapshot} from '../survey/catalog.sources'
import type {GovernedArtifact} from '../survey/governed-tool.model'
import {CatalogSourceError} from '../survey/catalog.sources'
import {assertSurveyDraft,type FormDraft} from '../survey/builder.definition'
import {readInstance} from './instance'
import {assertPackageAdmission} from './package-release'
import {nativeProfilePackage,type SurveyNativeBundle,type SurveyNativeSource} from './survey-native'

const fail=(code:string):never=>{throw new CatalogSourceError(code)}
/** This is content intake, after the existing strong system-authoring boundary.
 * The Survey manager still grants the resulting exact WHOLE artifact separately. */
export async function freezeSurveyNativeSource(tx:Prisma.TransactionClient,actor:string,source:SurveyNativeSource,components:GovernedArtifact['components']):Promise<SurveyNativeBundle>{
 const row=await tx.compositeAssessment.findUnique({where:{id:source.compositeId},include:{bundleInstance:true,items:true}})
 if(!row||row.status!=='PUBLISHED'||row.productKind!=='ASSESSMENT_BUNDLE'||!row.bundleInstance||row.createdBy!==actor)fail('SURVEY_NATIVE_PUBLISHED_OWNER_REQUIRED')
 const instance=row!.bundleInstance!,{frozen,bindings}=readInstance(instance)
 if(instance.definitionHash!==source.definitionHash||instance.bindingsHash!==source.bindingsHash)fail('SURVEY_NATIVE_SOURCE_CHANGED')
 const native:SurveyNativeBundle={schemaVersion:1,source,ownerId:actor,definition:frozen,policies:{},reportAudiences:{}}
 const {pack}=nativeProfilePackage(native)
 await assertPackageAdmission(tx,pack)
 const slots=frozen.bundleSnapshot.slotBindings
 if(components.length!==slots.length||new Set(components.map(c=>c.slotKey)).size!==slots.length||slots.some((s,i)=>components[i]?.slotKey!==s.slotKey||components[i]?.unit.ref.kind!==s.unitType))fail('SURVEY_NATIVE_WHOLE_PACKAGE_REQUIRED')
 if(slots.some(s=>!['SCALE','FORM'].includes(s.unitType)))fail('SURVEY_NATIVE_UNIT_UNSUPPORTED')
 for(const binding of bindings.slots){
  const item=row!.items.find(i=>i.id===binding.itemId),slot=slots.find(s=>s.slotKey===binding.slotKey)!,component=components.find(c=>c.slotKey===binding.slotKey)!
  if(!item?.scaleId||!binding.scaleDisclosure)fail('SURVEY_NATIVE_SCALE_BINDING_REQUIRED')
  const original=await getCatalogSourceSnapshot({actorUserId:actor,ref:{kind:'SCALE',sourceId:item!.scaleId!,sourceVersion:slot.instrumentVersion}},tx)
  if(canonicalHash(original.compiledDefinition)!==canonicalHash(component.unit.compiledDefinition))fail('SURVEY_NATIVE_SCALE_DEFINITION_CHANGED')
  native.policies[binding.slotKey]=binding.scaleDisclosure!
  const audience=component.unit.provenance.reportAudience,originalAudience=(original.compiledDefinition as ScaleDefinitionV2).report.audienceContract?.audience
  native.reportAudiences[binding.slotKey]=component.unit.provenance.reportConfigured===true&&audience===originalAudience&&(audience==='student'||audience==='researcher')?audience:null
 }
 const fields=frozen.contextDefinition?.fields??[]
 if(source.context.length!==fields.length||new Set(source.context.map(c=>c.contextKey)).size!==fields.length)fail('SURVEY_NATIVE_CONTEXT_INCOMPLETE')
 for(const field of fields){
  const mapping=source.context.find(c=>c.contextKey===field.contextKey),component=components.find(c=>c.slotKey===mapping?.slotKey)
  if(!component||component.unit.ref.kind!=='FORM')fail('SURVEY_NATIVE_CONTEXT_BINDING')
  const form=assertSurveyDraft('FORM',component!.unit.displayDefinition,true) as FormDraft
  const question=form.pages.flatMap(p=>p.questions).find(q=>q.itemKey===mapping!.itemKey)
  // Initially support declared numeric Context only; no arbitrary raw-answer inference.
  if(field.valueType!=='number'||!question||!question.required||question.displayIf||question.type!=='NUMBER')fail('SURVEY_NATIVE_CONTEXT_TYPE')
 }
 return native
}
/** New admissions recheck the ORIGINAL whole source and package release. History
 * reads consume the frozen publication and never consult a replacement source. */
export async function assertSurveyNativeAdmission(tx:Prisma.TransactionClient,native:SurveyNativeBundle){
 const row=await tx.bundleInstance.findUnique({where:{compositeId:native.source.compositeId},include:{composite:true}})
 if(!row||row.composite.status!=='PUBLISHED'||row.composite.createdBy!==native.ownerId||row.definitionHash!==native.source.definitionHash||row.bindingsHash!==native.source.bindingsHash)fail('SURVEY_NATIVE_SOURCE_CHANGED')
 const {pack}=nativeProfilePackage(native);readInstance(row!);await assertPackageAdmission(tx,pack)
}
