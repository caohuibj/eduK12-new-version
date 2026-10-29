import {z} from 'zod'
import type {AuthoritativeScorerInput,CognitiveScoreResult,TrialEnvelope} from '../../v2/types'
import {parseSessionConfigSnapshot} from '../../v2/session-snapshot'
import {parseTrialEnvelope} from '../../v2/trial-envelope'
import {SPATIAL_IDENTITY,SPATIAL_PROTOCOL,spatialPlan,same,signedError,targetAngle,position,type SpatialConfig,type SpatialRaw} from './protocol'
import {spatialConfigSchema,spatialTrialSchema} from './schema'
const callSchema=z.object({session:z.unknown(),config:z.unknown(),randomSeed:z.string().min(1).max(256),trials:z.array(z.unknown()).max(400)}).strict()
const near=(a:number,b:number)=>Math.abs(a-b)<1e-6
const eventsMissing=(events:SpatialRaw['events'])=>events.length<2||(events[0].kind!=='select'&&events[0].kind!=='keyboard')
export function spatialEnvelope(raw:SpatialRaw):TrialEnvelope<SpatialRaw>{return {schemaVersion:1,phase:'test',trialIndex:raw.plan.index,condition:String(raw.plan.setSize),
  startedAtPerfMs:raw.startedAtPerfMs,endedAtPerfMs:raw.endedAtPerfMs,durationMs:raw.endedAtPerfMs-raw.startedAtPerfMs,
  flags:{timeout:false,premature:false},qualityEvents:raw.status==='interrupted'?['resume']:[],payload:raw}}
