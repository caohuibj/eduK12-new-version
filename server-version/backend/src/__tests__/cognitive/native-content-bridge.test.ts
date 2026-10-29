import {describe,it,expect,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {parseCognitiveResultSnapshot} from '../../modules/cognitive/v2/result-snapshot'
import {projectNativeContentReport} from '../../modules/cognitive/content-candidates/native-registry/public-report'
import {validateNativeContentArchive} from '../../modules/cognitive/content-candidates/native-registry/archive-detail'
import {nativeContentCases} from './native-content-fixtures.test-support'
import {getCognitiveTaskResource,assertNativeDeliverySupported} from '../../modules/cognitive/task-resource'
describe('existing native content reaches frozen public reports and archive contracts',()=>{
 it.each(nativeContentCases)('$name binds one actual scorer prefix, saves its public projection and validates exact original records',f=>{
  const s=f.input.session,report=f.publicReport
  expect(report.state).toBe(f.score.quality.state)
  expect(f.adapter.isReport(report.report)).toBe(true)
  const stored=parseCognitiveResultSnapshot({schemaVersion:1,completedAt:'2026-10-28T01:00:00.000Z',testType:s.testType,engineVersion:s.engineVersion,scoringVersion:s.scoringVersion,configVersion:s.configVersion,protocolSignature:s.protocolSignature,
   profile:s.config.profile,metrics:f.score.metrics,quality:f.score.quality,references:[],report:{nativeReport:report},assessmentContext:null})
  expect(JSON.parse(JSON.stringify(stored.report)).nativeReport).toEqual(report)
  expect(validateNativeContentArchive(f.detail,f.authority)).toEqual(f.detail)
  const forged=structuredClone(f.detail);(forged.records[0].raw as any).stopReason='forged';const {recordDigest,...body}=forged.records[0];forged.records[0].recordDigest=canonicalHash(body)
  forged.claim.recordDigests=[forged.records[0].recordDigest];const {finalPayloadDigest,...claim}=forged.claim;forged.claim.finalPayloadDigest=canonicalHash(claim)
  expect(()=>validateNativeContentArchive(forged,f.authority)).toThrow('core mismatch')
  expect(()=>projectNativeContentReport({...s,profile:s.config.profile,reportDefinitionVersion:'unknown-report',presentationVersion:report.presentationVersion,score:f.score})).toThrow('Unknown exact')
  const resource=getCognitiveTaskResource(s.testType,s.engineVersion,s.scoringVersion)!
  expect(()=>assertNativeDeliverySupported(resource,'authenticated')).not.toThrow()
  expect(()=>assertNativeDeliverySupported(resource,'public')).toThrow()
  expect(()=>assertNativeDeliverySupported(resource,'composite' as any)).toThrow()
 })
})
it('preserves the effort understanding question and rejects an invented quiz identity',()=>{
 const f=nativeContentCases.find(f=>f.name==='balloon-effort')!,detail=structuredClone(f.detail)
 const body={contextKey:f.context.contextKey,recordKey:'quiz:0:proportional',configHash:f.authority.configHash,protocolSignature:f.authority.protocolSignature,manifestHash:f.context.manifestHash,realm:f.detail.realm,kind:'quiz',raw:{version:'effort-two-demos-three-questions-v1',round:0,questionId:'proportional',answerIndex:1,atPerfMs:50}}
 const quiz={...body,recordDigest:canonicalHash(body)}
 detail.records.unshift(quiz as any);const {finalPayloadDigest,...claim}=detail.claim,updated={...claim,quizCount:1,recordDigests:detail.records.map(r=>r.recordDigest)}
 detail.claim={...updated,finalPayloadDigest:canonicalHash(updated)}
 expect(validateNativeContentArchive(detail,f.authority).records).toHaveLength(2)
 ;(detail.records[0].raw as any).questionId='invented-question';const {recordDigest,...forged}=detail.records[0];detail.records[0].recordDigest=canonicalHash(forged)
 const {finalPayloadDigest:_old,...fc}=detail.claim,changed={...fc,recordDigests:detail.records.map(r=>r.recordDigest)};detail.claim={...changed,finalPayloadDigest:canonicalHash(changed)}
 expect(()=>validateNativeContentArchive(detail,f.authority)).toThrow('quiz identity')
})
