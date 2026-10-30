import {describe,it,expect} from 'vitest'
import path from 'node:path'
import {loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import {hashDeclarativePackage,parseDeclarativePackage} from '../../modules/assessment-bundle/onboarding/contract'
import {verifyPackageFixtures} from '../../modules/assessment-bundle/onboarding/fixtures'
import {profileContextForm} from '../../modules/assessment-bundle/profile/admission'
import {runBundleProfile} from '../../modules/assessment-bundle/profile/match'
import {buildFrozenAssessmentBundleSnapshot} from '../../modules/assessment-bundle/snapshot'
import {compileBundleRuntimeFromFrozenRead} from '../../modules/assessment-bundle/compile'
import {parseBundleContextDefinition} from '../../modules/assessment-bundle/context'
import {contextValues} from '../../modules/bundle-product/context-submission'
import type {BundleEngineInputV1} from '../../modules/assessment-bundle/registry'
import type {EvidenceItemV1,FactPresenceV1} from '../../modules/assessment-bundle/types'

function legacy(version='0.1.2'){
  const p=loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages/learning_motivation_math_support',version))
  if(p.schemaVersion!==2)throw new Error('PROFILE_FIXTURE_REQUIRED')
  return p
}
// Reuse an existing synthetic model solely to test the new gate. This is not a
// JD-R scientific configuration and does not adopt any new centers or thresholds.
function adultPackage(){
  const p=structuredClone(legacy())
  p.profile.applicability={kind:'ADULT_TEACHER',domain:'synthetic-adult-gate',adultEvidenceKey:'adult',teacherEvidenceKey:'teaching'}
  const grade=p.evidence.find(e=>e.evidenceKey==='grade')!
  p.evidence=p.evidence.filter(e=>e.evidenceKey!=='grade')
  for(const [evidenceKey,selector] of [['adult','adult_confirmed'],['teaching','teaching_confirmed']])p.evidence.push({...grade,evidenceKey,selector,valueType:'boolean'})
  p.context={schemaVersion:1,contextDefinitionKey:p.manifest.definition.contextDefinitionKey,contextDefinitionVersion:p.manifest.definition.contextDefinitionVersion,
    fields:[{contextKey:'adult_confirmed',required:true,valueType:'boolean'},{contextKey:'teaching_confirmed',required:true,valueType:'boolean'}]}
  for(const fixture of Object.values(p.fixtures)){
    delete fixture.values.grade
    fixture.values.adult={state:'present',value:true};fixture.values.teaching={state:'present',value:true}
  }
  p.fixtures['not-applicable'].values.adult={state:'present',value:false}
  return p
}
function gateInput(p:ReturnType<typeof adultPackage>,values:Record<string,FactPresenceV1>):BundleEngineInputV1{
  const snapshot=buildFrozenAssessmentBundleSnapshot(p.manifest.definition,{contextDefinition:parseBundleContextDefinition(p.context)})
  const evidence:EvidenceItemV1[]=Object.entries(values).map(([key,value])=>({evidenceKey:key,constructKey:'context.'+key,role:'CONTEXT',criterionBandKey:null,
    source:{kind:'CONTEXT_FACT',contextKey:key,contextSnapshotHash:'0'.repeat(64)},value,quality:value.state==='invalid'?'invalid':'interpretable'}))
  return {snapshot,compiledRuntime:compileBundleRuntimeFromFrozenRead({family:'ASSESSMENT_BUNDLE',snapshotVersion:3,snapshot}),evidence,contextFacts:null,aggregateInputHash:null,scaleSources:[],declarativePackage:p}
}

describe('explicit adult teacher applicability',()=>{
  it('keeps both frozen EVC package hashes and the original grade gate',()=>{
    expect(hashDeclarativePackage(legacy('0.1.1'))).toBe('34625844b7014e409a423e99ee2f31fdf28f3d41f629d6432a928e9a2214a941')
    const p=legacy()
    expect(hashDeclarativePackage(p)).toBe('e89a182bd7a499bbd1d0a23e1b76d28c0d7719145da2f0c50dceb696c7a14e4c')
    const outside=runBundleProfile(p.profile,gateInput(p,{grade:{state:'present',value:6}}))
    expect(outside).toMatchObject({state:'NOT_APPLICABLE',reasons:['GRADE_OUT_OF_SCOPE'],candidates:[]})
    const inside=runBundleProfile(p.profile,gateInput(p,{grade:{state:'present',value:7}}))
    expect(inside.state).toBe('INSUFFICIENT');expect(inside.reasons).not.toContain('MISSING_GRADE_CONTEXT')
  })
  it('runs the existing synthetic core after two true declarations without any grade',()=>{
    const p=parseDeclarativePackage(adultPackage())
    const previews=verifyPackageFixtures(p)
    expect(previews.map(p=>p.result.kind)).toEqual(['COMPUTED','COMPUTED','COMPUTED','COMPUTED'])
    const valid=previews.find(p=>p.name==='valid')!.result
    expect(valid).toMatchObject({payload:{profile:{state:'MATCHED',profileId:'P4'}}})
  })
  it.each(['adult','teaching'])('abstains when the %s declaration is false',(key)=>{
    const p=adultPackage(),values={adult:{state:'present',value:true},teaching:{state:'present',value:true}} satisfies Record<string,FactPresenceV1>
    const input=gateInput(p,{...values,[key]:{state:'present',value:false}})
    expect(runBundleProfile(p.profile,input)).toMatchObject({state:'NOT_APPLICABLE',profileId:null,constructs:[],candidates:[],reasons:[key+':CONTEXT_OUT_OF_SCOPE']})
  })
  it('distinguishes missing, invalid and limited declarations; strings and zero are not truthy consent',()=>{
    const p=adultPackage(),teacher={teaching:{state:'present',value:true}} satisfies Record<string,FactPresenceV1>
    expect(runBundleProfile(p.profile,gateInput(p,teacher))).toMatchObject({state:'INSUFFICIENT',reasons:['adult:MISSING_CONTEXT']})
    for(const value of [{state:'invalid'},{state:'present',value:'true'},{state:'present',value:0}] satisfies FactPresenceV1[]){
      expect(runBundleProfile(p.profile,gateInput(p,{...teacher,adult:value}))).toMatchObject({state:'INVALID',candidates:[]})
    }
    const limited=gateInput(p,{...teacher,adult:{state:'present',value:true}});limited.evidence.find(e=>e.evidenceKey==='adult')!.quality='limited'
    expect(runBundleProfile(p.profile,limited)).toMatchObject({state:'INSUFFICIENT',reasons:['adult:LIMITED_CONTEXT']})
  })
  it('requires two distinct required boolean Context fields in a required FORM slot',()=>{
    const duplicate=adultPackage();if(!('kind' in duplicate.profile.applicability))throw new Error()
    duplicate.profile.applicability.teacherEvidenceKey='adult'
    expect(()=>parseDeclarativePackage(duplicate)).toThrow('PROFILE_DUPLICATE_APPLICABILITY_CONTEXT')
    const optional=adultPackage();const context=parseBundleContextDefinition(optional.context);context.fields[0].required=false;optional.context=context
    expect(()=>parseDeclarativePackage(optional)).toThrow('required boolean adult/teacher FORM context required')
    const wrongType=adultPackage();wrongType.evidence.find(e=>e.evidenceKey==='adult')!.valueType='number'
    expect(()=>parseDeclarativePackage(wrongType)).toThrow('required boolean adult/teacher FORM context required')
    const sameAnswer=adultPackage();sameAnswer.evidence.find(e=>e.evidenceKey==='teaching')!.selector='adult_confirmed'
    expect(()=>parseDeclarativePackage(sameAnswer)).toThrow('profile.applicability.context: duplicate identity')
  })
  it('uses the existing boolean FORM submission without assigning a grade, role or data grant',()=>{
    const p=parseDeclarativePackage(adultPackage()),context=parseBundleContextDefinition(p.context)
    const forms=context.fields.map(field=>profileContextForm(p,field)!)
    expect(forms.map(f=>f.formLabel)).toEqual(['您是否已满18周岁？','您目前是否在中小学有实际教学职责？'])
    expect(forms.every(f=>!('contextKey' in f))).toBe(true)
    expect(forms.map(f=>f.formOptions)).toEqual(Array.from({length:2},()=>[{value:'true',label:'是'},{value:'false',label:'否'}]))
    expect(contextValues([{contextKey:'adult_confirmed',itemId:'a',valueType:'boolean'},{contextKey:'teaching_confirmed',itemId:'t',valueType:'boolean'}],[{key:'a',value:'true'},{key:'t',value:'false'}])).toEqual({adult_confirmed:true,teaching_confirmed:false})
    const old=legacy();expect(profileContextForm(old,parseBundleContextDefinition(old.context).fields[0])).toMatchObject({contextKey:'gradeLevel',formLabel:'年级'})
  })
})
