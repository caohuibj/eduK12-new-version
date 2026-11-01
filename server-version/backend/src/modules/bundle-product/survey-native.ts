import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {compileBundleRuntimeFromFrozenRead} from '../assessment-bundle/compile'
import {computeReanalysisAggregateInputHash} from '../assessment-reanalysis/reanalysis'
import {buildBundleContextFactsFromValues,type BundleContextFieldDefinitionV1} from '../assessment-bundle/context'
import {projectDerivedBundleView,type DerivedBundleView} from '../assessment-bundle/onboarding/derived-report'
import {derivationInputs,type DerivedPackage} from '../assessment-bundle/onboarding/contract'
import {projectBundleScaleSource} from '../assessment-bundle/sources'
import {projectBundleReportFacts} from '../assessment-bundle/report-facts'
import {createProductBundleAnalysisEngineRegistry} from '../assessment-bundle/bootstrap'
import {projectProfileView,type ProfileView} from '../assessment-bundle/profile/report'
import type {ProfileResult} from '../assessment-bundle/profile/match'
import {resolveAudienceDisclosure} from '../scale/policy/disclosure'
import type {EffectiveScaleDisclosureSnapshot} from '../scale/projection/types'
import {hashScaleDefinition,type ScaleDefinitionV2} from '../scale/scale-definition'
import {readFrozenBundleProductionDefinition,type FrozenBundleProductionDefinitionV1} from './definition-provider'
import type {FrozenGovernedPackage,ResearchFrozenPublication} from '../survey/publication.service'
import type {SurveyComputedFinal} from '../survey/final.compute'

const hash=z.string().regex(/^[a-f0-9]{64}$/)
export const surveyNativeSourceSchema=z.object({compositeId:z.string().guid(),definitionHash:hash,bindingsHash:hash,
 context:z.array(z.object({contextKey:z.string().min(1),slotKey:z.string().min(1),itemKey:z.string().min(1)}).strict()).max(30)}).strict()
export type SurveyNativeSource=z.infer<typeof surveyNativeSourceSchema>
/** Shared once in the existing immutable governed artifact/publication. No grant. */
export type SurveyNativeBundle={schemaVersion:1;source:SurveyNativeSource;ownerId:string;definition:FrozenBundleProductionDefinitionV1;
 policies:Record<string,EffectiveScaleDisclosureSnapshot>;reportAudiences:Record<string,'student'|'researcher'|null>}
export type SurveyNativeReport={importId:string;definitionHash:string;status:'READY'|'UNAVAILABLE'|'FAILED';factsHash:string|null;
 views:{student:ProfileView|null;researcher:ProfileView|null};errorCode:string|null;
 derivedViews?:{student:DerivedBundleView|null;researcher:DerivedBundleView|null}}

