import {describe,it,expect} from 'vitest'
import path from 'node:path'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import {hashDeclarativePackage,parseDeclarativePackage} from '../../modules/assessment-bundle/onboarding/contract'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import {freezeBundleProductionDefinition,readFrozenBundleProductionDefinition} from '../../modules/bundle-product/definition-provider'
import {projectProfileView} from '../../modules/assessment-bundle/profile/report'
import type {ProfileResult,ProfileState} from '../../modules/assessment-bundle/profile/match'
import {getScaleInstrumentSource} from '../../modules/scale/onboarding/instrument-registry'
import type {ScaleDisclosureAudience} from '../../modules/scale/policy/types'

function pack(version:string){
  const value=loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages/learning_motivation_math_support',version))
  if(value.schemaVersion!==2)throw new Error('PROFILE_PACKAGE_REQUIRED')
  return value
}
const old=pack('0.1.1'),current=pack('0.1.2')
function result(state:ProfileState,template=current):ProfileResult{
  return {schemaVersion:'bundle-profile-result-v1',state,profileId:state==='MATCHED'?'P4':null,ruleProfileId:null,
    constructs:[],candidates:[],margin:null,reasons:['e:IDENTITY_MISMATCH','PRIVATE_INTERNAL_ERROR_AND_VERSION_DETAIL'],
    model:{key:template.profile.key,version:template.profile.version,hash:canonicalHash(template.profile),mappingVersion:template.profile.mappingVersion,
      templateVersion:template.profile.templateVersion,algorithm:template.profile.algorithm,maturity:'EXPERIMENTAL'},
    trace:{evidenceKeys:[],sourceResultHashes:[],supportRefs:[]},uncertainty:{inputCoverage:0,empiricalClassValidation:'NOT_ESTABLISHED',probabilityAvailable:false}}
}
function policies(audience:ScaleDisclosureAudience){
  return new Map(current.profile.bindings.map(b=>[current.evidence.find(e=>e.evidenceKey===b.evidenceKey)!.slotKey,
    {...getScaleInstrumentSource(b.source.instrumentKey,b.source.instrumentVersion)!.disclosure.audiences[audience]!}]))
}
const states=['INSUFFICIENT','INVALID','NOT_APPLICABLE','UNCLASSIFIED','MIXED','BOUNDARY'] as const
describe('frozen profile status feedback',()=>{
  it.each(states)('explains %s using only frozen reader-facing text',state=>{
    const view=projectProfileView(result(state),current,policies('subject'),false)
    expect(view.state).toBe(state)
    expect(view.explanation).toBe(current.report.profileStateExplanations![state])
    expect(view.explanation).toContain('已获准展示的单项结果')
    expect(view.profileId).toBeNull()
    expect(view.actions).toEqual([]) // Existing source educationalContent=false remains authoritative.
    expect(JSON.stringify(view)).not.toMatch(/IDENTITY_MISMATCH|PRIVATE_INTERNAL|VERSION_DETAIL/)
  })
  it('withholds explanation for denied audiences and either missing interpretation capability',()=>{
    for(const audience of ['teacher','researcher'] as const){
      expect(projectProfileView(result('INVALID'),current,policies(audience),false)).toMatchObject({state:'WITHHELD',explanation:null,actions:[]})
    }
    for(const capability of ['individualInterpretations','scoreDerivedLabels'] as const){
      const limited=policies('subject');limited.get('vc')![capability]=false
      expect(projectProfileView(result('INSUFFICIENT'),current,limited,false)).toMatchObject({state:'WITHHELD',explanation:null,profileId:null,actions:[]})
    }
    expect(projectProfileView(result('UNCLASSIFIED'),current,new Map(),false)).toMatchObject({state:'WITHHELD',explanation:null,constructs:[],methods:null})
  })
  it('keeps matched summaries and source-limited actions unchanged',()=>{
    const matched=result('MATCHED')
    expect(projectProfileView(matched,current,policies('subject'),false)).toMatchObject({profileId:'P4',explanation:old.profile.profiles.find(p=>p.id==='P4')!.summary,actions:[]})
  })
  it('reopens the old frozen definition without importing the new template',()=>{
    const frozen=freezeBundleProductionDefinition(packageEntry(old),{frozenAt:'2026-10-29T12:00:00.000Z',sourceReference:'learning_motivation_math_support@0.1.1'})
    const bytes=JSON.stringify(frozen),saved=JSON.stringify(projectProfileView(result('INVALID',old),old,policies('subject'),false))
    expect(hashDeclarativePackage(old)).toBe('34625844b7014e409a423e99ee2f31fdf28f3d41f629d6432a928e9a2214a941')
    const reopened=readFrozenBundleProductionDefinition(JSON.parse(bytes)).declarativePackage!
    for(const state of states)expect(projectProfileView(result(state,old),reopened,policies('subject'),false).explanation).toBeNull()
    expect(JSON.stringify(projectProfileView(result('INVALID',old),reopened,policies('subject'),false))).toBe(saved)
    expect(JSON.stringify(frozen)).toBe(bytes)
    expect(hashDeclarativePackage(current)).not.toBe(hashDeclarativePackage(old))
    expect({...current.profile,templateVersion:old.profile.templateVersion}).toEqual(old.profile)
    expect(current.report.version).toBe('0.1.1');expect(current.profile.templateVersion).toBe('0.1.1')
    expect(current.publication.requestedStatus).toBe('DRAFT')
  })
  it('freezes feedback in the package hash and requires a complete bounded state template',()=>{
    const changed=structuredClone(current);changed.report.profileStateExplanations!.INVALID+=' 请结合单项阅读。'
    expect(hashDeclarativePackage(changed)).not.toBe(hashDeclarativePackage(current))
    const incomplete=structuredClone(current) as unknown as {report:{profileStateExplanations:Record<string,string>}}
    delete incomplete.report.profileStateExplanations.INVALID
    expect(()=>parseDeclarativePackage(incomplete)).toThrow()
    const mismatched=structuredClone(current);mismatched.report.version='0.1.2'
    expect(()=>parseDeclarativePackage(mismatched)).toThrow()
  })
})
