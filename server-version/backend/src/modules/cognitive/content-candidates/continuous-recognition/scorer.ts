import { z } from 'zod'
import { IDENTITY, replayCandidate, type FrozenCandidate } from './protocol'

const time=z.number().finite().nonnegative()
const recordSchema=z.object({ index:z.number().int().nonnegative(), assetId:z.string().min(1).max(80),
  kind:z.enum(['target-first','target-repeat','filler-first','vigilance-repeat']),
  imageOnsetMs:time.nullable(), imageOffsetMs:time.nullable(), windowEndMs:time.nullable(),
  status:z.enum(['complete','load-failure','timeout','interrupted']),
  interruptions:z.array(z.object({atMs:time,type:z.enum(['blur','hidden','rotation','pause'])}).strict()).max(32) }).strict()
const eventSchema=z.object({ id:z.string().min(1).max(80), atMs:time, action:z.enum(['seen','other']),
  input:z.enum(['touch','mouse','pen','keyboard','unknown']), key:z.string().max(32).nullable(),
  isRepeat:z.boolean() }).strict()
const rawSchema=z.object({ snapshotHash:z.string().regex(/^[a-f0-9]{64}$/), phase:z.literal('formal'),
  records:z.array(recordSchema).max(260), events:z.array(eventSchema).max(5200),
  termination:z.enum(['completed','aborted']) }).strict()
export type RawSession=z.infer<typeof rawSchema>
export type RawRecord=RawSession['records'][number]
export type RawEvent=RawSession['events'][number]
const reviewSchema=z.object({ snapshotHash:z.string().regex(/^[a-f0-9]{64}$/),
  qualityRule:z.literal(IDENTITY.qualityRule), decision:z.literal('allow-descriptive-research'),
  reviewerId:z.string().min(1).max(80), evidenceNote:z.string().min(1).max(2000) }).strict()
export type ResearchReview=z.infer<typeof reviewSchema>
export interface Metrics { hitRate:number|null; falseAlarmRate:number|null; correctedRecognitionRate:number|null;
  targetHits:number; targetFalseAlarms:number; completeTargetPairs:number; plannedTargetPairs:number;
  fillerFalseAlarms:number; validFillerFirst:number; fillerFalseAlarmRate:number|null;
  vigilanceMisses:number; validVigilancePairs:number; vigilanceMissRate:number|null }
export interface CandidateResult { candidateId:typeof IDENTITY.candidateId; status:'DESIGN_PROPOSAL'; snapshotHash:string;
  profile:'research'|'experience'; quality:{state:'interpretable'|'limited'|'invalid'; reasons:string[];
    evidence:'PROJECT_PROVISIONAL_RESEARCH_RULE'; review:ResearchReview|null}; metrics:Metrics;
  audit:{ received:number; planned:number; validPresentations:number; prematureSeen:number; outsideSeen:number;
    extraSeen:number; ignoredEvents:number; firstResponses:Array<{index:number;eventId:string;rtMs:number;phase:'image'|'isi'}>;
    targetPairs:Array<{firstIndex:number;repeatIndex:number;eligible:boolean;actualOnsetLagMs:number|null}>;
    actualTiming:Array<{index:number;imageMs:number|null;isiMs:number|null}> } }
