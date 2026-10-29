// Exact pure content projection. Backend SHA256: 346318b6f4bf234cb6308428b40c147634fecb8df15c21aaf34d8bf68bc85c9c
/** Independent mobile-input variant; source facts: Culbreth2024 and frozen lnccbrown/task-effort. */
export const EFFORT_IDENTITY={testType:'balloon-effort',engineVersion:'0.1.0',scoringVersion:'0.1.0',configVersion:'0.1.0'} as const
export const EFFORT_PROTOCOL={schemaVersion:1 as const,key:'balloon-effort/0.1.0/0.1.0',version:'0.1.0',clock:'performance' as const,
 randomizationAlgorithmVersion:'effort-fnv1a-utf16-xorshift32-balanced-v1',trialEnvelopeVersion:1 as const,phases:[{key:'test' as const,persists:true,required:true}],measurementCriticalConfigPaths:['*']}
export type Profile='research'|'experience'
export type Side='left'|'right'
export type Input='touch'|'mouse'|'pen'|'keyboard'
export type Stage='iti'|'probability'|'frame'|'offers'|'choice'|'prepare'|'execution'|'feedback'|'cumulative'|'complete'
export function effortConfig(profile:Profile){if(!['research','experience'].includes(profile))throw Error('Unknown effort profile')
 return {profile,totalTrials:profile==='research'?72:18,blockTrials:18,highGoals:[50,100,200],highRewards:[3,5,7],probabilities:[1,0.5],lowGoal:20,lowReward:1,
  timing:{iti:1000,probability:1000,frame:700,offers:1500,choice:6500,prepare:3000,execution:25000,feedback:1000,cumulative:1000},
  inputPolicy:'one-full-down-up-selected-side-v1',incentive:'task-points-only-no-cash-promise',stimulus:{width:300,height:180,background:'#F2F2F2',lowColour:'#1D4ED8',highColour:'#009E73',lowRx:30,lowRy:38,lowY:105,highRx:36,highRy:46,highY:94,growthMaxPx:16},
  practice:{version:'effort-two-demos-three-questions-v1',trials:2,lowGoal:5,highGoal:10,highReward:2,executionMs:5000,quizCount:3,minimumCorrect:3,maxRounds:3,repeatInstructionsBeforeRetry:true},
  profileDefinitionVersion:'0.1.0',metricDefinitionVersion:'0.1.0',qualityDefinitionVersion:'0.1.0',reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0'}
}
export type EffortConfig=ReturnType<typeof effortConfig>
export function same(a:unknown,b:unknown):boolean{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&same((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]))}
export function assertEffortConfig(v:unknown):asserts v is EffortConfig{const p=(v as EffortConfig|null)?.profile;if((p!=='research'&&p!=='experience')||!same(v,effortConfig(p)))throw Error('Unsupported frozen effort config')}
function rng(seed:string){let s=2166136261;for(let i=0;i<seed.length;i++)s=Math.imul(s^seed.charCodeAt(i),16777619)>>>0;if(!s)s=0x9e3779b9
 return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296}}
