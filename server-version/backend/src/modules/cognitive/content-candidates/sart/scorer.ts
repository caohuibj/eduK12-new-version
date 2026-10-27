import {z} from 'zod'
import type {AuthoritativeScorerInput,CognitiveScoreResult,TrialEnvelope} from '../../v2/types'
import {parseSessionConfigSnapshot} from '../../v2/session-snapshot'
import {parseTrialEnvelope} from '../../v2/trial-envelope'
import {same,SART_IDENTITY,SART_PROTOCOL,sartPlan,type SartConfig,type SartRaw} from './protocol'
import {sartConfigSchema,sartRawSchema} from './schema'
import {reviewSart,sartStats,type SartReview} from './analysis'
import {sartDifferences} from './report'
export function sartEnvelope(raw:SartRaw):TrialEnvelope<SartRaw>{return {schemaVersion:1,trialIndex:raw.plan.index,phase:'test',condition:raw.plan.digit===3?'nogo':'go',startedAtPerfMs:raw.onsetMs,endedAtPerfMs:raw.endedAtMs,durationMs:raw.endedAtMs-raw.onsetMs,flags:{timeout:false,premature:false},qualityEvents:[],payload:raw}}
export function scoreSart(input:AuthoritativeScorerInput<SartConfig,SartRaw>):CognitiveScoreResult{
  const call=z.object({session:z.unknown(),config:z.unknown(),randomSeed:z.string().min(1).max(256),trials:z.array(z.unknown()).max(225)}).strict().parse(input),s=parseSessionConfigSnapshot<SartConfig>(call.session)
  if(s.testType!==SART_IDENTITY.testType||s.engineVersion!==SART_IDENTITY.engineVersion||s.scoringVersion!==SART_IDENTITY.scoringVersion||s.configVersion!==SART_IDENTITY.configVersion||!same(s.protocol,SART_PROTOCOL)||(s.referenceBindings?.length??0)>0)throw Error('Unsupported exact SART identity')
  const c=sartConfigSchema.parse(s.config);if(!same(c,sartConfigSchema.parse(call.config)))throw Error('SART config differs from snapshot')
  const plan=sartPlan(c,call.randomSeed);if(call.trials.length>plan.length)throw Error('SART profile budget exceeded')
  const rows:{plan:SartRaw['plan'];review:SartReview}[]=[];let held:string[]=[],previousEnd:number|null=null,stopped=false
  for(const [i,value] of call.trials.entries()){
    const e=parseTrialEnvelope<SartRaw>(value),raw=sartRawSchema.parse(e.payload)
    if(stopped||e.phase!=='test'||e.trialIndex!==i||e.condition!==(plan[i].digit===3?'nogo':'go')||raw.plan.phase!=='test'||e.startedAtPerfMs!==raw.onsetMs||e.endedAtPerfMs!==raw.endedAtMs||e.durationMs!==raw.endedAtMs-raw.onsetMs||e.flags.timeout||e.flags.premature||e.qualityEvents.length||(previousEnd!==null&&raw.onsetMs!==previousEnd))throw Error('SART envelope/continuous ownership mismatch')
    const review=reviewSart(raw,plan[i],held);held=review.heldAfter;previousEnd=raw.endedAtMs;stopped=raw.status==='interrupted';rows.push({plan:plan[i],review})
  }
  const statistics=sartStats(rows),thirds=[0,1,2].map(k=>sartStats(rows.filter(r=>Math.floor(r.plan.index/(c.totalTrials/3))===k))),complete=statistics.go+statistics.noGo
  const times=rows.filter(r=>r.review.complete&&r.plan.digit!==3&&r.review.rtMs!==null).map(r=>r.review.rtMs!),mean=times.length?times.reduce((a,b)=>a+b,0)/times.length:null
  const sd=times.length>=2?Math.sqrt(times.reduce((n,x)=>n+(x-mean!)**2,0)/(times.length-1)):null
  const flags={noCompleteWindows:complete===0,incompleteStream:complete!==c.totalTrials,interrupted:stopped}
  return {metrics:{expectedTrialCount:c.totalTrials,receivedTrialCount:rows.length,completeTrialCount:complete,statistics,thirds,differences:sartDifferences(thirds),
    internal:{meanGoMs:mean,sampleSdGoMs:sd,icv:sd!==null&&mean!==null&&mean>0?sd/mean:null},
    reportBinding:{...SART_IDENTITY,configHash:s.configHash,protocolSignature:s.protocolSignature,profile:c.profile,reportDefinitionVersion:c.reportDefinitionVersion,presentationVersion:c.presentationVersion}},
    quality:{state:complete===0?'invalid':complete===c.totalTrials?'interpretable':'limited',flags,reasons:Object.entries(flags).filter(([,v])=>v).map(([k])=>k)},audit:{trialCount:rows.length,scorerVersion:SART_IDENTITY.scoringVersion}}
}
