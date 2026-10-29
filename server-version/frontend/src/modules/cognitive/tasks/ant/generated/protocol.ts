// Pure ANT protocol projection. Backend SHA256: 86c0f782704286480684a0c2b169f4bea0b5f0ce9a55244602590f092049c311
type ProtocolDefinition={schemaVersion:1;key:string;version:string;clock:'performance';randomizationAlgorithmVersion:string;trialEnvelopeVersion:1;phases:{key:'test'|'learning'|'delayed';persists:boolean;required:boolean}[];measurementCriticalConfigPaths:string[]}
type TrialEnvelope<T>={schemaVersion:1;trialIndex:number;phase:'test'|'learning'|'delayed';startedAtPerfMs:number;endedAtPerfMs:number;durationMs:number;flags:{timeout:boolean;premature:boolean};qualityEvents:('visibility_lost'|'window_blur'|'runner_restart')[];payload:T}


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
export interface AntLegacyConfig {
  profile:AntProfile; totalTrials:288|48; blocks:3|1; repetitionsPerCellPerBlock:2|1;
  practiceTrials:24; cueMs:100; postCueMs:400; responseWindowMs:1700; trialIntervalMs:4000;
  preCueMinMs:400; preCueMaxExclusiveMs:1600; neutralVariant:NeutralVariant;
  phaseToleranceMs:20;
}
/** Candidate default follows the inspected PANT 1.2 source, not Fan's dash-neutral stimulus. */
export const antConfig = (profile:AntProfile,neutralVariant:NeutralVariant='absent'):AntLegacyConfig => ({
  profile,totalTrials:profile==='research'?288:48,blocks:profile==='research'?3:1,
  repetitionsPerCellPerBlock:profile==='research'?2:1,practiceTrials:24,cueMs:100,postCueMs:400,
  responseWindowMs:1700,trialIntervalMs:4000,preCueMinMs:400,preCueMaxExclusiveMs:1600,
  neutralVariant,phaseToleranceMs:20,
})
/** Versioned teaching protocol; formal conditions, timing and random stream stay unchanged. */
export const ANT_GUIDED_IDENTITY = { ...ANT_IDENTITY, engineVersion:'1.1.0',configVersion:'1.1.0' } as const
export const ANT_GUIDED_PROTOCOL:ProtocolDefinition = { ...ANT_PROTOCOL,key:'ant/1.1.0/1.1.0',version:'1.1.0' }
export const ANT_PRACTICE_POLICY = Object.freeze({version:'ant-guided-practice-v1',trials:8,minimumCorrect:7,
  maxRounds:3,responseWindowMs:3500,trialIntervalMs:6000,feedback:'per_trial' as const,
  repeatInstructionsBeforeRetry:true,randomizationAlgorithmVersion:'ant-guided-balanced-eight-v1'} as const)
export interface AntGuidedConfig extends Omit<AntLegacyConfig,'practiceTrials'> {
  practiceTrials:8;practicePolicy:typeof ANT_PRACTICE_POLICY
}
export type AntConfig=AntLegacyConfig|AntGuidedConfig
export const antGuidedConfig=(profile:AntProfile,neutralVariant:NeutralVariant='absent'):AntGuidedConfig=>({
  ...antConfig(profile,neutralVariant),practiceTrials:8,practicePolicy:{...ANT_PRACTICE_POLICY},
})
export const isAntGuidedConfig=(config:AntConfig):config is AntGuidedConfig=>'practicePolicy' in config
export function getAntIdentity(engineVersion:string,scoringVersion:string,configVersion?:string){
  return [ANT_IDENTITY,ANT_GUIDED_IDENTITY].find(id=>id.engineVersion===engineVersion&&id.scoringVersion===scoringVersion
    &&(configVersion===undefined||id.configVersion===configVersion))
}
export interface AntCaptureTiming {cueMs:number;postCueMs:number;responseWindowMs:number;trialIntervalMs:number}
export const antCaptureTiming=(config:AntConfig,phase:'practice'|'test'):AntCaptureTiming=>({
  cueMs:config.cueMs,postCueMs:config.postCueMs,
  responseWindowMs:phase==='practice'&&isAntGuidedConfig(config)?config.practicePolicy.responseWindowMs:config.responseWindowMs,
  trialIntervalMs:phase==='practice'&&isAntGuidedConfig(config)?config.practicePolicy.trialIntervalMs:config.trialIntervalMs,
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
  presentationBinding?:{schemaVersion:1;geometryVersion:'ant-calibrated-geometry-v1';geometryHash:string;displayHash:string};
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
const shuffled = <T>(items:readonly T[],random:()=>number):T[] => {
  const values=[...items]
  for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]]}
  return values
}
const equalConfigValue=(a:unknown,b:unknown):boolean=>{
  if(a===b)return true
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>
  return Object.keys(left).length===Object.keys(right).length&&Object.keys(left).every(k=>Object.prototype.hasOwnProperty.call(right,k)&&equalConfigValue(left[k],right[k]))
}
const cells = () => CUES.flatMap(cue=>(['top','bottom'] as const).flatMap(location=>
  (['left','right'] as const).flatMap(direction=>FLANKERS.map(flanker=>({cue,location,direction,flanker})))))
/** Practice uses an independent stream and is never included in the formal scorer denominator. */
export function antPlan(config:AntConfig,seed:string,phase:'test'|'practice'='test',practiceRound=0):AntPlan[] {
  if(typeof seed!=='string'||seed.length<1||seed.length>256)throw new Error('ANT seed must contain 1–256 characters')
  if(phase!=='test'&&phase!=='practice')throw new Error('Unknown ANT phase')
  if(!config||!['research','experience'].includes(config.profile)||!['absent','dashes'].includes(config.neutralVariant))
    throw new Error('Unknown ANT config/profile/neutral variant')
  const expected=isAntGuidedConfig(config)?antGuidedConfig(config.profile,config.neutralVariant):antConfig(config.profile,config.neutralVariant)
  if(Object.keys(config).length!==Object.keys(expected).length
    ||Object.entries(expected).some(([key,value])=>!equalConfigValue((config as unknown as Record<string,unknown>)[key],value)))
    throw new Error('ANT plan config differs from protocol')
  if(phase==='practice'&&isAntGuidedConfig(config)){
    if(!Number.isInteger(practiceRound)||practiceRound<0||practiceRound>=config.practicePolicy.maxRounds)throw Error('ANT practice round out of bounds')
    const stream=`${seed}/guided-practice/${practiceRound}`,cues=shuffled(CUES,rng(stream+'/cues'))
    return cues.flatMap((cue,i)=>shuffled(['left','right'] as const,rng(stream+'/directions/'+i)).map((direction,j)=>({
      phase:'practice' as const,trialIndex:i*2+j,blockIndex:0,cue,location:(i+j)%2?'top' as const:'bottom' as const,
      direction,flanker:(i===0?'neutral':i===1?'congruent':'incongruent') as Flanker,neutralVariant:config.neutralVariant,
      plannedPreCueMs:config.preCueMinMs+Math.floor(rng(stream+'/jitter/'+(i*2+j))()*(config.preCueMaxExclusiveMs-config.preCueMinMs)),
    })))
  }
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
