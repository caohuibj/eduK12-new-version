import { describe,it,expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createCanonicalUnitResultEnvelope } from '../../modules/assessment-runtime/unit-result'
import { buildBundleContextFactsFromValues,parseBundleContextDefinition } from '../../modules/assessment-bundle/context'
import { buildFrozenAssessmentBundleSnapshot } from '../../modules/assessment-bundle/snapshot'
import { compileBundleRuntimeFromFrozenRead } from '../../modules/assessment-bundle/compile'
import { mapDeclarativeEvidence,runDeclarativeEvidence,runProfileEvidence } from '../../modules/assessment-bundle/onboarding/engine'
import { hashDeclarativePackage,parseDeclarativePackage } from '../../modules/assessment-bundle/onboarding/contract'
import { loadPackage,writePackage } from '../../modules/assessment-bundle/onboarding/loader'
import { projectProfileScaleSource } from '../../modules/assessment-bundle/profile/sources'
import { projectProfileView } from '../../modules/assessment-bundle/profile/report'
import { DISCLOSURE_PRESETS } from '../../modules/scale/policy/disclosure'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { scaffoldPackage } from '../../modules/assessment-bundle/onboarding/template'
import type { BundleEngineInputV1 } from '../../modules/assessment-bundle/registry'
import type { ProfileResult } from '../../modules/assessment-bundle/profile/match'

