import {z} from 'zod'
import {EFFORT_QUIZ} from '../balloon-effort/protocol'
import {canonicalHash} from '../../../assessment-runtime/canonical'
import {getNativeContentDefinition,getNativeCognitiveTaskDefinition} from './definitions'
import {resolveCognitiveFinalMaxTrials} from '../../v2/final-submission-budget'

const hash=z.string().regex(/^[a-f0-9]{64}$/),key=z.string().min(1).max(512),integer=z.number().int().nonnegative()
const realm=z.object({timeOriginMs:z.number().finite().nonnegative(),pageInstanceId:key}).strict()
const record=z.object({contextKey:key,recordKey:key,configHash:hash,protocolSignature:hash,manifestHash:hash,realm,recordDigest:hash,
 raw:z.unknown(),phase:z.enum(['practice','test']).optional(),round:integer.max(2).optional(),index:integer.max(399).optional(),kind:z.enum(['trial','quiz']).optional()}).strict()
const claim=z.object({contextKey:key,configHash:hash,protocolSignature:hash,manifestHash:hash,
 formalCount:integer.max(400).optional(),formalCaptureCount:z.literal(1).optional(),presented:integer.max(300).optional(),practiceCount:integer.max(100),quizCount:integer.max(9).optional(),
 termination:z.enum(['completed','aborted']),terminationReason:z.string().min(1).max(256).nullable(),recordDigests:z.array(hash).max(510),finalPayloadDigest:hash}).strict()
export const nativeContentArchiveSchema=z.object({schemaVersion:z.literal(1),kind:z.literal('COGNITIVE_NATIVE_CONTENT_V1'),
 context:z.object({contextKey:key,randomSeed:key,manifestHash:hash,snapshot:z.object({schemaVersion:z.literal(1),testType:key,engineVersion:key,scoringVersion:key,configVersion:key,
 config:z.unknown(),protocol:z.unknown(),configHash:hash,protocolSignature:hash,frozenAt:z.string().datetime({offset:true})}).strict(),administration:z.unknown().optional()}).strict(),
 manifest:z.unknown(),realm,records:z.array(record).min(1).max(510),claim}).strict()
export type NativeContentArchive=z.infer<typeof nativeContentArchiveSchema>
const same=(a:unknown,b:unknown)=>canonicalHash(a)===canonicalHash(b)
export interface ContentArchiveAuthority {sessionId:string;attemptEpoch:number;randomSeed:string;testType:string;engineVersion:string;scoringVersion:string;configVersion:string;
 config:unknown;protocol:unknown;configHash:string;protocolSignature:string;trials:Array<{trialIndex:number;payload:unknown}>;presentedImageCount?:unknown}
