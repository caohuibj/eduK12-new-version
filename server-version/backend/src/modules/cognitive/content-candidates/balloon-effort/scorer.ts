import {z} from 'zod'
import type {AuthoritativeScorerInput,CognitiveScoreResult,TrialEnvelope} from '../../v2/types'
import {parseSessionConfigSnapshot} from '../../v2/session-snapshot'
import {parseTrialEnvelope} from '../../v2/trial-envelope'
import {EFFORT_IDENTITY,EFFORT_PROTOCOL,effortPlan,earnedPoints,isHigh,effortKeySide,same,type EffortRaw,type EffortConfig} from './protocol'
import {effortConfigSchema,effortTrialSchema} from './schema'
const invoke=z.object({session:z.unknown(),config:z.unknown(),randomSeed:z.string().min(1).max(256),trials:z.array(z.unknown()).max(72)}).strict()
const near=(a:number,b:number)=>Math.abs(a-b)<1e-6
export const effortEnvelope=(raw:EffortRaw):TrialEnvelope<EffortRaw>=>({schemaVersion:1,trialIndex:raw.plan.index,phase:'test',condition:raw.plan.conditionKey,
 startedAtPerfMs:raw.startedAtPerfMs,endedAtPerfMs:raw.endedAtPerfMs,durationMs:raw.endedAtPerfMs-raw.startedAtPerfMs,
 flags:{timeout:false,premature:false},qualityEvents:raw.status==='interrupted'?['resume']:[],payload:raw})
