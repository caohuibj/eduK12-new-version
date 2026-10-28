export type Profile='research'|'experience'
export type Channel='blue'|'red'
export type Direction='left'|'right'
export type Mode='blue'|'red'|'dual'
export const DUAL_IDENTITY={testType:'dual-arrow',engineVersion:'0.1.0',scoringVersion:'0.1.0',configVersion:'0.1.0'} as const
export const DUAL_PROTOCOL={schemaVersion:1 as const,key:'dual-arrow/0.1.0/0.1.0',version:'0.1.0',clock:'performance' as const,randomizationAlgorithmVersion:'dual-fnv1a-utf16-xorshift32-latin-balanced-v1',trialEnvelopeVersion:1 as const,phases:[{key:'test' as const,persists:true,required:true}],measurementCriticalConfigPaths:['*']}
export function dualConfig(profile:Profile){if(profile!=='research'&&profile!=='experience')throw Error('Unknown dual profile');return {profile,totalTrials:profile==='research'?300:60,trialsPerBlock:profile==='research'?25:10,cycles:profile==='research'?4:2,modes:['blue','red','dual'],deadlineMs:5000,fixationMinMs:300,fixationMaxMs:799,correctFeedbackMs:500,errorFeedbackMs:1000,
 stimulus:{width:300,height:260,background:'#000000',blue:'#00AAFF',red:'#E53935',blueX:110,blueY:113.75,redX:190,redY:146.25,size:65,shaftWidth:8,shaftLength:45,headLength:32.5,headHalfHeight:16.25,fixationLength:12,fixationStroke:2},inputPolicy:'fresh-first-down-per-required-channel-v1',
 practice:{version:'dual-easier-three-v1',trials:3,deadlineMs:8000,minimumCorrect:3,maxRounds:3,repeatInstructionsBeforeRetry:true},profileDefinitionVersion:'0.1.0',metricDefinitionVersion:'0.1.0',qualityDefinitionVersion:'0.1.0',reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0'}}
export type DualConfig=ReturnType<typeof dualConfig>
export function same(a:unknown,b:unknown):boolean{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&same((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]))}
export function assertDualConfig(v:unknown):asserts v is DualConfig{const p=(v as DualConfig|null)?.profile;if((p!=='research'&&p!=='experience')||!same(v,dualConfig(p)))throw Error('Unsupported frozen dual config')}
function random(seed:string){let s=2166136261;for(let i=0;i<seed.length;i++)s=Math.imul(s^seed.charCodeAt(i),16777619)>>>0;if(!s)s=0x9e3779b9;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296}}
function shuffle<T>(a:readonly T[],rand:()=>number){const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return x}
export interface DualPlan {index:number;phase:'test'|'practice';round:number;blockIndex:number;cycle:number;withinBlock:number;mode:Mode;blue:Direction;red:Direction;fixationMs:number;deadlineMs:number}
export function dualPlan(c:DualConfig,seed:string,phase:'test'|'practice'='test',round=0):DualPlan[]{assertDualConfig(c);if(!seed||seed.length>256||!Number.isInteger(round)||round<0||round>2||(phase==='test'&&round!==0))throw Error('Invalid dual plan identity')
 const rand=random(DUAL_PROTOCOL.randomizationAlgorithmVersion+':'+seed+':'+phase+':'+round),modes:Mode[]=['blue','red','dual'],base=shuffle(modes,rand),extras=Object.fromEntries(modes.map(mode=>[mode,shuffle([0,1,2,3],rand)])),combos:[Direction,Direction][]=[['left','left'],['left','right'],['right','left'],['right','right']],result:DualPlan[]=[]
 if(phase==='practice')return modes.map((mode,index)=>({index,phase,round,blockIndex:index,cycle:0,withinBlock:0,mode,blue:'left',red:'right',fixationMs:300+Math.floor(rand()*500),deadlineMs:8000}))
 for(let cycle=0;cycle<c.cycles;cycle++){const order=cycle<3?base.map((_,i)=>base[(i+cycle)%3]):shuffle(base,rand)
  for(const [position,mode] of order.entries()){const counts=c.profile==='research'?combos.map((_,k)=>6+(k===extras[mode][cycle]?1:0)):combos.map((_,k)=>2+(extras[mode].slice(cycle*2,cycle*2+2).includes(k)?1:0)),deck=shuffle(combos.flatMap((combo,k)=>Array.from({length:counts[k]},()=>combo)),rand)
   for(const [withinBlock,[blue,red]] of deck.entries())result.push({index:result.length,phase,round,blockIndex:cycle*3+position,cycle,withinBlock,mode,blue,red,fixationMs:300+Math.floor(rand()*500),deadlineMs:5000})}}
 return result}