export function nativeProfilePackage(native:SurveyNativeBundle){
 const frozen=readFrozenBundleProductionDefinition(native.definition),pack=frozen.declarativePackage
 if(frozen.contentHash!==native.source.definitionHash||(pack?.schemaVersion!==2&&pack?.schemaVersion!==3))throw new Error('SURVEY_NATIVE_PROFILE_IDENTITY')
 if(pack.schemaVersion===3&&frozen.bundleSnapshot.slotBindings.some(s=>!['SCALE','FORM'].includes(s.unitType)))throw new Error('SURVEY_NATIVE_UNIT_UNSUPPORTED')
 return {frozen,pack}
}
/** Current release intersection can only remove data from the saved DTO. */
export function restrictSavedDerivedView(pack:DerivedPackage,view:DerivedBundleView,allowed:ReadonlySet<string>):DerivedBundleView{
 const permits=(keys:readonly string[])=>keys.every(k=>allowed.has(k))
 const defs=new Map(pack.rules.derivations.map(d=>[d.key,d]))
 const conclusions=view.conclusions.filter(c=>permits(c.evidenceKeys))
 const themeKeys=pack.rules.theme?[...pack.rules.theme.axisKeys.flatMap(k=>derivationInputs(defs.get(k)!)),...pack.rules.theme.ruleIds.flatMap(id=>pack.rules.items.find(r=>r.ruleId===id)!.evidenceKeys)]:[]
 return {...view,rows:view.rows.map(r=>permits(r.evidenceKeys)?r:{...r,state:'redacted',quality:'unavailable',value:null,denominator:null}),
  maxSets:view.maxSets.map(s=>{const d=defs.get(s.key);return d&&permits(derivationInputs(d))?s:{...s,state:'redacted',maximum:null,maxKeys:null,orderedKeys:null}}),
  theme:view.theme&&permits(themeKeys)?view.theme:view.theme?{...view.theme,state:'WITHHELD',profileId:null}:null,
  conclusions,blocks:view.blocks.map(b=>({...b,ruleIds:b.ruleIds.filter(id=>conclusions.some(c=>c.ruleId===id))}))}
}
/** Decode only the frozen declared type. Never infer a string/enum as numeric. */
export function decodeSurveyNativeContext(field:BundleContextFieldDefinitionV1,raw:unknown):unknown{
 if(raw===undefined||raw===null||raw==='')return raw
 if(field.valueType==='number'){
  if(typeof raw==='number'&&Number.isFinite(raw))return raw
  if(typeof raw==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim())&&Number.isFinite(Number(raw)))return Number(raw)
  throw new Error('SURVEY_NATIVE_CONTEXT_TYPE')
 }
 if(field.valueType==='boolean'){
  if(typeof raw==='boolean')return raw
  if(raw==='true')return true
  if(raw==='false')return false
  throw new Error('SURVEY_NATIVE_CONTEXT_TYPE')
 }
 if(typeof raw!=='string'||field.valueType==='enum'&&!field.enumValues?.includes(raw))throw new Error('SURVEY_NATIVE_CONTEXT_TYPE')
 return raw
}
/** Uses this FINAL's already scored units. No scorer, database, current catalog or LLM. */
export function computeSurveyNativeReports(snapshot:Pick<ResearchFrozenPublication,'governedPackages'|'units'>,calculated:SurveyComputedFinal):SurveyNativeReport[]{
 return (snapshot.governedPackages??[]).filter(p=>p.nativeBundle).map(p=>{
  const native=p.nativeBundle!,out:SurveyNativeReport={importId:p.importId,definitionHash:native.source.definitionHash,status:'FAILED',factsHash:null,views:{student:null,researcher:null},errorCode:null}
  try{
   const {frozen,pack}=nativeProfilePackage(native),scales=[]
   for(const slot of frozen.bundleSnapshot.slotBindings.filter(s=>s.unitType==='SCALE')){
    const binding=p.slots.find(s=>s.slotKey===slot.slotKey),unit=snapshot.units.find(u=>u.draftId===binding?.draftId&&u.instrumentKey===binding.instrumentKey),result=calculated.units.find(r=>r.instrumentKey===binding?.instrumentKey)
    if(!unit||!result||result.notExecuted)continue
    if(result.sourceDigest!==unit.sourceDigest||result.scoringDigest!==unit.scoringDigest)throw new Error('SURVEY_NATIVE_RESULT_IDENTITY')
    const definition=unit.compiledDefinition as ScaleDefinitionV2,scored=result.privateScoring as import('../scale/scale-scoring').ScaleScoringOutput
    const source=projectBundleScaleSource({slotKey:slot.slotKey,expectedInstrumentKey:slot.instrumentKey,expectedInstrumentVersion:slot.instrumentVersion,result:{schemaVersion:2,instrument:{scaleId:unit.draftId,code:slot.instrumentKey,name:unit.title,instrumentVersion:slot.instrumentVersion},method:{scaleId:unit.draftId,instrumentVersion:slot.instrumentVersion,scoringVersion:definition.scoring.scoringVersion,reportVersion:definition.report.reportVersion,definitionHash:hashScaleDefinition(definition),referenceVersions:[],assessmentContext:null},quality:scored.quality,itemScores:scored.itemScores,scores:scored.scores,references:[],interpretations:[],caveats:[],disclaimer:'Frozen Survey FINAL score projection'}})
    scales.push({...source,profileIdentity:{runtimeDefinitionHash:canonicalHash(unit.compiledDefinition),scoringVersion:(unit.compiledDefinition as ScaleDefinitionV2).scoring.scoringVersion,sourceResultId:unit.instrumentKey,qualityFlags:[...scored.quality.flags]}})
   }
   const values:Record<string,unknown>={}
   for(const c of native.source.context){
    const b=p.slots.find(s=>s.slotKey===c.slotKey),r=calculated.units.find(r=>r.instrumentKey===b?.instrumentKey),value=r?.rawAnswers[c.itemKey]
    const field=frozen.contextDefinition?.fields.find(f=>f.contextKey===c.contextKey)
    values[c.contextKey]=pack.schemaVersion===3&&field?decodeSurveyNativeContext(field,value):typeof value==='string'&&value.trim()!==''?Number(value):value
   }
   if(frozen.contextDefinition&&frozen.contextDefinition.fields.some(f=>(pack.schemaVersion===2||f.required)&&(values[f.contextKey]===undefined||values[f.contextKey]===null||values[f.contextKey]===''))){out.status='UNAVAILABLE';out.errorCode='SURVEY_NATIVE_CONTEXT_MISSING';return out}
   const contextFacts=frozen.contextDefinition?buildBundleContextFactsFromValues({definition:frozen.contextDefinition,values,frozenAt:frozen.frozenAt}):null
   const compiledRuntime=compileBundleRuntimeFromFrozenRead({family:'ASSESSMENT_BUNDLE',snapshotVersion:3,snapshot:frozen.bundleSnapshot})
   const aggregateInputHash=computeReanalysisAggregateInputHash({snapshotHash:frozen.bundleSnapshot.snapshotHash,compiledBundleRuntimeHash:compiledRuntime.compiledRuntimeHash,scaleSources:scales,cognitiveSources:[],situationalSources:[],contextSnapshotHash:contextFacts?.contextSnapshotHash??null})
   const facts=projectBundleReportFacts({registry:createProductBundleAnalysisEngineRegistry(),engineInput:{snapshot:frozen.bundleSnapshot,compiledRuntime,evidence:[],aggregateInputHash,contextFacts,scaleSources:scales,declarativePackage:pack}})
   out.factsHash=canonicalHash(facts)
   if(facts.enginePayload.kind==='UNAVAILABLE'){out.status='UNAVAILABLE';return out}
   const profile=pack.schemaVersion===2?(facts.enginePayload.payload as {profile:ProfileResult}).profile:null
   if(pack.schemaVersion===3)out.derivedViews={student:null,researcher:null}
   for(const audience of ['student','researcher'] as const){
    const policies=new Map(Object.entries(native.policies).map(([slot,policy])=>{
     const capabilities=resolveAudienceDisclosure(policy.disclosure,audience==='student'?'subject':'researcher')
     // A raw-metric selection never upgrades a researcher-only or absent R.
     if(policy.disposition==='UNKNOWN'||native.reportAudiences[slot]!==audience)for(const key of Object.keys(capabilities) as Array<keyof typeof capabilities>)capabilities[key]=false
     return [slot,capabilities] as const
    }))
    if(pack.schemaVersion===2&&profile)out.views[audience]=projectProfileView(profile,pack,policies,audience==='researcher',audience==='student'?'student':'admin')
    else if(pack.schemaVersion===3)out.derivedViews![audience]=projectDerivedBundleView({pack,payload:facts.enginePayload.payload,evidence:facts.evidence,
      policies,availableEvidenceKeys:new Set(pack.evidence.map(e=>e.evidenceKey)),audience:audience==='student'?'student':'admin'})
   }
   out.status=profile&&['INVALID','INSUFFICIENT','NOT_APPLICABLE'].includes(profile.state)?'UNAVAILABLE':'READY'
  }catch{out.errorCode='SURVEY_NATIVE_ANALYSIS_FAILED'}
  return out
 })
}
/** Current participant authority is owned by the caller. All core single reports
 * and selected metrics must also be released before their combined explanation. */