/** Selection and execution are reviewed separately, so a later execution interruption does not erase a genuine earlier choice. */
export function reviewEffort(raw:EffortRaw,config:EffortConfig){
 const t=config.timing,o=raw.onsets,c=raw.choice,p=raw.plan,stages=['iti','probability','frame','offers','choice','prepare','execution','feedback','cumulative'] as const
 let last=raw.startedAtPerfMs,ordered=true
 for(const key of stages){const value=o[key];if(value!==null){if(value<last||value>raw.endedAtPerfMs)ordered=false;last=value}}
 const common=ordered&&near(o.iti!,raw.startedAtPerfMs)&&o.probability!==null&&o.frame!==null&&o.offers!==null&&o.choice!==null
  &&o.probability-o.iti!>=t.iti-1e-6&&o.frame-o.probability>=t.probability-1e-6&&o.offers-o.frame>=t.frame-1e-6&&o.choice-o.offers>=t.offers-1e-6
 const chosen=Boolean(common&&c&&raw.choiceOutcome==='selected'&&c.downAtMs>=o.choice!&&c.upAtMs>=c.downAtMs&&c.upAtMs<o.choice!+t.choice
  &&(c.input==='keyboard'?effortKeySide(c.key)===c.side:c.key===null)
  &&raw.choiceEndMs!==null&&near(raw.choiceEndMs,c.upAtMs)&&o.prepare!==null&&near(o.prepare,c.upAtMs))
 const noChoice=Boolean(common&&!c&&raw.choiceOutcome==='no_response'&&raw.choiceEndMs!==null&&raw.choiceEndMs>=o.choice!+t.choice
  &&o.prepare===null&&o.execution===null&&raw.executionEndMs===null&&raw.presses.length===0&&raw.reward===null)
 let execution=chosen&&o.execution!==null&&o.prepare!==null&&o.execution-o.prepare>=t.prepare-1e-6&&raw.executionEndMs!==null&&raw.executionEndMs>o.execution&&!raw.eventOverflow
 const lastUp:Record<string,number>={};let previousUp=0
 for(const pulse of raw.presses){const group=pulse.input==='keyboard'?'keyboard':'pointer'
  if(!c||(pulse.input==='keyboard'?effortKeySide(pulse.key)!==pulse.side:pulse.key!==null)||pulse.side!==c.side||pulse.downAtMs<o.execution!||pulse.upAtMs<pulse.downAtMs||pulse.upAtMs>=o.execution!+p.executionMs
   ||pulse.upAtMs>raw.executionEndMs!||pulse.upAtMs<previousUp||pulse.downAtMs<(lastUp[group]??0)||pulse.downAtMs<previousUp)execution=false
  previousUp=pulse.upAtMs;lastUp[group]=pulse.upAtMs}
 const high=Boolean(c&&isHigh(p,c.side)),count=raw.presses.length,finalPulse=raw.presses[count-1]
 if(execution){if(raw.executionResult==='target_reached')execution=!high&&count===p.lowGoal&&!!finalPulse&&near(finalPulse.upAtMs,raw.executionEndMs!)
  else execution=raw.executionResult==='window_elapsed'&&raw.executionEndMs!>=o.execution!+p.executionMs&&(high||count<p.lowGoal)
  if(execution)execution=raw.reward!==null&&near(raw.reward,earnedPoints(p,c!.side,count,true)!)}
 const feedback=Boolean(o.feedback!==null&&((chosen&&execution&&near(o.feedback,raw.executionEndMs!))||(noChoice&&near(o.feedback,raw.choiceEndMs!))))
 const complete=raw.status==='complete'&&raw.stopReason===null&&feedback&&o.cumulative!==null&&o.cumulative-o.feedback!>=t.feedback-1e-6&&raw.endedAtPerfMs-o.cumulative>=t.cumulative-1e-6
 return {chosen,noChoice,execution,high,complete,technical:!complete||raw.eventOverflow}
}
export function scoreBalloonEffort(input:AuthoritativeScorerInput<EffortConfig,EffortRaw>):CognitiveScoreResult{
 const call=invoke.parse(input),s=parseSessionConfigSnapshot<EffortConfig>(call.session)
 if(s.testType!==EFFORT_IDENTITY.testType||s.engineVersion!==EFFORT_IDENTITY.engineVersion||s.scoringVersion!==EFFORT_IDENTITY.scoringVersion||s.configVersion!==EFFORT_IDENTITY.configVersion
  ||!same(s.protocol,EFFORT_PROTOCOL)||(s.referenceBindings?.length??0)>0)throw Error('Unsupported exact effort identity')
 const config=effortConfigSchema.parse(s.config);if(!same(config,effortConfigSchema.parse(call.config)))throw Error('Effort config differs from frozen snapshot')
 const plan=effortPlan(config,call.randomSeed);if(call.trials.length>plan.length)throw Error('Effort profile budget exceeded')
 type Group={valid:number;high:number;noChoice:number};const cell:Record<string,Group>={},byEffort:Record<string,Group>={},byReward:Record<string,Group>={},byProbability:Record<string,Group>={}
 const fresh=():Group=>({valid:0,high:0,noChoice:0})
 for(const p of plan){cell[p.conditionKey]??=fresh();byEffort[p.highGoal]??=fresh();byReward[p.highReward]??=fresh();byProbability[p.probability]??=fresh()}
 const byInput:Record<string,{trials:number;presses:number;seconds:number;pressesPerSecond:number}>={}
 let valid=0,high=0,noChoice=0,technical=0,executed=0,pumps=0,points=0,lowReached=0,lowMissed=0,previousEnd:number|null=null
 for(const [index,value] of call.trials.entries()){
  const envelope=parseTrialEnvelope<EffortRaw>(value),raw=effortTrialSchema.parse(envelope.payload)
  if(envelope.phase!=='test'||envelope.trialIndex!==index||envelope.condition!==plan[index].conditionKey||!same(raw.plan,plan[index]))throw Error('Effort trial does not match frozen seeded offer')
  if(!near(envelope.startedAtPerfMs,raw.startedAtPerfMs)||!near(envelope.endedAtPerfMs,raw.endedAtPerfMs)||!near(envelope.durationMs,raw.endedAtPerfMs-raw.startedAtPerfMs)
   ||(previousEnd!==null&&raw.startedAtPerfMs<previousEnd))throw Error('Effort trial clock ownership mismatch')
  previousEnd=raw.endedAtPerfMs;const r=reviewEffort(raw,config),groups=[cell[raw.plan.conditionKey],byEffort[raw.plan.highGoal],byReward[raw.plan.highReward],byProbability[raw.plan.probability]]
  if(r.technical||envelope.flags.timeout||envelope.flags.premature||envelope.qualityEvents.length)technical++
  if(r.chosen){valid++;if(r.high)high++;for(const g of groups){g.valid++;if(r.high)g.high++}}
  if(r.noChoice){noChoice++;for(const g of groups)g.noChoice++}
  if(r.execution){executed++;pumps+=raw.presses.length;points+=raw.reward!;if(!r.high){if(raw.executionResult==='target_reached')lowReached++;else lowMissed++}
   const observed=[...new Set(raw.presses.map(p=>p.input))],key=observed.length===0?'unknown':observed.length===1?observed[0]:'mixed',duration=(raw.executionEndMs!-raw.onsets.execution!)/1000
   const g=byInput[key]??={trials:0,presses:0,seconds:0,pressesPerSecond:0};g.trials++;g.presses+=raw.presses.length;g.seconds+=duration;g.pressesPerSecond=g.presses/g.seconds}
 }
 const flags={noValidChoices:valid===0,incompleteRecords:call.trials.length!==config.totalTrials,noChoice:noChoice>0,technicalLoss:technical>0}
 return {metrics:{validChoiceCount:valid,highEffortChoiceCount:high,highEffortChoiceRate:valid?high/valid:null,noChoiceCount:noChoice,technicalRecordCount:technical,
  receivedTrialCount:call.trials.length,expectedTrialCount:config.totalTrials,validExecutionCount:executed,totalPresses:executed?pumps:null,knownTaskPoints:executed?Math.round(points*100)/100:null,
  lowTargetReachedCount:lowReached,lowTargetMissedCount:lowMissed,choicesByCondition:cell,choicesByEffort:byEffort,choicesByReward:byReward,choicesByProbability:byProbability,executionByInput:byInput,
  reportBinding:{...EFFORT_IDENTITY,profile:config.profile,configHash:s.configHash,protocolSignature:s.protocolSignature,reportDefinitionVersion:config.reportDefinitionVersion,incentive:config.incentive}},
  quality:{state:flags.noValidChoices?'invalid':Object.values(flags).some(Boolean)?'limited':'interpretable',flags,reasons:Object.entries(flags).filter(([,v])=>v).map(([k])=>k)},audit:{trialCount:call.trials.length,scorerVersion:EFFORT_IDENTITY.scoringVersion}}
}
