import {TMB_FIXED_300} from './source-data'
import {GRAD_ASSETS} from './assets'
export type Profile='research'|'experience'
export const GRAD_IDENTITY={testType:'gradcpt',engineVersion:'0.1.0',scoringVersion:'0.1.0',configVersion:'0.1.0'} as const
export const GRAD_PROTOCOL={schemaVersion:1 as const,key:'gradcpt/0.1.0/0.1.0',version:'0.1.0',clock:'performance' as const,randomizationAlgorithmVersion:'grad-tmb300-or-fnv1a-xorshift32-90-10-v1',trialEnvelopeVersion:1 as const,phases:[{key:'test' as const,persists:true,required:true}],measurementCriticalConfigPaths:['*']}
export function gradConfig(profile:Profile){if(profile!=='research'&&profile!=='experience')throw Error('Unknown gradCPT profile');return {profile,totalTrials:profile==='research'?300:100,cityCount:profile==='research'?268:90,mountainCount:profile==='research'?32:10,transitionMs:800,
 stimulus:{width:310,height:256,background:'#FFFFFF',assets:GRAD_ASSETS.map(a=>({...a}))},sequence:profile==='research'?'tmb-input-300-32nogo-2dbe2969':'seeded-90-city-10-mountain-v1',
 inputPolicy:'fresh-down-up-single-contact-debounce50-v1',assignmentVersion:'tmb-opacity-event-attribution-v1',practice:{trials:8,slowTrials:4,slowMs:1600,normalMs:800,cityCount:6,mountainCount:2,minimumCorrect:7,maxRounds:3,repeatInstructionsBeforeRetry:true},
 profileDefinitionVersion:'0.1.0',metricDefinitionVersion:'0.1.0',qualityDefinitionVersion:'0.1.0',reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0'}}
export type GradConfig=ReturnType<typeof gradConfig>
export function same(a:unknown,b:unknown):boolean{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&same((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]))}
export function assertGradConfig(v:unknown):asserts v is GradConfig{const p=(v as GradConfig|null)?.profile;if((p!=='research'&&p!=='experience')||!same(v,gradConfig(p)))throw Error('Unsupported frozen gradCPT config')}
function random(seed:string){let s=2166136261;for(let i=0;i<seed.length;i++)s=Math.imul(s^seed.charCodeAt(i),16777619)>>>0;if(!s)s=0x9e3779b9;return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296}}
function shuffle<T>(a:readonly T[],rand:()=>number){const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return x}
export interface GradSlot {index:number;image:string;kind:'city'|'mountain'|'boundary';durationMs:number}
export function slots(images:readonly string[],durationMs=800):GradSlot[]{return ['scrambled.png',...images,'scrambled.png'].map((image,index)=>({index,image,kind:image.startsWith('city')?'city':image.startsWith('mountain')?'mountain':'boundary',durationMs}))}
export function gradPlan(config:GradConfig,seed:string):GradSlot[]{assertGradConfig(config);if(!seed||seed.length>256)throw Error('Invalid gradCPT seed')
 if(config.profile==='research')return slots(TMB_FIXED_300)
 const rand=random(GRAD_PROTOCOL.randomizationAlgorithmVersion+':'+seed),categories=shuffle(Array.from({length:100},(_,i)=>i<90?'city':'mountain'),rand)
 const bags:Record<string,number[]>={city:[],mountain:[]};let previous=''
 // Nine full city image bags and one mountain image bag: exact counts without unbounded whole-sequence rejection.
 const images=categories.map(kind=>{let bag=bags[kind];if(!bag.length)bag=bags[kind]=shuffle([1,2,3,4,5,6,7,8,9,10],rand)
  if(`${kind}${bag[bag.length-1]}.png`===previous)[bag[0],bag[bag.length-1]]=[bag[bag.length-1],bag[0]]
  const image=`${kind}${bag.pop()!}.png`;previous=image;return image})
 return slots(images)}
export function gradPracticePlans(config:GradConfig,seed:string,round:number):GradSlot[][]{assertGradConfig(config);if(!seed||seed.length>256||!Number.isInteger(round)||round<0||round>=3)throw Error('Invalid practice identity')
 const rand=random(seed+':grad-practice:'+round),out:GradSlot[][]=[];for(let block=0;block<2;block++)for(const kind of shuffle(['city','city','city','mountain'],rand))out.push(slots([`${kind}${1+Math.floor(rand()*10)}.png`],block===0?1600:800));return out}
export type GradInput='touch'|'mouse'|'pen'|'keyboard'
export interface GradFrame {atMs:number;slotIndex:number;opacity:number}
export interface GradEvent extends GradFrame {type:'down'|'up';token:string;input:GradInput;repeat:boolean;primary:boolean}
export interface GradRaw {plan:GradSlot[];startedAtPerfMs:number;endedAtPerfMs:number;status:'complete'|'interrupted';stopReason:string|null;slots:{index:number;startMs:number;endMs:number|null}[];frames:GradFrame[];events:GradEvent[];overflow:boolean}
