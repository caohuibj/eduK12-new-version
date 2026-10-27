import {z} from 'zod'
import {sha256} from '../../v2/canonical'
import {parseSessionConfigSnapshot} from '../../v2/session-snapshot'
import {planFor,reviewRaw,same,type Config} from './protocol'
import {configValidator,rawValidator} from './validation'
import {scoreSerialReactionLearning,envelopeFor} from './scorer'
import {projectReport} from './report'
const hex=z.string().regex(/^[a-f0-9]{64}$/),contextKey=z.string().min(1).max(512)
const contextSchema=z.object({contextKey,language:z.enum(['zh','en']),snapshot:z.unknown(),randomSeed:z.string().min(1).max(256),manifestHash:hex}).strict()
const draftSchema=z.object({contextKey,phase:z.enum(['practice','test']),round:z.number().int().min(0).max(2),index:z.number().int().min(0).max(419),raw:rawValidator,configHash:hex,protocolSignature:hex,manifestHash:hex,realm:z.object({timeOriginMs:z.number().finite().nonnegative(),pageInstanceId:z.string().uuid()}).strict(),recordKey:z.string().min(1).max(64),recordDigest:hex}).strict()
const finalSchema=z.object({contextKey,configHash:hex,protocolSignature:hex,manifestHash:hex,formalCount:z.number().int().min(0).max(420),practiceCount:z.number().int().min(4).max(12),termination:z.enum(['completed','aborted']),terminationReason:z.string().min(1).max(96).nullable(),recordDigests:z.array(hex).min(4).max(432),finalPayloadDigest:hex}).strict()
/** Host-callable candidate guard and native scorer. Does not write any application or storage state. */
export function finalizeAttempt(value:{context:unknown;records:unknown[];claim:unknown}){
  const c=contextSchema.parse(value.context),snapshot=parseSessionConfigSnapshot<Config>(c.snapshot),config=configValidator.parse(snapshot.config),plan=planFor(config,c.randomSeed),claim=finalSchema.parse(value.claim),records=z.array(draftSchema).min(4).max(432).parse(value.records)
  if(c.manifestHash!==sha256(plan)||claim.contextKey!==c.contextKey||claim.configHash!==snapshot.configHash||claim.protocolSignature!==snapshot.protocolSignature||claim.manifestHash!==c.manifestHash)throw Error('SRL attempt identity differs')
  const {finalPayloadDigest,...finalBase}=claim;if(sha256(finalBase)!==finalPayloadDigest)throw Error('SRL final payload digest differs')
  let previousEnd:number|null=null,currentRound=0,practiceIndex=0,practiceCorrect=0,practiceInterrupted=false,formal=false,practicePassed=false
  const formalRows:ReturnType<typeof rawValidator.parse>[]=[],seen=new Set<string>()
  for(const record of records){
    const {recordDigest,...base}=record,raw=record.raw
    if(record.contextKey!==c.contextKey||record.configHash!==snapshot.configHash||record.protocolSignature!==snapshot.protocolSignature||record.manifestHash!==c.manifestHash||record.phase!==raw.plan.phase||record.round!==raw.plan.round||record.index!==raw.plan.index||record.recordKey!==`${record.phase}:${record.round}:${record.index}`||seen.has(record.recordKey)||sha256(base)!==recordDigest||!same(record.realm,records[0].realm)||(previousEnd!==null&&raw.startedAtPerfMs<previousEnd))throw Error('SRL raw draft identity/order/digest differs')
    seen.add(record.recordKey);previousEnd=raw.endedAtPerfMs
    if(record.phase==='practice'){
      if(formal||practicePassed)throw Error('SRL practice cannot follow passed practice or formal trials')
      if(record.round!==currentRound){if(record.round!==currentRound+1||currentRound>=2||(practiceIndex!==4&&!practiceInterrupted))throw Error('SRL practice round was skipped');currentRound++;practiceIndex=0;practiceCorrect=0;practiceInterrupted=false}
      if(record.index!==practiceIndex||practiceInterrupted)throw Error('SRL practice position differs')
      const r=reviewRaw(raw,planFor(config,c.randomSeed,'practice',currentRound)[practiceIndex]);practiceIndex++;if(r.firstCorrect)practiceCorrect++;practiceInterrupted=r.interrupted;practicePassed=practiceIndex===4&&practiceCorrect===4&&!practiceInterrupted
    }else{if(!practicePassed)throw Error('SRL formal target without a complete 4/4 first-response practice');formal=true;formalRows.push(raw)}
  }
  if(!same(claim.recordDigests,records.map(r=>r.recordDigest))||claim.formalCount!==formalRows.length||claim.practiceCount!==records.length-formalRows.length)throw Error('SRL claim does not cover exact retained records')
  const complete=formalRows.length===plan.length&&formalRows.every(r=>r.status==='completed')
  if(claim.termination!==(complete?'completed':'aborted')||(complete?claim.terminationReason!==null:claim.terminationReason===null))throw Error('SRL completion claim differs from raw execution')
  const score=scoreSerialReactionLearning({session:snapshot,config,randomSeed:c.randomSeed,trials:formalRows.map(envelopeFor)})
  return {score,report:projectReport(score)}
}
