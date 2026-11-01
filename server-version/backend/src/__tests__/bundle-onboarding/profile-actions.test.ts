import {describe,it,expect,vi} from 'vitest'
import path from 'node:path'
import {createHmac} from 'node:crypto'
import type {PrismaClient} from '@prisma/client'
import {canonicalHash,canonicalJsonString} from '../../modules/assessment-runtime/canonical'
import {loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import {hashDeclarativePackage,parseDeclarativePackage} from '../../modules/assessment-bundle/onboarding/contract'
import {projectProfileView} from '../../modules/assessment-bundle/profile/report'
import type {ProfileResult} from '../../modules/assessment-bundle/profile/match'
import {getScaleInstrumentSource} from '../../modules/scale/onboarding/instrument-registry'
import type {ScaleDisclosureAudience} from '../../modules/scale/policy/types'
import {publishPackage,validateReview} from '../../modules/bundle-product/package-release'

function pack(version:string){
  const p=loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages/learning_motivation_math_support',version))
  if(p.schemaVersion!==2)throw new Error('PROFILE_REQUIRED')
  return p
}
const current=pack('0.1.2'),old=pack('0.1.1')
// Presentation of an already computed P4; this suite never invokes a scorer or matcher.
const result:ProfileResult={schemaVersion:'bundle-profile-result-v1',state:'MATCHED',profileId:'P4',ruleProfileId:'P4',
  constructs:[],candidates:[],margin:null,reasons:[],model:{key:current.profile.key,version:current.profile.version,
    hash:canonicalHash(current.profile),mappingVersion:current.profile.mappingVersion,templateVersion:current.profile.templateVersion,
    algorithm:current.profile.algorithm,maturity:'EXPERIMENTAL'},trace:{evidenceKeys:[],sourceResultHashes:[],supportRefs:[]},
  uncertainty:{inputCoverage:1,empiricalClassValidation:'NOT_ESTABLISHED',probabilityAvailable:false}}
function policies(audience:ScaleDisclosureAudience){
  return new Map(current.profile.bindings.map(b=>[current.evidence.find(e=>e.evidenceKey===b.evidenceKey)!.slotKey,
    {...getScaleInstrumentSource(b.source.instrumentKey,b.source.instrumentVersion)!.disclosure.audiences[audience]!}]))
}
describe('Bundle-owned profile actions',()=>{
  it('selects only frozen Bundle action text without raising source educational permissions',()=>{
    const expected=current.profile.profiles.find(p=>p.id==='P4')!.actions.map(a=>a.text)
    for(const audience of ['subject','respondent'] as const){
      const caps=policies(audience),before=JSON.stringify([...caps]);expect([...caps.values()].every(c=>c.educationalContent===false)).toBe(true)
      const view=projectProfileView(result,current,caps,false)
      expect(view.actions).toEqual(expected);expect(view.actions).toHaveLength(3)
      expect(JSON.stringify([...caps])).toBe(before)
    }
  })
  it('still withholds actions for restricted audiences, missing core permissions and an unclassified result',()=>{
    for(const audience of ['teacher','researcher'] as const)expect(projectProfileView(result,current,policies(audience),true)).toMatchObject({state:'WITHHELD',actions:[]})
    for(const capability of ['individualInterpretations','scoreDerivedLabels'] as const){
      const caps=policies('subject');caps.get('vc')![capability]=false
      expect(projectProfileView(result,current,caps,false)).toMatchObject({state:'WITHHELD',actions:[]})
    }
    expect(projectProfileView(result,current,new Map(),false).actions).toEqual([])
    expect(projectProfileView({...result,state:'MIXED',profileId:null},current,policies('subject'),false).actions).toEqual([])
  })
  it('keeps old report content and its hash unchanged and rejects source-material declarations',()=>{
    expect(projectProfileView(result,old,policies('subject'),false).actions).toEqual([])
    expect(hashDeclarativePackage(old)).toBe('34625844b7014e409a423e99ee2f31fdf28f3d41f629d6432a928e9a2214a941')
    expect({...current.profile,templateVersion:old.profile.templateVersion}).toEqual(old.profile)
    const without=structuredClone(current);delete without.report.profileActionContent
    expect(projectProfileView(result,without,policies('subject'),false).actions).toEqual([])
    expect(hashDeclarativePackage(without)).not.toBe(hashDeclarativePackage(current))
    expect(()=>parseDeclarativePackage({...current,report:{...current.report,profileActionContent:'SOURCE_EDUCATIONAL_MATERIALS'}})).toThrow()
  })
  it('uses existing content-bound rights/report review; ordinary allocation is not content approval',async()=>{
    const secret='synthetic-unit-review-key-not-for-publication',hash=hashDeclarativePackage(current)
    const material={contentHash:hash,reviewerId:'synthetic-content-reviewer',expiresAt:'2030-10-31T00:00:00.000Z',
      claims:['cross_source_condition'],scientific:true,rights:true,language:true,report:true}
    const review={...material,signature:createHmac('sha256',secret).update(canonicalJsonString(material)).digest('hex')}
    expect(validateReview(review,hash,secret,Date.parse('2026-10-30T00:00:00Z')).report).toBe(true)
    expect(()=>validateReview(review,hashDeclarativePackage(withoutOwn()),secret,Date.parse('2026-10-30T00:00:00Z'))).toThrow('BUNDLE_REVIEW_INVALID_OR_EXPIRED')
    const db=(role:string,platformRole:'STANDARD'|'SYSTEM_ADMIN'='STANDARD')=>({$transaction:async(callback:(tx:unknown)=>Promise<unknown>)=>callback({
      user:{findUnique:async()=>({role,platformRole,isActive:true,isFrozen:false,expiresAt:null})},$executeRaw:async()=>0,
      bundlePackageRelease:{findUniqueOrThrow:async()=>({status:'DRAFT',installedBy:'synthetic-installer',contentHash:hash,content:current})},
    })}) as unknown as PrismaClient
    vi.stubEnv('BUNDLE_REVIEW_SIGNING_KEY',secret)
    try{
      await expect(publishPackage(db('TEACHER'),'ordinary-allocator',current.profile.key,'0.1.2',review)).rejects.toThrow('BUNDLE_ADMIN_REQUIRED')
      await expect(publishPackage(db('ADMIN'),'ordinary-admin-allocator',current.profile.key,'0.1.2',review)).rejects.toThrow('BUNDLE_ADMIN_REQUIRED')
      await expect(publishPackage(db('ADMIN','SYSTEM_ADMIN'),'synthetic-system-publisher',current.profile.key,'0.1.2',{...review,signature:'0'.repeat(64)})).rejects.toThrow('BUNDLE_REVIEW_INVALID_OR_EXPIRED')
    }finally{vi.unstubAllEnvs()}
  })
})
function withoutOwn(){const p=structuredClone(current);delete p.report.profileActionContent;return p}