export function savedSurveyNativeFeedback(packages:readonly FrozenGovernedPackage[],result:SurveyComputedFinal,released:ReadonlyMap<string,ReadonlySet<string>>){
 return packages.filter(p=>p.nativeBundle).flatMap(p=>{
  const native=p.nativeBundle!,{pack}=nativeProfilePackage(native),saved=result.nativeBundleReports?.find(r=>r.importId===p.importId)
  if(!saved||saved.definitionHash!==native.source.definitionHash)return []
  if(pack.schemaVersion===3){
   const view=saved.derivedViews?.student
   if(!view)return []
   // Intersect saved authorized rows, without rerunning the engine or reading a
   // current catalog. A newly released metric cannot restore a redacted row.
   const allowed=new Set(pack.evidence.filter(e=>e.role==='CONTEXT'||(()=>{const b=p.slots.find(s=>s.slotKey===e.slotKey);return !!b&&released.get(b.instrumentKey)?.has(e.selector)})()).map(e=>e.evidenceKey))
   return [{importId:p.importId,title:p.title,status:saved.status,factsHash:saved.factsHash,profileView:null,
    derivedView:restrictSavedDerivedView(pack,view,allowed)}]
  }
  if(pack.profile.bindings.some(core=>{const e=pack.evidence.find(e=>e.evidenceKey===core.evidenceKey)!,b=p.slots.find(s=>s.slotKey===e.slotKey);return !b||!released.get(b.instrumentKey)?.has(e.selector)}))return []
  return [{importId:p.importId,title:p.title,status:saved.status,factsHash:saved.factsHash,profileView:saved.views.student}]
 })
}
