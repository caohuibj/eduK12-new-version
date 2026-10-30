import path from 'node:path'
import {loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {parseBundleContextDefinition,buildBundleContextFactsFromValues} from '../../modules/assessment-bundle/context'
import {buildFrozenAssessmentBundleSnapshot} from '../../modules/assessment-bundle/snapshot'
import {compileBundleRuntimeFromFrozenRead} from '../../modules/assessment-bundle/compile'
import {mapDeclarativeEvidence,runProfileEvidence} from '../../modules/assessment-bundle/onboarding/engine'
import type {BundleEngineInputV1} from '../../modules/assessment-bundle/registry'
import type {ProfileResult} from '../../modules/assessment-bundle/profile/match'
export function teacherJdrPackage(){
  const p=loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages/teacher_jdr_workplace_zh_cn/0.1.0'))
  if(p.schemaVersion!==2)throw new Error('JDR_PROFILE_REQUIRED')
  return p
}
/** Already scored synthetic projections; no source scorer is run by unit tests. */
export function teacherJdrInput(values:Record<string,number|null>={demands:2,control:4,manager:4,peer:4}):BundleEngineInputV1{
  const pack=teacherJdrPackage(),context=parseBundleContextDefinition(pack.context)
  const snapshot=buildFrozenAssessmentBundleSnapshot(pack.manifest.definition,{contextDefinition:context})
  const scaleSources=pack.manifest.definition.slots.filter(s=>s.unitType==='SCALE').map(slot=>{
    const b=pack.profile.bindings.find(b=>b.evidenceKey===slot.slotKey),value=slot.slotKey==='burnout'?50:values[slot.slotKey]??null
    return {slotKey:slot.slotKey,instrumentKey:slot.instrumentKey,instrumentVersion:slot.instrumentVersion,
      sourceResultHash:canonicalHash({synthetic:true,slot:slot.slotKey,value}),envelopeResultHash:null,qualityState:'interpretable' as const,
      ...(b?{profileIdentity:{runtimeDefinitionHash:b.source.runtimeDefinitionHash!,scoringVersion:b.source.scoringVersion,sourceResultId:'synthetic-'+slot.slotKey,qualityFlags:[]}}:{}),
      scores:[{scoreKey:slot.valueSelectors![0],value,status:value===null?'not_calculable' as const:'calculated' as const,criterionBandKey:null}]}
  })
  const input:BundleEngineInputV1={snapshot,compiledRuntime:compileBundleRuntimeFromFrozenRead({family:'ASSESSMENT_BUNDLE',snapshotVersion:3,snapshot}),aggregateInputHash:null,scaleSources,
    contextFacts:buildBundleContextFactsFromValues({definition:context,values:{adult_confirmed:true,teaching_confirmed:true},frozenAt:'2026-10-30T07:00:00.000Z'}),evidence:[],declarativePackage:pack}
  input.evidence=mapDeclarativeEvidence(input);return input
}
export function runTeacherJdr(input=teacherJdrInput()):ProfileResult{
  const result=runProfileEvidence(input)
  if(result.kind!=='COMPUTED')throw new Error('JDR_EXPECTED_COMPUTED')
  return (result.payload as {profile:ProfileResult}).profile
}
