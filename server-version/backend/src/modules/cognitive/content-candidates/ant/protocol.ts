import type { ProtocolDefinition, TrialEnvelope } from '../../v2/types'

export const ANT_IDENTITY = { candidateId:'attention-ant-pebl', testType:'ant', engineVersion:'1.0.0',
  scoringVersion:'1.1.0', configVersion:'1.0.0', metricDefinitionVersion:'1.1.0',
  qualityDefinitionVersion:'1.0.0', reportDefinitionVersion:'1.1.0',
  randomizationAlgorithmVersion:'ant-fnv1a-mulberry32-v1' } as const
export const ANT_PROTOCOL:ProtocolDefinition = { schemaVersion:1,key:'ant/1.0.0/1.1.0',version:'1.0.0',
  clock:'performance',randomizationAlgorithmVersion:ANT_IDENTITY.randomizationAlgorithmVersion,
  trialEnvelopeVersion:1,phases:[{key:'test',persists:true,required:true}],measurementCriticalConfigPaths:['*'] }
export const CUES = ['none','central','double','spatial_valid'] as const
export const FLANKERS = ['congruent','incongruent','neutral'] as const
export const INPUTS = ['touch','pointer','keyboard'] as const
export type Cue = typeof CUES[number]
export type Flanker = typeof FLANKERS[number]
export type Input = typeof INPUTS[number]
export type Direction = 'left'|'right'
export type AntProfile = 'research'|'experience'
export type NeutralVariant = 'absent'|'dashes'
export interface AntConfig {
  profile:AntProfile; totalTrials:288|48; blocks:3|1; repetitionsPerCellPerBlock:2|1;
  practiceTrials:24; cueMs:100; postCueMs:400; responseWindowMs:1700; trialIntervalMs:4000;
  preCueMinMs:400; preCueMaxExclusiveMs:1600; neutralVariant:NeutralVariant;
  phaseToleranceMs:20;
}
/** Candidate default follows the inspected PANT 1.2 source, not Fan's dash-neutral stimulus. */
export const antConfig = (profile:AntProfile,neutralVariant:NeutralVariant='absent'):AntConfig => ({
  profile,totalTrials:profile==='research'?288:48,blocks:profile==='research'?3:1,
  repetitionsPerCellPerBlock:profile==='research'?2:1,practiceTrials:24,cueMs:100,postCueMs:400,
  responseWindowMs:1700,trialIntervalMs:4000,preCueMinMs:400,preCueMaxExclusiveMs:1600,
  neutralVariant,phaseToleranceMs:20,
})
export interface AntPlan {
  phase:'test'|'practice'; trialIndex:number; blockIndex:number; cue:Cue;
  location:'top'|'bottom'; direction:Direction; flanker:Flanker; neutralVariant:NeutralVariant;
  plannedPreCueMs:number;
}
export interface AntResponseEvent {
  direction:Direction; input:Input; atPerfMs:number; repeat:boolean; held:boolean;
}
export interface AntTrial extends AntPlan {
  phase:'test'; recordOrigin:'live'|'recovered_without_timing';
  clock:{source:'performance'; timeOriginUnixMs:number|null};
  startedAtPerfMs:number; cueOnsetPerfMs:number|null; cueOffsetPerfMs:number|null;
  targetOnsetPerfMs:number|null; targetOffsetPerfMs:number|null; endedAtPerfMs:number;
  events:AntResponseEvent[]; responseIndex:number|null; timedOut:boolean; eventOverflow:boolean;
  interruptions:{kind:'visibility_lost'|'window_blur'|'viewport_changed'|'render_failed'|'clock_discontinuity'|'runner_restart';atPerfMs:number}[];
}
const rng = (seed:string) => {
  let state=2166136261
  for(let i=0;i<seed.length;i++) state=Math.imul(state^seed.charCodeAt(i),16777619)>>>0
  return () => {state=(state+0x6D2B79F5)>>>0;let n=state;n=Math.imul(n^(n>>>15),n|1);
    n^=n+Math.imul(n^(n>>>7),n|61);return ((n^(n>>>14))>>>0)/4294967296}
}
const shuffled = <T>(items:T[],random:()=>number):T[] => {
  const values=[...items]
  for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]]}
  return values
}
const cells = () => CUES.flatMap(cue=>(['top','bottom'] as const).flatMap(location=>
  (['left','right'] as const).flatMap(direction=>FLANKERS.map(flanker=>({cue,location,direction,flanker})))))
/** Practice uses an independent stream and is never included in the formal scorer denominator. */
export function antPlan(config:AntConfig,seed:string,phase:'test'|'practice'='test'):AntPlan[] {
  if(typeof seed!=='string'||seed.length<1||seed.length>256)throw new Error('ANT seed must contain 1–256 characters')
  if(phase!=='test'&&phase!=='practice')throw new Error('Unknown ANT phase')
  if(!config||!['research','experience'].includes(config.profile)||!['absent','dashes'].includes(config.neutralVariant))
    throw new Error('Unknown ANT config/profile/neutral variant')
  const expected=antConfig(config.profile,config.neutralVariant)
  if(Object.keys(config).length!==Object.keys(expected).length
    ||Object.entries(expected).some(([key,value])=>(config as unknown as Record<string,unknown>)[key]!==value))
    throw new Error('ANT plan config differs from protocol')
  const result:AntPlan[]=[]
  for(let block=0;block<(phase==='test'?config.blocks:1);block++) {
    const all=Array.from({length:phase==='test'?config.repetitionsPerCellPerBlock:1},()=>cells()).flat()
    const ordered=shuffled(all,rng(`${seed}/${phase}/order/${block}`))
      .slice(0,phase==='practice'?config.practiceTrials:all.length)
    for(const cell of ordered){const index=result.length
      result.push({...cell,phase,trialIndex:index,blockIndex:block,neutralVariant:config.neutralVariant,
        plannedPreCueMs:config.preCueMinMs+Math.floor(rng(`${seed}/${phase}/jitter/${index}`)()
          *(config.preCueMaxExclusiveMs-config.preCueMinMs))})}
  }
  return result
}
export const antTrialEnvelope = (trial:AntTrial):TrialEnvelope<AntTrial> => ({
  schemaVersion:1,trialIndex:trial.trialIndex,phase:'test',
  startedAtPerfMs:trial.startedAtPerfMs,endedAtPerfMs:trial.endedAtPerfMs,
  durationMs:trial.endedAtPerfMs-trial.startedAtPerfMs,
  flags:{timeout:trial.timedOut,premature:trial.events.some(e=>!e.repeat&&!e.held
    &&(trial.targetOnsetPerfMs===null||e.atPerfMs<trial.targetOnsetPerfMs))},
  qualityEvents:trial.interruptions.filter(e=>['visibility_lost','window_blur','runner_restart'].includes(e.kind))
    .slice(0,20).map(e=>e.kind as 'visibility_lost'|'window_blur'|'runner_restart'),payload:trial,
})
