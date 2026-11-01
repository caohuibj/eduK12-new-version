import {parseFrozenSurveyCognitive} from '../survey/cognitive.definition'
import {hydrateSurveyCognitiveProfileSource} from '../survey/cognitive-profile.source'
import {readFrozenReport} from '../cognitive/profile-freeze'
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
import {isFrozenAdultSelfReport} from './self-report-audience'

const fail=(code:string):never=>{throw new CatalogSourceError(code)}
/** This is content intake, after the existing strong system-authoring boundary.
 * The Survey manager still grants the resulting exact WHOLE artifact separately. */
export async function freezeSurveyNativeSource(tx:Prisma.TransactionClient,actor:string,source:SurveyNativeSource,components:GovernedArtifact['components']):Promise<SurveyNativeBundle>{
 const row=await tx.compositeAssessment.findUnique({where:{id:source.compositeId},include:{bundleInstance:true,items:{include:{cognitiveAssignment:true}}}})
 if(!row||row.status!=='PUBLISHED'||row.productKind!=='ASSESSMENT_BUNDLE'||!row.bundleInstance||row.createdBy!==actor)fail('SURVEY_NATIVE_PUBLISHED_OWNER_REQUIRED')
 const instance=row!.bundleInstance!,{frozen,bindings}=readInstance(instance)
 if(instance.definitionHash!==source.definitionHash||instance.bindingsHash!==source.bindingsHash)fail('SURVEY_NATIVE_SOURCE_CHANGED')
 const native:SurveyNativeBundle={schemaVersion:1,source,ownerId:actor,definition:frozen,policies:{},reportAudiences:{}}
 const {pack}=nativeProfilePackage(native)
 await assertPackageAdmission(tx,pack)
 const slots=frozen.bundleSnapshot.slotBindings
 if(components.length!==slots.length||new Set(components.map(c=>c.slotKey)).size!==slots.length||slots.some((s,i)=>components[i]?.slotKey!==s.slotKey||components[i]?.unit.ref.kind!==s.unitType))fail('SURVEY_NATIVE_WHOLE_PACKAGE_REQUIRED')
 for(const binding of bindings.slots){
  const item=row!.items.find(i=>i.id===binding.itemId),slot=slots.find(s=>s.slotKey===binding.slotKey)!,component=components.find(c=>c.slotKey===binding.slotKey)!
  if(slot.unitType==='COGNITIVE'){
   const assignment=item?.cognitiveAssignment,f=parseFrozenSurveyCognitive(component.unit.compiledDefinition),dependency=pack.manifest.cognitiveDependencies.find(d=>d.slotKey===slot.slotKey)
   if(pack.schemaVersion!==3||!assignment||f.schemaVersion!==2||!dependency||component.unit.provenance.reportConfigured!==true||component.unit.provenance.reportAudience!==undefined&&component.unit.provenance.reportAudience!=='student'||assignment.profile!==dependency.profile||f.artifact.identity.configId!==assignment.configId||f.artifact.identity.testType!==slot.instrumentKey||f.artifact.identity.configVersion!==slot.instrumentVersion||f.artifact.identity.engineVersion!==dependency.engineVersion||f.artifact.identity.scoringVersion!==dependency.scoringVersion||f.artifact.identity.profile!==dependency.profile||assignment.resolvedConfigHash!==f.artifact.identity.resolvedConfigHash||canonicalHash(readFrozenReport(assignment.resolvedReportSnapshotEncrypted))!==canonicalHash(f.artifact.resolvedReport))fail('SURVEY_NATIVE_COGNITIVE_BINDING')
   const exact=f as import('../survey/cognitive-profile.definition').FrozenSurveyCognitiveProfile
   const original=await hydrateSurveyCognitiveProfileSource(tx,await getCatalogSourceSnapshot({actorUserId:actor,ref:{kind:'COGNITIVE',sourceId:`cognitive-profile:${assignment!.configId}:${dependency!.profile}`,sourceVersion:exact.artifactHash}},tx))
   if(canonicalHash(original.compiledDefinition)!==canonicalHash(component.unit.compiledDefinition))fail('SURVEY_NATIVE_COGNITIVE_DEFINITION_CHANGED')
   native.cognitiveReports??={};native.cognitiveReports[slot.slotKey]={artifactHash:exact.artifactHash,selectors:[...(slot.valueSelectors??[])],reportEnabled:true}
   continue
  }
  if(!item?.scaleId||!binding.scaleDisclosure)fail('SURVEY_NATIVE_SCALE_BINDING_REQUIRED')
  const original=await getCatalogSourceSnapshot({actorUserId:actor,ref:{kind:'SCALE',sourceId:item!.scaleId!,sourceVersion:slot.instrumentVersion}},tx)
  if(canonicalHash(original.compiledDefinition)!==canonicalHash(component.unit.compiledDefinition))fail('SURVEY_NATIVE_SCALE_DEFINITION_CHANGED')
  native.policies[binding.slotKey]=binding.scaleDisclosure!
  const audience=component.unit.provenance.reportAudience,originalAudience=(original.compiledDefinition as ScaleDefinitionV2).report.audienceContract?.audience
  const adultSelf=isFrozenAdultSelfReport({pack,slotKey:binding.slotKey,audience:'student',contract:(original.compiledDefinition as ScaleDefinitionV2).report.audienceContract,
    sourceRespondentType:(original.compiledDefinition as ScaleDefinitionV2).respondentType,relationship:{respondentType:'SELF'}})
  native.reportAudiences[binding.slotKey]=component.unit.provenance.reportConfigured===true&&audience===originalAudience&&
    (audience==='student'||audience==='researcher'||adultSelf&&(audience==='parent'||audience==='teacher'))?audience as 'student'|'researcher'|'parent'|'teacher':null
 }
 const fields=frozen.contextDefinition?.fields??[]
 if(source.context.length!==fields.length||new Set(source.context.map(c=>c.contextKey)).size!==fields.length||new Set(source.context.map(c=>c.slotKey+':'+c.itemKey)).size!==fields.length)fail('SURVEY_NATIVE_CONTEXT_INCOMPLETE')
 for(const component of components.filter(c=>c.unit.ref.kind==='FORM')){
  const form=assertSurveyDraft('FORM',component.unit.displayDefinition,true) as FormDraft,questions=form.pages.flatMap(p=>p.questions),declared=source.context.filter(c=>c.slotKey===component.slotKey)
  if(questions.length!==declared.length||questions.some(q=>!declared.some(c=>c.itemKey===q.itemKey)))fail('SURVEY_NATIVE_CONTEXT_INCOMPLETE')
 }
 for(const field of fields){
  const mapping=source.context.find(c=>c.contextKey===field.contextKey),component=components.find(c=>c.slotKey===mapping?.slotKey)
  if(!component||component.unit.ref.kind!=='FORM')fail('SURVEY_NATIVE_CONTEXT_BINDING')
  const form=assertSurveyDraft('FORM',component!.unit.displayDefinition,true) as FormDraft
  const question=form.pages.flatMap(p=>p.questions).find(q=>q.itemKey===mapping!.itemKey)
  if(pack.schemaVersion===2){
   // Preserve the original V2 numeric-only admission contract.
   if(field.valueType!=='number'||!question||!question.required||question.displayIf||question.type!=='NUMBER')fail('SURVEY_NATIVE_CONTEXT_TYPE')
  }else{
   if(!question||field.required&&!question.required||question.displayIf)fail('SURVEY_NATIVE_CONTEXT_TYPE')
   const q=question!,options=q.options.map(o=>o.optionKey).sort()
   if(field.valueType==='number'?q.type!=='NUMBER':field.valueType==='boolean'?q.type!=='SINGLE'||options.join('|')!=='false|true':
     field.valueType==='enum'?q.type!=='SINGLE'||options.join('|')!==[...(field.enumValues??[])].sort().join('|'):
     !['SHORT_TEXT','LONG_TEXT'].includes(q.type))fail('SURVEY_NATIVE_CONTEXT_TYPE')
  }
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

/** After the caller's existing data authority, inspect only this FINAL's frozen
 * unit. Undefined means a historical/non-native unit and preserves its old path. */
export async function readSurveyNativeReportAudience(tx:Prisma.TransactionClient,input:{projectId:string;finalId:string;instrumentKey:string}){
 const [row]=await tx.$queryRaw<Array<{native:boolean;audience:string|null}>>`SELECT u.value ? 'nativeBundleReport' AS native,
  u.value #>> '{nativeBundleReport,audience}' AS audience
  FROM survey_wave_finals f JOIN survey_publications p ON p.id=f.publication_id
  CROSS JOIN LATERAL jsonb_array_elements(p.compiled_snapshot->'units') AS u(value)
  WHERE f.id=${input.finalId} AND f.project_id=${input.projectId} AND u.value->>'instrumentKey'=${input.instrumentKey}`
 return row?.native===false?undefined:row?.audience??null
}
