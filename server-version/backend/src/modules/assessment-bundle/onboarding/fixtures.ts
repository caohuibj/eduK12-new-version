import { parseDeclarativePackage } from './contract'
import { canonicalHash } from '../../assessment-runtime/canonical'
import { runDeclarativeEvidence, runProfileEvidence,runDerivedEvidence } from './engine'
import type { EvidenceItemV1 } from '../types'
import type { BundleEngineResultV1 } from '../registry'
export function verifyPackageFixtures(raw:unknown){
  const p=parseDeclarativePackage(raw)
  const previews: Array<{ name: string; result: BundleEngineResultV1 }> = []
  for(const [name,fixture] of Object.entries(p.fixtures)){
    if(Object.keys(fixture.values).some(key=>!p.evidence.some(e=>e.evidenceKey===key)))throw new Error('FIXTURE_UNKNOWN_EVIDENCE:'+name)
    const evidence:EvidenceItemV1[]=p.evidence.map(e=>({evidenceKey:e.evidenceKey,constructKey:e.construct,role:e.role,criterionBandKey:null,
      source:{kind:'CONTEXT_FACT',contextKey:e.evidenceKey,contextSnapshotHash:'0'.repeat(64)},value:fixture.values[e.evidenceKey]??{state:'missing'},
      quality:fixture.values[e.evidenceKey]?.state==='present'?'interpretable':fixture.values[e.evidenceKey]?.state==='invalid'?'invalid':'unavailable'}))
    // Package fixtures are explicitly synthetic contract inputs, not FINAL evidence.
    if(p.schemaVersion===2)for(const e of evidence){const mapping=p.evidence.find(m=>m.evidenceKey===e.evidenceKey)!,slot=p.manifest.definition.slots.find(s=>s.slotKey===mapping.slotKey)!
      if(slot.unitType==='SCALE')e.source={kind:'SCALE_SCORE',slotKey:slot.slotKey,scoreKey:mapping.selector,sourceResultHash:canonicalHash({fixture:name,slot:slot.slotKey,values:fixture.values})}
    }
    const scaleSources=p.schemaVersion===2?p.manifest.definition.slots.filter(s=>s.unitType==='SCALE').map(slot=>{
      const b=p.profile.bindings.find(b=>p.evidence.find(e=>e.evidenceKey===b.evidenceKey)?.slotKey===slot.slotKey)
      return {slotKey:slot.slotKey,instrumentKey:slot.instrumentKey,instrumentVersion:slot.instrumentVersion,sourceResultHash:canonicalHash({fixture:name,slot:slot.slotKey,values:fixture.values}),envelopeResultHash:null,
        qualityState:'interpretable' as const,...(b?{profileIdentity:{runtimeDefinitionHash:b.source.runtimeDefinitionHash,scoringVersion:b.source.scoringVersion,sourceResultId:'synthetic-fixture',qualityFlags:[]}}:{}),
        scores:p.evidence.filter(e=>e.slotKey===slot.slotKey).map(e=>({scoreKey:e.selector,value:fixture.values[e.evidenceKey]?.state==='present'?(fixture.values[e.evidenceKey] as {value:number}).value:null,status:'calculated' as const,criterionBandKey:null}))}
    }):undefined
    const result=(p.schemaVersion===3?runDerivedEvidence:p.schemaVersion===2?runProfileEvidence:runDeclarativeEvidence)({snapshot:{bundleKey:p.manifest.definition.bundleKey,bundleVersion:p.manifest.definition.bundleVersion} as any,compiledRuntime:{} as any,contextFacts:null,aggregateInputHash:null,evidence,declarativePackage:p,scaleSources})
    const actual=result.kind==='COMPUTED'?(result.payload as any).conclusions.map((c:any)=>c.ruleId).sort():[]
    if(result.kind!==fixture.expectedKind||JSON.stringify(actual)!==JSON.stringify([...fixture.expectedRuleIds].sort()))throw new Error('BUNDLE_FIXTURE_MISMATCH:'+name)
    if(p.schemaVersion===2){
      const expected=p.fixtures[name].expectedProfile
      const profile=(result as {payload:{profile:{state:string;profileId:string|null}}}).payload.profile
      if(profile.state!==expected.state || profile.profileId!==expected.profileId)throw new Error('BUNDLE_PROFILE_FIXTURE_MISMATCH:'+name)
    }
    if(p.schemaVersion===3&&p.fixtures[name as keyof typeof p.fixtures].expectedDerived&&result.kind==='COMPUTED'){
      const expected=p.fixtures[name as keyof typeof p.fixtures].expectedDerived!,actual=(result.payload as {derived:import('./derivations').FrozenDerivedValues}).derived
      for(const [key,value] of Object.entries(expected.scalars??{}))if(actual.scalars.find(s=>s.key===key)?.value!==value)throw new Error('BUNDLE_DERIVED_FIXTURE_MISMATCH:'+name+':'+key)
      for(const [key,value] of Object.entries(expected.maxSets??{}))if(JSON.stringify(actual.maxSets.find(s=>s.key===key)?.maxKeys)!==JSON.stringify(value))throw new Error('BUNDLE_DERIVED_FIXTURE_MISMATCH:'+name+':'+key)
      if(expected.theme&&(actual.theme?.state!==expected.theme.state||actual.theme.profileId!==expected.theme.profileId))throw new Error('BUNDLE_DERIVED_FIXTURE_MISMATCH:'+name+':theme')
    }
    previews.push({ name, result })
  }
  return previews
}