/** Validates the preserved upload against already committed core. It never changes or recalculates a user's report. */
export function validateNativeContentArchive(value:unknown,authority:ContentArchiveAuthority):NativeContentArchive{
 const detail=nativeContentArchiveSchema.parse(value),c=detail.context,s=c.snapshot,a=authority,adapter=getNativeContentDefinition(a.testType,a.engineVersion,a.scoringVersion)
 if(!adapter||adapter.configVersion!==a.configVersion||s.testType!==a.testType||s.engineVersion!==a.engineVersion||s.scoringVersion!==a.scoringVersion||s.configVersion!==a.configVersion
  ||c.contextKey!==JSON.stringify([a.sessionId,a.attemptEpoch,a.configHash])||c.randomSeed!==a.randomSeed||s.configHash!==a.configHash||s.protocolSignature!==a.protocolSignature
  ||!same(s.config,a.config)||!same(s.protocol,a.protocol))throw Error('Native content archive frozen identity mismatch')
 const expectedManifest=adapter.manifest(a.config,a.randomSeed),expectedHash=adapter.manifestHash(a.config,a.randomSeed)
 if(!same(detail.manifest,expectedManifest)||c.manifestHash!==expectedHash)throw Error('Native content archive manifest mismatch')
 const f=detail.claim,{finalPayloadDigest,...body}=f
 if(!same(body,{...body,recordDigests:detail.records.map(r=>r.recordDigest)})||canonicalHash(body)!==finalPayloadDigest||f.contextKey!==c.contextKey||f.configHash!==s.configHash||f.protocolSignature!==s.protocolSignature||f.manifestHash!==c.manifestHash)
  throw Error('Native content archive final seal mismatch')
 const keys=new Set<string>(),formal:typeof detail.records=[],practice:typeof detail.records=[];let quizzes=0
 for(const row of detail.records){
  const {recordDigest,...content}=row
  if(keys.has(row.recordKey)||canonicalHash(content)!==recordDigest||row.contextKey!==c.contextKey||row.configHash!==s.configHash||row.protocolSignature!==s.protocolSignature||row.manifestHash!==c.manifestHash||!same(row.realm,detail.realm))throw Error('Native content archive record binding mismatch')
  keys.add(row.recordKey)
  if(row.kind==='quiz'){
   if(a.testType!=='balloon-effort')throw Error('Unexpected quiz record')
   const quiz=z.object({version:z.literal('effort-two-demos-three-questions-v1'),round:integer.max(2),questionId:z.string().min(1).max(100),answerIndex:integer.max(2),atPerfMs:z.number().finite().nonnegative()}).strict().parse(row.raw)
   if(!EFFORT_QUIZ.some(q=>q.id===quiz.questionId)||row.recordKey!==`quiz:${quiz.round}:${quiz.questionId}`)throw Error('Unknown effort quiz identity')
   quizzes++;continue
  }
  adapter.parseRaw(row.raw)
  adapter.validateArchiveRecord?.(row.raw,{config:a.config,contextKey:c.contextKey,recordKey:row.recordKey,configHash:s.configHash,protocolSignature:s.protocolSignature,administration:c.administration})
  const inspected=adapter.inspectArchiveRecord?.(row.raw),raw=row.raw as {plan:{phase?:string;round?:number;index?:number};status:string},phase=inspected?.phase??(Array.isArray(raw.plan)?row.phase:raw.plan.phase),
   round=row.round??inspected?.round??raw.plan.round??0,index=row.index??inspected?.index??raw.plan.index??0,m=expectedManifest as {formal:unknown[];practice:unknown[][]}
  if(!['test','practice'].includes(String(phase))||row.phase&&row.phase!==phase)throw Error('Native content archive phase mismatch')
  const expected=Array.isArray(expectedManifest)?expectedManifest.find(p=>p.phase===phase&&p.round===round&&p.index===index)
   :phase==='test'?(Array.isArray(raw.plan)?m.formal:m.formal[index]):m.practice[round]?.[index]
  if(!expected||!same(expected,inspected?.plan??raw.plan))throw Error('Native content archive record plan mismatch')
  if(phase==='test')formal.push(row);else practice.push(row)
 }
 if(formal.length!==a.trials.length||formal.some((r,i)=>{const e=adapter.envelope(r.raw);return e.trialIndex!==i||a.trials[i].trialIndex!==i||!same(e.payload,a.trials[i].payload)}))throw Error('Native content archive core mismatch')
 if(practice.length!==f.practiceCount||quizzes!==(f.quizCount??0)||(a.testType==='gradcpt'?(f.formalCaptureCount!==formal.length||f.presented!==a.presentedImageCount):f.formalCount!==formal.length))throw Error('Native content archive record counts mismatch')
 const definition=getNativeCognitiveTaskDefinition(a.testType,a.engineVersion,a.scoringVersion)!
 if(f.termination==='completed'&&(f.terminationReason!==null||formal.length!==resolveCognitiveFinalMaxTrials(definition,a.config)||formal.some(r=>(adapter.inspectArchiveRecord?.(r.raw)?.status??(r.raw as {status:string}).status)!=='complete')))
  throw Error('Native content archive unexecuted completion claim')
 return detail
}