function shuffled<T>(a:readonly T[],random:()=>number){const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return x}
export interface EffortPlan {index:number;phase:'test'|'practice';round:number;conditionKey:string;highGoal:number;highReward:number;probability:number;highSide:Side;rewardAvailable:boolean;lowGoal:number;lowReward:number;executionMs:number;forced:'low'|'high'|null}
export function effortPlan(config:EffortConfig,seed:string,phase:'test'|'practice'='test',round=0):EffortPlan[]{assertEffortConfig(config)
 if(!seed||seed.length>256||!Number.isInteger(round)||round<0||round>2||(phase==='test'&&round!==0))throw Error('Invalid effort plan identity')
 const random=rng(EFFORT_PROTOCOL.randomizationAlgorithmVersion+':'+seed+':'+phase+':'+round)
 if(phase==='practice')return (['low','high'] as const).map((forced,index):EffortPlan=>({index,phase,round,conditionKey:'demo-'+forced,highGoal:10,highReward:2,probability:1,highSide:'right',rewardAvailable:true,lowGoal:5,lowReward:1,executionMs:5000,forced}))
 const cells:Array<{goal:number;reward:number;probability:number}>=[];for(const goal of [50,100,200])for(const reward of [3,5,7])for(const probability of [1,0.5])cells.push({goal,reward,probability})
 const result:EffortPlan[]=[]
 if(config.profile==='research'){
  for(const c of cells)for(let rep=0;rep<4;rep++)result.push({index:0,phase,round,conditionKey:`${c.goal}/${c.reward}/${c.probability}`,highGoal:c.goal,highReward:c.reward,probability:c.probability,
   highSide:rep%2===0?'left':'right',rewardAvailable:c.probability===1||rep<2,lowGoal:20,lowReward:1,executionMs:25000,forced:null})
 }else{
  const sides=shuffled(Array.from({length:18},(_,i):Side=>i<9?'left':'right'),random),wins=4+Math.floor(random()*2),outcomes=shuffled(Array.from({length:9},(_,i)=>i<wins),random);let chance=0
  for(const [i,c] of cells.entries())result.push({index:0,phase,round,conditionKey:`${c.goal}/${c.reward}/${c.probability}`,highGoal:c.goal,highReward:c.reward,probability:c.probability,
   highSide:sides[i],rewardAvailable:c.probability===1?true:outcomes[chance++],lowGoal:20,lowReward:1,executionMs:25000,forced:null})
 }
 return shuffled(result,random).map((p,index)=>({...p,index}))
}
export const isHigh=(plan:EffortPlan,side:Side)=>plan.highSide===side
/** Null denotes an unmade/unexecuted choice, not zero reward or low effort. */
export function earnedPoints(plan:EffortPlan,side:Side|null,presses:number,executionComplete:boolean):number|null{
 if(side===null||!executionComplete)return null
 if(!plan.rewardAvailable)return 0
 if(isHigh(plan,side))return Math.round(plan.highReward*presses/plan.highGoal*100)/100
 return presses>=plan.lowGoal?plan.lowReward:0
}
export interface EffortPulse {side:Side;input:Input;key:string|null;downAtMs:number;upAtMs:number}
export interface EffortChoice {side:Side;input:Input;key:string|null;downAtMs:number;upAtMs:number}
export interface EffortRaw {plan:EffortPlan;status:'complete'|'interrupted';stopReason:string|null;startedAtPerfMs:number;endedAtPerfMs:number;
 onsets:Record<Exclude<Stage,'complete'>,number|null>;choiceEndMs:number|null;choice:EffortChoice|null;choiceOutcome:'selected'|'no_response'|null;
 executionEndMs:number|null;executionResult:'target_reached'|'window_elapsed'|null;presses:EffortPulse[];reward:number|null;
 ignored:{early:number;held:number;wrongSide:number;late:number;multiplePointer:number};eventOverflow:boolean}
export interface EffortQuizRaw {version:'effort-two-demos-three-questions-v1';round:number;questionId:string;answerIndex:number;atPerfMs:number}
export const EFFORT_QUIZ=[
 {id:'proportional',zh:'已兑现：100次为5点基准，实际按80次，获得多少点？',en:'Reward is available: 100 presses is a 5-point baseline. What do 80 presses earn?',optionsZh:['5点','4点','0点'],optionsEn:['5 points','4 points','0 points'],correct:1},
 {id:'probability',zh:'本轮没有兑现，即使完成了按压，会获得多少点？',en:'This trial does not pay out. How many points are earned even if you pressed?',optionsZh:['0点','基准的一半','基准点数'],optionsEn:['0 points','Half the baseline','The baseline points'],correct:0},
 {id:'missing',zh:'选择时间内没有选左或右，应该怎样记录？',en:'No side was selected before the choice deadline. How should it be recorded?',optionsZh:['选择较少按压','选择了但按压0次','未选择，单独记录'],optionsEn:['Chose fewer presses','Chose a side but made zero presses','No choice, recorded separately'],correct:2},
] as const

export function effortKeySide(token:string|null):Side|null {if(token===null)return null;if(/^(key:(KeyQ|q)|focus:left:(Space| |Enter|NumpadEnter))$/.test(token))return 'left';if(/^(key:(KeyP|p)|focus:right:(Space| |Enter|NumpadEnter))$/.test(token))return 'right';return null}
