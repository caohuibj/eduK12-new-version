import {describe,it,expect,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {nativeCognitiveConfigSeeds} from '../../modules/cognitive/content-candidates/native-registry/config-seeds'
import {getCognitiveV2TaskDefinition} from '../../modules/cognitive/v2/registry'
import {getCognitiveTaskResource,assertNativeDeliverySupported} from '../../modules/cognitive/task-resource'
import {freezeNativeAssignmentProfile,readFrozenReport} from '../../modules/cognitive/profile-freeze'
import {resolveNativeParticipantPresentation} from '../../modules/cognitive/content-candidates/native-registry/participant-presentations'
const selected=nativeCognitiveConfigSeeds.filter(s=>!['mot','enumeration'].includes(s.testType))
describe('remaining existing candidates in exact native registration',()=>{
 it('registers nine existing configurations without replacing old versions or fabricating a recognition image pool',()=>{
  expect(selected.map(s=>s.testType).sort()).toEqual(['ant','attentional-blink','balloon-effort','dual-arrow','gradcpt','hearts-flowers','horizon-exploration','precision-working-memory','visual-search-two-stage'])
  for(const seed of selected){
   expect(getCognitiveV2TaskDefinition(seed.testType,seed.engineVersion,seed.scoringVersion)).toBeDefined()
   expect(getCognitiveV2TaskDefinition(seed.testType,seed.engineVersion+'-nearby',seed.scoringVersion)).toBeUndefined()
   const resource=getCognitiveTaskResource(seed.testType,seed.engineVersion,seed.scoringVersion)!
   expect(resource.kind).toBe('native');expect(resource).toMatchObject({configVersion:seed.configVersion})
   // Registration never silently opens previously unsupported delivery scopes.
   expect(()=>assertNativeDeliverySupported(resource,'authenticated')).toThrow()
   expect(()=>assertNativeDeliverySupported(resource,'public')).toThrow()
  }
  expect(getCognitiveV2TaskDefinition('ant','1.0.0','1.1.0')).toBeDefined()
  expect(getCognitiveV2TaskDefinition('enumeration','0.1.0','0.2.0')).toBeDefined()
  expect(nativeCognitiveConfigSeeds.some(s=>s.testType==='continuous-recognition')).toBe(false)
 })
 it('freezes both profiles and the exact existing presentation independently while keeping research maps private',()=>{
  for(const seed of selected){
   const resource=getCognitiveTaskResource(seed.testType,seed.engineVersion,seed.scoringVersion)!
   if(resource.kind!=='native')throw Error('native expected')
   const snapshots=(['experience','research'] as const).map(profile=>freezeNativeAssignmentProfile({resource,baseConfig:seed.config,profile}))
   expect(snapshots[0].resolvedConfigHash).not.toBe(snapshots[1].resolvedConfigHash)
   for(const snapshot of snapshots){
    const report=readFrozenReport(snapshot.resolvedReportSnapshotEncrypted)!
    expect(report.nativeIdentity).toMatchObject({testType:seed.testType,configVersion:seed.configVersion,engineVersion:seed.engineVersion,scoringVersion:seed.scoringVersion})
    expect(report.participantPresentation).toBeDefined()
    expect(report.profile).toBe(snapshot.profile)
    for(const [key,metric] of Object.entries(resource.definition.metrics))if(['object','array'].includes(metric.valueType)){
     if(report.participantPresentation!.metricFormats?.[key]?.kind==='quantity'){expect(seed.testType).toBe('precision-working-memory');expect(key).toMatch(/^set[15](Mean|Median)AbsoluteErrorDeg$/)}
     else {expect(metric.visibility).toBe('research_only');expect([...report.v2ReportDefinition!.headlineMetrics,...report.v2ReportDefinition!.userMetrics,...report.v2ReportDefinition!.detailMetrics]).not.toContain(key)}
    }
   }
   const first=resolveNativeParticipantPresentation(seed)!,again=resolveNativeParticipantPresentation(seed)!
   first.title='changed only in caller copy'
   expect(again.title).not.toBe(first.title)
  }
 })
})
