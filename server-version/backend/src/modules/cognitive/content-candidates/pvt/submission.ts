import {same,pvtManifest,validatePvtContext,type PvtContext,type PvtDraft,type PvtFinal,type PvtRealm,type PvtRaw} from './protocol'
import {reviewPvt} from './analysis'
import {pvtRawSchema} from './validation'
import {scorePvt,pvtEnvelope,pvtDigest} from './scorer'
import {projectPvtReport} from './report'
export interface PvtPrepared {context:PvtContext;manifest:ReturnType<typeof pvtManifest>;realm:PvtRealm;bindingDigest:string}
/** Consume the host's persisted prepared attempt and originals; this function does not save, register, upload or acknowledge archival. */
export function verifyPvtSubmission(prepared:PvtPrepared,records:PvtDraft[],claim:PvtFinal){
  const context=validatePvtContext(prepared.context,pvtDigest),manifest=pvtManifest(context.snapshot.config,context.randomSeed),realm=prepared.realm,c=context.snapshot.config
  if(!same(prepared.manifest,manifest)||!Number.isFinite(realm.timeOriginMs)||realm.timeOriginMs<0||!realm.pageInstanceId||realm.pageInstanceId.length>100||prepared.bindingDigest!==pvtDigest({context,manifest,realm})||records.length>608)throw Error('PVT prepared attempt mismatch')
  const formal:PvtRaw[]=[];let practiceCount=0,round=-1,index=0,phaseStart:number|null=null,previous:PvtRaw|null=null,held:string[]|undefined,passed=false,failed=false,formalStarted=false
  for(const record of records){
    const raw=pvtRawSchema.parse(record.raw),base={contextKey:context.contextKey,raw,configHash:context.snapshot.configHash,protocolSignature:context.snapshot.protocolSignature,manifestHash:context.manifestHash,realm,recordKey:`${raw.plan.phase}:${raw.plan.round}:${raw.plan.index}`}
    if(!same(record,{...base,recordDigest:pvtDigest(base)}))throw Error('PVT original record binding mismatch')
    if(raw.plan.phase==='test'){
      if(!passed)throw Error('PVT formal exposure without completed practice')
      if(!formalStarted&&previous&&raw.phaseStartedAtMs<previous.endedAtMs+c.practice.feedbackMs)throw Error('PVT formal before practice feedback ended')
      formalStarted=true;formal.push(raw);continue
    }
    if(formalStarted||passed)throw Error('PVT practice after formal/pass')
    practiceCount++
    if(raw.plan.round!==round){
      if(previous&&raw.phaseStartedAtMs<previous.endedAtMs)throw Error('PVT practice clock reversed')
      if(raw.plan.round!==round+1||raw.plan.index!==0||round>=0&&!failed)throw Error('PVT practice retry ownership mismatch')
      round=raw.plan.round;index=0;phaseStart=raw.phaseStartedAtMs;previous=null;held=undefined;failed=false
    }
    if(failed||raw.plan.index!==index||raw.phaseStartedAtMs!==phaseStart||previous&&raw.waitStartedAtMs!==previous.endedAtMs||!previous&&raw.waitStartedAtMs!==phaseStart)throw Error('PVT practice sequence mismatch')
    const plan=manifest.practice[round]?.[index];if(!plan)throw Error('PVT practice budget exceeded')
    const review=reviewPvt(raw,plan,c,held);held=review.heldAfter;previous=raw;index++;failed=raw.outcome!=='responded';passed=!failed&&index===c.practice.trials
  }
  const score=scorePvt({session:context.snapshot,config:c,randomSeed:context.randomSeed,trials:formal.map(pvtEnvelope)}),completed=(score.metrics.completion as {finishedBudget:boolean}).finishedBudget===true
  const {finalPayloadDigest,...body}=claim
  const expected={contextKey:context.contextKey,configHash:context.snapshot.configHash,protocolSignature:context.snapshot.protocolSignature,manifestHash:context.manifestHash,formalCount:formal.length,practiceCount,termination:completed?'completed':'aborted',terminationReason:completed?null:claim.terminationReason,recordDigests:records.map(r=>r.recordDigest)}
  if(!same(body,expected)||finalPayloadDigest!==pvtDigest(expected)||!completed&&(!claim.terminationReason||claim.terminationReason.length>100))throw Error('PVT final claim mismatch')
  return {verified:true as const,score,report:projectPvtReport(score,context.language),finalPayloadDigest}
}