export function scoreSpatialMemory(input:AuthoritativeScorerInput<SpatialConfig,SpatialRaw>):CognitiveScoreResult{
  const call=callSchema.parse(input),session=parseSessionConfigSnapshot<SpatialConfig>(call.session)
  if(session.testType!==SPATIAL_IDENTITY.testType||session.engineVersion!==SPATIAL_IDENTITY.engineVersion||session.scoringVersion!==SPATIAL_IDENTITY.scoringVersion
    ||session.configVersion!==SPATIAL_IDENTITY.configVersion||!same(session.protocol,SPATIAL_PROTOCOL)||(session.referenceBindings?.length??0)>0)throw Error('Unsupported exact spatial identity')
  const config=spatialConfigSchema.parse(session.config);if(!same(config,spatialConfigSchema.parse(call.config)))throw Error('Config differs from frozen session')
  const plan=spatialPlan(config,call.randomSeed);if(call.trials.length>plan.length)throw Error('Spatial formal budget exceeded')
  const errors:{1:number[];5:number[]}={1:[],5:[]},inputs=new Set<string>(),excluded:Record<string,string[]>={};let previousEnd:number|null=null,late=0
  for(const [i,value] of call.trials.entries()){
    const e=parseTrialEnvelope<SpatialRaw>(value),raw=spatialTrialSchema.parse(e.payload),reasons:string[]=[]
    if(e.phase!=='test'||e.trialIndex!==i||e.condition!==String(plan[i].setSize)||!same(raw.plan,plan[i]))throw Error('Spatial record does not match seeded formal manifest')
    if(!near(e.startedAtPerfMs,raw.startedAtPerfMs)||!near(e.endedAtPerfMs,raw.endedAtPerfMs)||!near(e.durationMs,raw.endedAtPerfMs-raw.startedAtPerfMs)
      ||(previousEnd!==null&&raw.startedAtPerfMs<previousEnd))throw Error('Spatial clock ownership mismatch')
    previousEnd=raw.endedAtPerfMs
    const clock=[raw.startedAtPerfMs,raw.encodingOnsetMs,raw.retentionOnsetMs,raw.responseOnsetMs,raw.endedAtPerfMs]
    const ordered=clock.every((v,j)=>v!==null&&(j===0||clock[j-1]!==null&&v>=clock[j-1]!))
    if(raw.status!=='complete'||raw.stopReason!==null||raw.eventOverflow||e.flags.timeout||e.flags.premature||e.qualityEvents.length||!ordered)reasons.push('incomplete-or-interrupted')
    if(ordered&&(raw.encodingOnsetMs!-raw.startedAtPerfMs<plan[i].itiMs-1e-6||raw.retentionOnsetMs!-raw.encodingOnsetMs!<config.encodingMs-1e-6
      ||raw.responseOnsetMs!-raw.retentionOnsetMs!<config.retentionMs-1e-6))reasons.push('stage-not-executed')
    const response=raw.response,events=raw.events
    if(eventsMissing(raw.events))reasons.push('selection-not-performed')
    if(response&&events.length&&!near(response.firstSelectedAtMs,events[0].atMs))reasons.push('first-selection-binding-mismatch')
    if(!response||raw.responseOnsetMs===null||response.firstSelectedAtMs<raw.responseOnsetMs||response.lastAdjustedAtMs<response.firstSelectedAtMs
      ||response.confirmedAtMs<response.lastAdjustedAtMs||!near(response.confirmedAtMs,raw.endedAtPerfMs))reasons.push('no-valid-confirmed-selection')
    if(events.some((v,j)=>v.atMs<raw.responseOnsetMs!||v.atMs>raw.endedAtPerfMs||(j>0&&v.atMs<events[j-1].atMs)))throw Error('Spatial input event clock mismatch')
    if(response){const xy=position(response.angleDeg),last=events[events.length-1]
      if(!near(xy.x,response.x)||!near(xy.y,response.y)||!last||last.kind!=='confirm'||!near(last.angleDeg,response.angleDeg)
        ||!near(last.atMs,response.confirmedAtMs)||last.input!==response.input)reasons.push('selection-binding-mismatch')
      if(response.input!=='keyboard'&&(response.rawX===null||response.rawY===null||Math.hypot(response.rawX-150,response.rawY-150)<90-1e-6||Math.hypot(response.rawX-150,response.rawY-150)>130+1e-6
        ||Math.abs(signedError(Math.atan2(response.rawY-150,response.rawX-150)*180/Math.PI,response.angleDeg))>1e-6))reasons.push('invalid-ring-selection')
    }
    if(raw.warningAtMs!==null&&(raw.responseOnsetMs===null||raw.warningAtMs<raw.responseOnsetMs+config.warningMs||raw.warningAtMs>raw.endedAtPerfMs))throw Error('Invalid warning event')
    if(reasons.length){excluded[i]=[...new Set(reasons)];continue}
    const r=response!,error=signedError(r.angleDeg,targetAngle(plan[i]));if(raw.signedErrorDeg===null||!near(raw.signedErrorDeg,error)){excluded[i]=['signed-error-binding-mismatch'];continue}
    errors[plan[i].setSize as 1|5].push(Math.abs(signedError(r.angleDeg,targetAngle(plan[i]))));inputs.add(r.input)
    if(r.confirmedAtMs-raw.responseOnsetMs!>=config.warningMs)late++
  }
  const metrics:Record<string,unknown>={receivedTrialCount:call.trials.length,expectedTrialCount:config.totalTrials,validTrialCount:errors[1].length+errors[5].length,
    excludedTrialCount:Object.keys(excluded).length,inputSourcesObserved:[...inputs],lateResponseCount:late,exclusionReasons:excluded,
    reportBinding:{...SPATIAL_IDENTITY,configHash:session.configHash,protocolSignature:session.protocolSignature,profile:config.profile,reportDefinitionVersion:config.reportDefinitionVersion}}
  for(const size of [1,5] as const){const a=errors[size].sort((a,b)=>a-b),n=a.length;metrics['set'+size+'ValidCount']=n;metrics['set'+size+'ExpectedCount']=config.totalTrials/2
    metrics['set'+size+'MeanAbsoluteErrorDeg']=n?{value:a.reduce((a,b)=>a+b,0)/n,unit:'deg'}:null;metrics['set'+size+'MedianAbsoluteErrorDeg']=n?{value:(a[Math.floor((n-1)/2)]+a[Math.floor(n/2)])/2,unit:'deg'}:null}
  const flags={noValidRecords:metrics.validTrialCount===0,incompleteRecords:call.trials.length!==config.totalTrials,technicalLoss:Object.keys(excluded).length>0}
  return {metrics,quality:{state:flags.noValidRecords?'invalid':flags.incompleteRecords||flags.technicalLoss?'limited':'interpretable',flags,reasons:Object.entries(flags).filter(([,v])=>v).map(([k])=>k)},audit:{trialCount:call.trials.length,scorerVersion:SPATIAL_IDENTITY.scoringVersion}}
}