export const requiredDual=(mode:Mode,channel:Channel)=>mode==='dual'||mode===channel
export type DualInput='touch'|'mouse'|'pen'|'keyboard'|'assistive'
export type DualStage='fixation'|'stimulus'|'feedback'|'complete'
export interface DualResponse {required:boolean;choice:Direction|null;atMs:number|null;input:DualInput|null;token:string|null;key:string|null}
export interface DualState {stage:DualStage;stimulusAtMs:number|null;feedbackAtMs:number|null;completeAtMs:number|null;endReason:'responses'|'deadline'|null;responses:Record<Channel,DualResponse>;held:{token:string;channel:Channel;direction:Direction;stage:DualStage}[];ignored:{early:number;inactive:number;held:number;answered:number;late:number}}
export type DualEvent={kind:'stimulus';atMs:number}|{kind:'timeout';atMs:number}|{kind:'finish';atMs:number}|{kind:'down'|'up'|'activate';atMs:number;channel:Channel;direction:Direction;token:string;input:DualInput;key:string|null;repeat:boolean;primary:boolean}
export function initialDualState(p:DualPlan):DualState{const response=(channel:Channel):DualResponse=>({required:requiredDual(p.mode,channel),choice:null,atMs:null,input:null,token:null,key:null});return {stage:'fixation',stimulusAtMs:null,feedbackAtMs:null,completeAtMs:null,endReason:null,responses:{blue:response('blue'),red:response('red')},held:[],ignored:{early:0,inactive:0,held:0,answered:0,late:0}}}
export function dualKey(key:string):{channel:Channel;direction:Direction}|null{const focus=/^focus:(blue|red):(left|right):(Space| |Enter|NumpadEnter)$/.exec(key);if(focus)return {channel:focus[1] as Channel,direction:focus[2] as Direction};if(['Digit1','Numpad1','1'].includes(key))return {channel:'blue',direction:'left'};if(['Digit2','Numpad2','2'].includes(key))return {channel:'blue',direction:'right'};if(['Digit9','Numpad9','9'].includes(key))return {channel:'red',direction:'left'};if(['Digit0','Numpad0','0'].includes(key))return {channel:'red',direction:'right'};return null}
export function allDualCorrect(s:DualState,p:DualPlan){return (['blue','red'] as const).every(channel=>!s.responses[channel].required||s.responses[channel].choice===p[channel])}
export const dualFeedbackMs=(s:DualState,p:DualPlan,c:DualConfig)=>allDualCorrect(s,p)?c.correctFeedbackMs:c.errorFeedbackMs
/** Separate first responses per channel. Two different touch pointers are allowed; no isPrimary filter or synchrony threshold. */
export function reduceDualEvent(s:DualState,e:DualEvent,p:DualPlan,c:DualConfig,start:number){
 if(s.stage==='complete')throw Error('Dual event after completion')
 if(e.kind==='stimulus'){if(s.stage!=='fixation'||e.atMs<start+p.fixationMs)throw Error('Dual fixation not executed');s.stage='stimulus';s.stimulusAtMs=e.atMs;return}
 if(e.kind==='timeout'){if(s.stage!=='stimulus'||e.atMs<s.stimulusAtMs!+p.deadlineMs)throw Error('Early dual timeout');s.stage='feedback';s.feedbackAtMs=e.atMs;s.endReason='deadline';return}
 if(e.kind==='finish'){if(s.stage!=='feedback'||e.atMs<s.feedbackAtMs!+dualFeedbackMs(s,p,c))throw Error('Dual feedback not executed');s.stage='complete';s.completeAtMs=e.atMs;return}
 if(e.input==='keyboard'){const mapping=e.key===null?null:dualKey(e.key);if(!mapping||mapping.channel!==e.channel||mapping.direction!==e.direction)throw Error('Dual keyboard mapping mismatch')}else if(e.key!==null)throw Error('Nonkeyboard dual key mismatch')
 if(e.kind==='up'){s.held=s.held.filter(h=>h.token!==e.token);return}
 if(e.kind==='activate'&&e.input!=='assistive')throw Error('Atomic dual input must identify assistive activation')
 if(e.repeat||s.held.some(h=>h.token===e.token)){s.ignored.held++;return}
 if(e.kind==='down')s.held.push({token:e.token,channel:e.channel,direction:e.direction,stage:s.stage})
 if(s.stage!=='stimulus'){if(s.stage==='feedback'&&s.endReason==='deadline')s.ignored.late++;else s.ignored.early++;return}if(e.atMs>=s.stimulusAtMs!+p.deadlineMs){s.ignored.late++;return}
 const response=s.responses[e.channel];if(!response.required){s.ignored.inactive++;return}if(response.choice!==null){s.ignored.answered++;return}
 s.responses[e.channel]={required:true,choice:e.direction,atMs:e.atMs,input:e.input,token:e.token,key:e.key}
 if(Object.values(s.responses).every(r=>!r.required||r.choice!==null)){s.stage='feedback';s.feedbackAtMs=e.atMs;s.endReason='responses'}
}
export interface DualRaw {plan:DualPlan;startedAtPerfMs:number;endedAtPerfMs:number;status:'complete'|'interrupted';stopReason:string|null;events:DualEvent[];state:DualState;ignoredRepeatCount:number;overflow:boolean}
