import { parseDeclarativePackage } from './contract'
import { runDeclarativeEvidence } from './engine'
import type { EvidenceItemV1 } from '../types'
export function verifyPackageFixtures(raw:unknown){
  const p=parseDeclarativePackage(raw)
  for(const [name,fixture] of Object.entries(p.fixtures)){
    if(Object.keys(fixture.values).some(key=>!p.evidence.some(e=>e.evidenceKey===key)))throw new Error('FIXTURE_UNKNOWN_EVIDENCE:'+name)
    const evidence:EvidenceItemV1[]=p.evidence.map(e=>({evidenceKey:e.evidenceKey,constructKey:e.construct,role:e.role,criterionBandKey:null,
      source:{kind:'CONTEXT_FACT',contextKey:e.evidenceKey,contextSnapshotHash:'0'.repeat(64)},value:fixture.values[e.evidenceKey]??{state:'missing'},
      quality:fixture.values[e.evidenceKey]?.state==='present'?'interpretable':fixture.values[e.evidenceKey]?.state==='invalid'?'invalid':'unavailable'}))
    const result=runDeclarativeEvidence({snapshot:{bundleKey:p.manifest.definition.bundleKey,bundleVersion:p.manifest.definition.bundleVersion} as any,compiledRuntime:{} as any,contextFacts:null,aggregateInputHash:null,evidence,declarativePackage:p})
    const actual=result.kind==='COMPUTED'?(result.payload as any).conclusions.map((c:any)=>c.ruleId).sort():[]
    if(result.kind!==fixture.expectedKind||JSON.stringify(actual)!==JSON.stringify([...fixture.expectedRuleIds].sort()))throw new Error('BUNDLE_FIXTURE_MISMATCH:'+name)
  }
}
