import {describe,it,expect,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {freezeCandidate} from '../../modules/cognitive/content-candidates/continuous-recognition/protocol'
import {createRecognitionSnapshot,createGuidedRecognitionSnapshot,guidedRecognitionDefinition} from '../../modules/cognitive/content-candidates/continuous-recognition/package'
import {nativeConfigSchema,guidedRecognitionConfigSchema,freezeGuidedRecognitionManifest,recognitionTrialEnvelope,scoreNativeRecognition,scoreGuidedRecognition,projectNativeRecognitionReport} from '../../modules/cognitive/content-candidates/continuous-recognition/native'
import {getCognitiveTaskResource,assertNativeDeliverySupported} from '../../modules/cognitive/task-resource'
import {freezeNativeAssignmentProfile,readFrozenReport} from '../../modules/cognitive/profile-freeze'
const pool=Array.from({length:184},(_,i)=>'logic-'+i),practice=Array.from({length:6},(_,i)=>'practice-'+i),seed='recognition-guided-contract'
const rights={status:'authorized' as const,manifestHash:'f'.repeat(64),evidenceRef:'SYNTHETIC UNIT TEST ONLY; NO ACTUAL MATERIAL AUTHORIZATION'}
const snapshots=(profile:'research'|'experience')=>({old:createRecognitionSnapshot(profile,pool,practice,undefined,rights),current:createGuidedRecognitionSnapshot(profile,pool,practice,undefined,rights)})
function records(profile:'research'|'experience'){
  const f=freezeCandidate({profile,seed,formalAssetIds:pool,practiceAssetIds:practice})
  return f.manifest.formal.map(p=>{const start=100+p.index*1550,end=start+1550
    return recognitionTrialEnvelope({record:{index:p.index,assetId:p.assetId,kind:p.kind,imageOnsetMs:start,imageOffsetMs:start+750,windowEndMs:end,status:'complete',interruptions:[]},
      events:p.kind==='target-repeat'?[{id:'seen-'+p.index,atMs:start+100,action:'seen',input:'touch',key:null,isRepeat:false}]:[],
      startedAtPerfMs:start,endedAtPerfMs:end,recordOrigin:'live',telemetryOverflow:false})})
}
describe('recognition guided frozen teaching contract',()=>{
  it.each(['research','experience'] as const)('preserves %s formal sequence/scoring with real distinct identities',profile=>{
    const {old,current}=snapshots(profile),trials=records(profile),a=scoreNativeRecognition({session:old,config:old.config,trials,randomSeed:seed}),b=scoreGuidedRecognition({session:current,config:current.config,trials,randomSeed:seed})
    const plan=freezeGuidedRecognitionManifest(current.config,seed),legacy=freezeCandidate({profile,seed,formalAssetIds:pool,practiceAssetIds:practice})
    expect(plan.manifest.formal).toEqual(legacy.manifest.formal);expect(plan.manifest.practice.map(p=>p.assetId)).toEqual([0,1,0,2,2,3,4,5].map(i=>practice[i]));expect(plan.manifestHash).not.toBe(legacy.snapshotHash)
    const {reportPolicy:ap,...am}=a.metrics,{reportPolicy:bp,...bm}=b.metrics;expect(bm).toEqual(am);expect(b.quality).toEqual(a.quality);expect(b.audit).toEqual(a.audit)
    expect(projectNativeRecognitionReport(b)).toMatchObject({state:'interpretable',configHash:current.configHash,protocolSignature:current.protocolSignature,hitRate:1,falseAlarmRate:0})
    expect(()=>scoreGuidedRecognition({session:old as unknown as typeof current,config:current.config,trials,randomSeed:seed})).toThrow('Unsupported exact')
    expect(()=>scoreNativeRecognition({session:current,config:old.config,trials,randomSeed:seed})).toThrow('Unsupported exact')
  })
  it('rejects changed or cross-version teaching config and is independent of property order',()=>{
    const {old,current}=snapshots('experience'),c=current.config
    expect(nativeConfigSchema.safeParse(c).success).toBe(false);expect(guidedRecognitionConfigSchema.safeParse(old.config).success).toBe(false)
    expect(guidedRecognitionConfigSchema.safeParse({...c,practicePolicy:{...c.practicePolicy,minimumCorrect:0}}).success).toBe(false)
    expect(guidedRecognitionConfigSchema.safeParse({...c,practiceAssetIds:[pool[0],...practice.slice(1)]}).success).toBe(false)
    const ordered={...c,practicePolicy:Object.fromEntries(Object.entries(c.practicePolicy).reverse())} as typeof c
    expect(freezeGuidedRecognitionManifest(ordered,seed)).toEqual(freezeGuidedRecognitionManifest(c,seed))
    expect(()=>scoreGuidedRecognition({session:current,config:{...c,profile:'research'},trials:[],randomSeed:seed})).toThrow('differs')
  })
  it.each(['research','experience'] as const)('freezes %s names, rules and rights without enabling product delivery',profile=>{
    const resource=getCognitiveTaskResource('continuous-recognition','0.2.0','0.2.0')!;if(resource.kind!=='native')throw Error('Expected native')
    const {current}=snapshots(profile),base=current.config,frozen=freezeNativeAssignmentProfile({resource,profile,baseConfig:base})
    expect(resource.definition).toBe(guidedRecognitionDefinition);expect(resource.configVersion).toBe('0.3.0');expect(frozen.resolvedConfig).toEqual(base)
    const report=readFrozenReport(frozen.resolvedReportSnapshotEncrypted)!
    expect(report.presentationVersion).toBe('1.0.0');expect(report.participantPresentation?.protocols?.[profile]?.profileLabel).toBe(profile==='research'?'科研版':'实用版')
    expect(()=>assertNativeDeliverySupported(resource,'authenticated')).toThrow();expect(getCognitiveTaskResource('continuous-recognition','0.1.0','0.2.0')?.kind).toBe('native')
  })
  it('does not create image authorization from the new profile or teaching policy',()=>{
    for(const status of ['pending','synthetic-review-only'] as const){const session=createGuidedRecognitionSnapshot('experience',pool,practice,undefined,{status,manifestHash:null,evidenceRef:null})
      const result=scoreGuidedRecognition({session,config:session.config,trials:records('experience'),randomSeed:seed})
      expect(projectNativeRecognitionReport(result)).toMatchObject({state:'limited',hitRate:null,falseAlarmRate:null,denominator:null})}
  })
})