const ratio=(n:number,d:number):number|null=>d ? n/d : null
const isSeen=(e:RawEvent)=>e.action==='seen'&&!e.isRepeat&&(e.input!=='keyboard'||e.key?.toLowerCase()==='r')
/** Candidate-only authority: an explicit external review is required even for technically complete recordings. */
export function scoreRecognition(snapshot:unknown, value:unknown, researchReview?:unknown):CandidateResult {
  const frozen:FrozenCandidate=replayCandidate(snapshot), raw=rawSchema.parse(value)
  if(raw.snapshotHash!==frozen.snapshotHash) throw new Error('Raw recording does not bind this frozen candidate')
  if(raw.records.length>frozen.manifest.formal.length) throw new Error('Presentation budget exceeded')
  const review=researchReview===undefined?null:reviewSchema.parse(researchReview)
  if(review && review.snapshotHash!==frozen.snapshotHash) throw new Error('Research review binds another snapshot')
  const valid:boolean[]=[], records=raw.records
  let previousEnd:number|null=null
  for(const [i,r] of records.entries()) {
    const plan=frozen.manifest.formal[i]
    if(r.index!==i||r.assetId!==plan.assetId||r.kind!==plan.kind) throw new Error('Raw presentation truth/sequence mismatch')
    const times=[r.imageOnsetMs,r.imageOffsetMs,r.windowEndMs], present=times.filter(x=>x!==null).length
    if(present!==0&&present!==3) throw new Error('Actual stage times must be complete or explicitly missing')
    if(present===3) {
      if(!(r.imageOnsetMs!<r.imageOffsetMs!&&r.imageOffsetMs!<r.windowEndMs!)) throw new Error('Actual stage clock is out of order')
      if(previousEnd!==null && r.imageOnsetMs!<previousEnd) throw new Error('Presentation windows overlap')
      if(i>0&&records[i-1].windowEndMs!==null&&r.imageOnsetMs!==records[i-1].windowEndMs)
        throw new Error('Continuous response window must end at next actual image onset')
      previousEnd=r.windowEndMs
      for(const interruption of r.interruptions) if(interruption.atMs<r.imageOnsetMs!||interruption.atMs>r.windowEndMs!)
        throw new Error('Interruption clock outside presentation')
    } else if(r.status==='complete') throw new Error('Complete presentation is missing actual stage times')
    valid.push(r.status==='complete'&&present===3&&r.interruptions.length===0)
  }
  const ids=new Set<string>(), firstResponse=new Map<number,RawEvent>()
  const audit:CandidateResult['audit']={received:records.length,planned:frozen.manifest.counts.total,
    validPresentations:valid.filter(Boolean).length,prematureSeen:0,outsideSeen:0,extraSeen:0,ignoredEvents:0,
    firstResponses:[],targetPairs:[],actualTiming:records.map(r=>({index:r.index,
      imageMs:r.imageOffsetMs===null||r.imageOnsetMs===null?null:r.imageOffsetMs-r.imageOnsetMs,
      isiMs:r.windowEndMs===null||r.imageOffsetMs===null?null:r.windowEndMs-r.imageOffsetMs}))}
  let previousAt=-1
  const firstOnset=records.find(r=>r.imageOnsetMs!==null)?.imageOnsetMs??null
  for(const e of raw.events) {
    if(ids.has(e.id)) throw new Error('Duplicate raw event identity')
    if(e.atMs<previousAt) throw new Error('Response clock is out of order')
    if(e.input!=='keyboard'&&e.key!==null) throw new Error('Nonkeyboard response cannot carry a keyboard key')
    ids.add(e.id); previousAt=e.atMs
    if(!isSeen(e)) {audit.ignoredEvents++;continue}
    const r=records.find(r=>r.imageOnsetMs!==null&&r.windowEndMs!==null&&e.atMs>=r.imageOnsetMs&&e.atMs<r.windowEndMs)
    if(!r) {if(firstOnset!==null&&e.atMs<firstOnset) audit.prematureSeen++;else audit.outsideSeen++;continue}
    if(firstResponse.has(r.index)) {audit.extraSeen++;continue}
    firstResponse.set(r.index,e)
    audit.firstResponses.push({index:r.index,eventId:e.id,rtMs:e.atMs-r.imageOnsetMs!,
      phase:e.atMs<r.imageOffsetMs!?'image':'isi'})
  }
  let hits=0, falseAlarms=0, completePairs=0, fillerFalse=0, fillerN=0, vigilanceMiss=0, vigilanceN=0
  for(const pair of frozen.manifest.targetPairs) {
    const eligible=valid[pair.firstIndex]===true&&valid[pair.repeatIndex]===true
    const first=records[pair.firstIndex],repeat=records[pair.repeatIndex]
    audit.targetPairs.push({firstIndex:pair.firstIndex,repeatIndex:pair.repeatIndex,eligible,
      actualOnsetLagMs:first?.imageOnsetMs!=null&&repeat?.imageOnsetMs!=null?repeat.imageOnsetMs-first.imageOnsetMs:null})
    if(!eligible) continue
    completePairs++; if(firstResponse.has(pair.repeatIndex)) hits++;if(firstResponse.has(pair.firstIndex)) falseAlarms++
  }
  for(const r of records) if(r.kind==='filler-first'&&valid[r.index]) {fillerN++;if(firstResponse.has(r.index))fillerFalse++}
  for(const pair of frozen.manifest.vigilancePairs) if(valid[pair.firstIndex]&&valid[pair.repeatIndex]) {
    vigilanceN++;if(!firstResponse.has(pair.repeatIndex))vigilanceMiss++
  }
  const hr=ratio(hits,completePairs),far=ratio(falseAlarms,completePairs)
  const metrics:Metrics={hitRate:hr,falseAlarmRate:far,correctedRecognitionRate:hr===null||far===null?null:hr-far,
    targetHits:hits,targetFalseAlarms:falseAlarms,completeTargetPairs:completePairs,plannedTargetPairs:frozen.parameters.targetNum,
    fillerFalseAlarms:fillerFalse,validFillerFirst:fillerN,fillerFalseAlarmRate:ratio(fillerFalse,fillerN),
    vigilanceMisses:vigilanceMiss,validVigilancePairs:vigilanceN,vigilanceMissRate:ratio(vigilanceMiss,vigilanceN)}
  const reasons:string[]=[]
  if(raw.termination!=='completed') reasons.push('aborted')
  if(records.length!==frozen.manifest.counts.total) reasons.push('incomplete-presentation-sequence')
  if(valid.some(x=>!x)) reasons.push('technical-presentation-loss')
  if(completePairs!==frozen.parameters.targetNum) reasons.push('incomplete-target-pairs')
  if(audit.prematureSeen||audit.outsideSeen) reasons.push('seen-response-outside-task-window')
  if(!review) reasons.push('quality-and-timing-review-required')
  const state=completePairs===0?'invalid':reasons.length?'limited':'interpretable'
  return {candidateId:IDENTITY.candidateId,status:'DESIGN_PROPOSAL',snapshotHash:frozen.snapshotHash,
    profile:frozen.request.profile,quality:{state,reasons,evidence:'PROJECT_PROVISIONAL_RESEARCH_RULE',review},metrics,audit}
}
export interface ReportProjection { state:'interpretable'|'limited'|'invalid'; profile:'research'|'experience';
  hitRate:number|null; falseAlarmRate:number|null; correctedRecognitionRate:number|null;
  targetHits:number|null; targetFalseAlarms:number|null; denominator:number|null;
  completeTargetPairs:number; plannedTargetPairs:number; reasons:string[]; canGenerateTakeHomeImage:boolean;
  interpretationScope:'this-session-descriptive-research-only'; logo:'EDUK12.TOP' }