const pack=loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages/learning_motivation_math_support/0.1.1'))
if(pack.schemaVersion!==2)throw new Error('PROFILE_FIXTURE_REQUIRED')
const model=pack.profile
function input(e:number|null=2.2,v=5,c=5,grade=9):BundleEngineInputV1{
  const snapshot=buildFrozenAssessmentBundleSnapshot(pack.manifest.definition,{contextDefinition:parseBundleContextDefinition(pack.context)})
  const scaleSources=pack.manifest.definition.slots.filter(s=>s.unitType==='SCALE').map(slot=>{
    const binding=model.bindings.find(b=>b.source.instrumentKey===slot.instrumentKey)!
    const rows=pack.evidence.filter(m=>m.slotKey===slot.slotKey).map(m=>({scoreKey:m.selector,value:m.evidenceKey==='e'?e:m.evidenceKey==='v'?v:c,status:(m.evidenceKey==='e' && e===null?'not_calculable':'calculated') as 'calculated'|'not_calculable',criterionBandKey:null}))
    const envelope=createCanonicalUnitResultEnvelope({
      core:{schemaVersion:1,unitType:'SCALE',instrumentKey:slot.instrumentKey,instrumentVersion:slot.instrumentVersion,sourceDefinitionHash:binding.source.runtimeDefinitionHash!,
        compilerVersion:'1.0.0',compiledRuntimeHash:'a'.repeat(64),scorerKey:'synthetic-unit-scorer',scorerVersion:'1.0.0',quality:{status:'interpretable',flags:[]},
        metrics:[],facts:[],references:[],contextHash:null,scientificProvenance:{instrumentKey:slot.instrumentKey,instrumentVersion:slot.instrumentVersion}},
      completedAt:'2026-10-29T12:00:00.000Z',persistenceProvenance:{sourceType:'ASSESSMENT',sourceAttemptId:'synthetic-'+slot.slotKey},
      bundleBridge:{sourceResultHash:canonicalHash({synthetic:true,slot:slot.slotKey,rows}),scores:rows},
    })
    return projectProfileScaleSource({slotKey:slot.slotKey,expectedInstrumentKey:slot.instrumentKey,expectedInstrumentVersion:slot.instrumentVersion,envelope})
  })
  const result:BundleEngineInputV1={snapshot,compiledRuntime:compileBundleRuntimeFromFrozenRead({family:'ASSESSMENT_BUNDLE',snapshotVersion:3,snapshot}),
    contextFacts:buildBundleContextFactsFromValues({definition:parseBundleContextDefinition(pack.context),values:{grade_level:grade},frozenAt:'2026-10-29T12:00:00.000Z'}),
    aggregateInputHash:null,evidence:[],scaleSources,declarativePackage:pack}
  result.evidence=mapDeclarativeEvidence(result)
  return result
}
function run(i=input(),p=pack):ProfileResult{
  const result=runProfileEvidence({...i,declarativePackage:p})
  if(result.kind!=='COMPUTED')throw new Error('PROFILE_EXPECTED')
  return (result.payload as {profile:ProfileResult}).profile
}
describe('independent candidate B native profile',()=>{
  it.each([
    ['P1',4.2,5,2],['P2',4.2,5,5],['P3',1.8,5,2],['P4',2.2,5,5],['P5',4.2,2,2],['P6',1.8,2,5],
  ] as const)('matches theoretical %s without changing B parameters',(id,e,v,c)=>expect(run(input(e,v,c))).toMatchObject({state:'MATCHED',profileId:id}))
  it('matches the independent hand calculation for S04, rather than probability normalization',()=>{
    const result=run()
    // (.1+0+0)/3=.0333333; P2 differs by .5/3.
    expect(result.candidates[0]).toMatchObject({profileId:'P4',distance:.033333,matchingScore:96.666667,fuzzyRuleMembership:.8})
    expect(result.candidates[1]).toMatchObject({profileId:'P2',matchingScore:83.333333})
    expect(result.margin).toBe(13.333333)
    expect(result.candidates.reduce((n,c)=>n+c.matchingScore,0)).toBeGreaterThan(100)
  })
  it('separates null, invalid true zero, partial quality and identity mismatch',()=>{
    expect(run(input(null)).state).toBe('INSUFFICIENT')
    expect(run(input(0)).state).toBe('INVALID') // real zero exists; outside the 1–5 source range
    const limited=input();limited.evidence[0].quality='limited';expect(run(limited).state).toBe('INSUFFICIENT')
    const mismatch=input();mismatch.scaleSources![0].instrumentVersion='2.0.0';expect(run(mismatch).state).toBe('INVALID')
    const invalid=input();invalid.evidence.find(e=>e.evidenceKey==='c')!.quality='invalid';expect(run(invalid).state).toBe('INVALID')
    const unknown=input();delete (unknown.scaleSources![0] as any).profileIdentity;expect(run(unknown).state).toBe('INSUFFICIENT')
  })
  it('abstains for ties, unmodelled extreme combinations, absolute mismatch and rule boundary',()=>{
    expect(run(input(3,5,5))).toMatchObject({state:'MIXED',profileId:null,margin:0})
    expect(run(input(4.2,2,5))).toMatchObject({state:'UNCLASSIFIED',profileId:null})
    expect(run(input(1,1,1))).toMatchObject({state:'UNCLASSIFIED',profileId:null})
    const p=structuredClone(pack);if(p.schemaVersion!==2)throw new Error();p.profile.matching.minimumMatchingScore=99
    expect(run(input(3,3.5,3.5),p).state).toBe('UNCLASSIFIED') // absolute refusal precedes a close pair
    const weighted=structuredClone(pack);if(weighted.schemaVersion!==2)throw new Error();weighted.profile.bindings[0].weight=2
    expect(run(input(3.4,5,5),weighted)).toMatchObject({state:'BOUNDARY',profileId:null})
    expect(run(input(2.2,5,5,6)).state).toBe('NOT_APPLICABLE')
  })
  it('is deterministic under source order and has explicit direction reflection',()=>{
    const i=input(),first=run(i);i.scaleSources!.reverse();i.evidence.reverse();expect(run(i)).toEqual(first)
    const reflected=structuredClone(pack);if(reflected.schemaVersion!==2)throw new Error();reflected.profile.bindings[0].transformation.orientation='REFLECT'
    expect(run(input(3.8,5,5),reflected).constructs.find(c=>c.evidenceKey==='e')!.coordinate).toBeCloseTo(.3)
  })
  it('keeps raw original-range values and withholds all derived labels for actual teacher policy',()=>{
    const policies=new Map(model.bindings.map(b=>[pack.evidence.find(e=>e.evidenceKey===b.evidenceKey)!.slotKey,
      getScaleInstrumentSource(b.source.instrumentKey,b.source.instrumentVersion)!.disclosure.audiences.teacher!]))
    const view=projectProfileView(run(),pack,policies,true)
    expect(view).toMatchObject({state:'WITHHELD',profileId:null,candidates:[],actions:[]})
    expect(view.constructs.map(c=>c.raw)).toEqual([2.2,5,5])
    expect(view.constructs.every(c=>c.referenceCenter===null)).toBe(true)
    expect(JSON.stringify(view)).not.toContain('P4')
  })
  it('intersects every core source; numeric and educational permissions stay independent',()=>{
    const policies=new Map(['ase','vc'].map(k=>[k,DISCLOSURE_PRESETS.FULL_REPORT()]))
    const full=projectProfileView(run(),pack,policies,false)
    expect(full.profileId).toBe('P4');expect(full.actions).toHaveLength(3);expect(full.candidates).toEqual([])
    policies.set('vc',{...DISCLOSURE_PRESETS.FULL_REPORT(),numericScores:false,educationalContent:false})
    const numeric=projectProfileView(run(),pack,policies,true)
    expect(numeric.constructs).toHaveLength(1);expect(numeric.candidates).toEqual([]);expect(numeric.actions).toEqual([])
    policies.set('vc',DISCLOSURE_PRESETS.COMPLETION_ONLY())
    expect(projectProfileView(run(),pack,policies,true).profileId).toBeNull()
    expect(projectProfileView(run(),pack,new Map(),true)).toMatchObject({state:'WITHHELD',constructs:[],candidates:[],actions:[],methods:null})
  })
  it('rejects altered canonical provenance before adapter projection',()=>{
    const base=input().scaleSources![0]
    expect(base.envelopeResultHash).toMatch(/^[a-f0-9]{64}$/)
    expect(()=>projectProfileScaleSource({slotKey:'ase',expectedInstrumentKey:'bad',expectedInstrumentVersion:'1.0.0',envelope:{} as any})).toThrow()
  })
})
describe('native profile package compatibility',()=>{
  it('preserves package1 parsed bytes and the previous content hash formula',()=>{
    const old=scaffoldPackage('old_fixture'),{publication:_,...content}=old
    expect(parseDeclarativePackage(old)).toEqual(old)
    expect(hashDeclarativePackage(old)).toBe(canonicalHash(content))
    expect(()=>runDeclarativeEvidence(input())).toThrow('VERSION_MISMATCH')
    expect(()=>runProfileEvidence({...input(),declarativePackage:old})).toThrow('VERSION_MISMATCH')
  })
  it('roundtrips all profile bytes through the normal package loader',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evc-profile-')),target=path.join(dir,'package')
    try{writePackage(target,pack);expect(loadPackage(target)).toEqual(pack)}finally{fs.rmSync(dir,{recursive:true,force:true})}
    const p=structuredClone(pack);if(p.schemaVersion!==2)throw new Error();const previous=hashDeclarativePackage(p);p.profile.profiles[0].summary+=' 新模板';expect(hashDeclarativePackage(p)).not.toBe(previous)
  })
  it.each([
    (p:any)=>p.profile.bindings[1].contributionGroup=p.profile.bindings[0].contributionGroup,
    (p:any)=>p.profile.bindings[0].weight=0,
    (p:any)=>p.profile.profiles[0].centers['math.academic_self_efficacy']=.1,
    (p:any)=>p.profile.bindings[0].evidenceKey='missing',
    (p:any)=>p.profile.profiles[0].supportRefs=['missing'],
    (p:any)=>p.profile.modifierRuleIds=['not_a_rule'],
    (p:any)=>p.profile.algorithm='online-lpa',
    (p:any)=>p.manifest.definition.engine.version='1.0.0',
  ])('rejects ambiguous or unsupported model configuration',(mutate)=>{
    const p=structuredClone(pack);mutate(p);expect(()=>parseDeclarativePackage(p)).toThrow()
  })
})


it('keeps a complete selected core independent of unselected score quality',()=>{
  const i=input(),vc=i.scaleSources!.find(s=>s.slotKey==='vc')!
  vc.qualityState='invalid'
  vc.scores.push({scoreKey:'synthetic_unselected_aux',value:null,status:'not_calculable',criterionBandKey:null})
  ;(vc as any).profileIdentity.qualityFlags=['missing_items','score_not_calculable']
  i.evidence=mapDeclarativeEvidence(i)
  expect(run(i)).toMatchObject({state:'MATCHED',profileId:'P4'})
  vc.scores.find(s=>s.scoreKey==='cost')!.status='not_calculable'
  vc.scores.find(s=>s.scoreKey==='cost')!.value=null
  i.evidence=mapDeclarativeEvidence(i)
  expect(run(i)).toMatchObject({state:'INSUFFICIENT',profileId:null})
})
