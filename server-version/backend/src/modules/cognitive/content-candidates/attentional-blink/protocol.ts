import {BLINK_FONT} from './font'
export type Profile='research'|'experience'
export const BLINK_IDENTITY={testType:'attentional-blink',engineVersion:'0.1.0',scoringVersion:'0.1.0',configVersion:'0.1.0'} as const
export const BLINK_PROTOCOL={schemaVersion:1 as const,key:'attentional-blink/0.1.0/0.1.0',version:'0.1.0',clock:'performance' as const,randomizationAlgorithmVersion:'blink-fnv1a-utf16-xorshift32-balanced-v1',trialEnvelopeVersion:1 as const,phases:[{key:'test' as const,persists:true,required:true}],measurementCriticalConfigPaths:['*']}
export const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export function blinkConfig(profile:Profile){if(profile!=='research'&&profile!=='experience')throw Error('Unknown blink profile');return {profile,totalTrials:profile==='research'?200:50,blockTrials:50,t1Indices:[6,7,8,9,10],lags:[1,2,5,8,10],streamLength:26,timing:{preMs:100,fixationMs:800,soaMs:133,letterMs:80},
 stimulus:{width:300,height:300,background:'#262626',foreground:'#FFFFFF',fontFamily:'EduBlinkLiberationSans',fontPx:40,fixationSymbol:'+',fixationFontPx:24,font:BLINK_FONT,cueRadiusPx:96,cueStrokePx:2},inputPolicy:'post-stream-two-explicit-answers-confirm-v1',
 practice:{version:'blink-easier-six-v1',trials:6,streamLength:12,t1Indices:[2,3,4],lags:[4,6],soaMs:250,letterMs:150,minimumCorrect:5,maxRounds:3,repeatInstructionsBeforeRetry:true},
 profileDefinitionVersion:'0.1.0',metricDefinitionVersion:'0.1.0',qualityDefinitionVersion:'0.1.0',reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0'}}
export type BlinkConfig=ReturnType<typeof blinkConfig>
export function same(a:unknown,b:unknown):boolean{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&same((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]))}
export function assertBlinkConfig(v:unknown):asserts v is BlinkConfig{const p=(v as BlinkConfig|null)?.profile;if((p!=='research'&&p!=='experience')||!same(v,blinkConfig(p)))throw Error('Unsupported frozen blink config')}
function random(seed:string){let s=2166136261;for(let i=0;i<seed.length;i++)s=Math.imul(s^seed.charCodeAt(i),16777619)>>>0;if(!s)s=0x9e3779b9;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296}}
function shuffle<T>(a:readonly T[],rand:()=>number){const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return x}
export interface BlinkPlan {index:number;phase:'test'|'practice';round:number;condition:string;stream:string[];t1Index:number;t2Index:number;lag:number;soaMs:number;letterMs:number}
export function blinkPlan(c:BlinkConfig,seed:string,phase:'test'|'practice'='test',round=0):BlinkPlan[]{assertBlinkConfig(c);if(!seed||seed.length>256||!Number.isInteger(round)||round<0||round>2||(phase==='test'&&round!==0))throw Error('Invalid blink plan identity')
 const rand=random(BLINK_PROTOCOL.randomizationAlgorithmVersion+':'+seed+':'+phase+':'+round),practice=phase==='practice',design:{t1:number;lag:number}[]=[]
 for(const t1 of practice?c.practice.t1Indices:c.t1Indices)for(const lag of practice?c.practice.lags:c.lags)for(let i=0;i<(practice?1:c.profile==='research'?8:2);i++)design.push({t1,lag})
 return shuffle(design,rand).map(({t1,lag},index)=>({index,phase,round,condition:`${t1}/${lag}`,stream:shuffle([...ALPHABET],rand).slice(0,practice?12:26),t1Index:t1,t2Index:t1+lag,lag,soaMs:practice?250:133,letterMs:practice?150:80}))}
export type BlinkStage='pre'|'fixation'|'letter'|'blank'|'response'
export type BlinkInput='touch'|'mouse'|'pen'|'keyboard'|'assistive'
export interface BlinkFrame {atMs:number;stage:BlinkStage;letterIndex:number|null;cue:boolean}
export interface BlinkAction {atMs:number;kind:'focus'|'letter'|'forget'|'clear'|'confirm';target:0|1;letter:string|null;input:BlinkInput;key:string|null}
export interface BlinkAnswerState {answers:[string|null,string|null];handled:[boolean,boolean];active:0|1;confirmedAtMs:number|null}
export const emptyBlinkAnswers=():BlinkAnswerState=>({answers:[null,null],handled:[false,false],active:0,confirmedAtMs:null})
/** Explicit null (forget) is an answered trial. An untouched null remains unhandled and cannot confirm. */
export function applyBlinkAction(state:BlinkAnswerState,a:BlinkAction):boolean{if(state.confirmedAtMs!==null)return false
 if(a.kind==='focus'){if(a.letter!==null)return false;state.active=a.target;return true}if(a.target!==state.active)return false
 if(a.kind==='letter'){if(!a.letter||!ALPHABET.includes(a.letter)||a.letter.length!==1)return false;state.answers[a.target]=a.letter;state.handled[a.target]=true;if(a.target===0)state.active=1;return true}
 if(a.letter!==null)return false
 if(a.kind==='forget'){state.answers[a.target]=null;state.handled[a.target]=true;if(a.target===0)state.active=1;return true}
 if(a.kind==='clear'){state.answers[a.target]=null;state.handled[a.target]=false;return true}
 if(!state.handled.every(Boolean))return false;state.confirmedAtMs=a.atMs;return true}
export interface BlinkRaw {plan:BlinkPlan;startedAtPerfMs:number;endedAtPerfMs:number;status:'complete'|'interrupted';stopReason:string|null;fixationAtMs:number|null;responseAtMs:number|null;exposures:{index:number;onsetMs:number;offsetMs:number|null}[];frames:BlinkFrame[];actions:BlinkAction[];answer:BlinkAnswerState;ignored:{early:number;repeat:number;unready:number};overflow:boolean}