/** UI/export/image consumers must use this projection, never internal diagnostic metrics. */
export function projectRecognitionReport(result:CandidateResult):ReportProjection {
  const m=result.metrics, q=result.quality
  const rate=(n:number|null)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1
  const permitted=q.state==='interpretable'&&q.reasons.length===0&&q.review?.snapshotHash===result.snapshotHash
    &&q.review.decision==='allow-descriptive-research'&&q.review.qualityRule===IDENTITY.qualityRule
    &&Number.isInteger(m.completeTargetPairs)&&m.completeTargetPairs>0&&m.completeTargetPairs===m.plannedTargetPairs
    &&Number.isInteger(m.targetHits)&&m.targetHits>=0&&m.targetHits<=m.completeTargetPairs
    &&Number.isInteger(m.targetFalseAlarms)&&m.targetFalseAlarms>=0&&m.targetFalseAlarms<=m.completeTargetPairs
    &&rate(m.hitRate)&&rate(m.falseAlarmRate)&&m.hitRate===m.targetHits/m.completeTargetPairs
    &&m.falseAlarmRate===m.targetFalseAlarms/m.completeTargetPairs
    &&m.correctedRecognitionRate===m.hitRate!-m.falseAlarmRate!
  return {state:permitted?'interpretable':q.state==='invalid'?'invalid':'limited',profile:result.profile,
    hitRate:permitted?m.hitRate:null,falseAlarmRate:permitted?m.falseAlarmRate:null,
    correctedRecognitionRate:permitted?m.correctedRecognitionRate:null,targetHits:permitted?m.targetHits:null,
    targetFalseAlarms:permitted?m.targetFalseAlarms:null,denominator:permitted?m.completeTargetPairs:null,
    completeTargetPairs:m.completeTargetPairs,plannedTargetPairs:m.plannedTargetPairs,reasons:[...q.reasons],
    canGenerateTakeHomeImage:!!permitted,interpretationScope:'this-session-descriptive-research-only',logo:'EDUK12.TOP'}
}
