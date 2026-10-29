export type Profile = 'research' | 'experience'
export type Shape = 'heart' | 'flower'
export type Side = 'left' | 'right'
export type Mode = 'heartOnly' | 'flowerOnly' | 'mixed'
export type Transition = 'switch' | 'repeat' | null
export type Input = 'keyboard' | 'touch' | 'mouse' | 'pen' | 'assistive'
export const HF_IDENTITY = {testType:'hearts-flowers',engineVersion:'0.1.0',scoringVersion:'0.1.0',configVersion:'0.1.0'} as const
export const HF_PROTOCOL = {schemaVersion:1 as const,key:'hearts-flowers/0.1.0/0.1.0',version:'0.1.0',clock:'performance' as const,randomizationAlgorithmVersion:'hf-fnv1a-utf16-xorshift32-euler-balanced-v1',trialEnvelopeVersion:1 as const,phases:[{key:'test' as const,persists:true,required:true}],measurementCriticalConfigPaths:['*']}
export function hfConfig(profile:Profile) {
 if(!['research','experience'].includes(profile))throw Error('Unknown hearts-flowers profile')
 return {profile,totalTrials:profile==='research'?57:32,heartTrials:profile==='research'?12:8,flowerTrials:profile==='research'?12:8,mixedTrials:profile==='research'?33:16,deadlineMs:2500,blankMs:1000,practice:{trials:8,deadlineMs:3500,minimumCorrect:7,maxRounds:3,repeatInstructionsBeforeRetry:true},stimulus:{background:'#fbfdff',heart:'#da5c71',flower:'#7357aa',fieldMaxWidth:600,fieldHeight:205,sideFraction:0.25,size:78},inputPolicy:'fresh-first-down-half-open-v1',profileDefinitionVersion:'0.1.0',metricDefinitionVersion:'0.1.0',qualityDefinitionVersion:'0.1.0',reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0'}
}
export type HFConfig = ReturnType<typeof hfConfig>
export function same(a:unknown,b:unknown):boolean {if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&same((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]))}
export function assertHFConfig(v:unknown):asserts v is HFConfig {const p=(v as HFConfig|null)?.profile;if((p!=='research'&&p!=='experience')||!same(v,hfConfig(p)))throw Error('Unknown frozen hearts-flowers config')}
function random(seed:string){let s=2166136261;for(let i=0;i<seed.length;i++)s=Math.imul(s^seed.charCodeAt(i),16777619)>>>0;if(!s)s=0x9e3779b9;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296}}
function shuffle<T>(a:readonly T[],rand:()=>number){const out=[...a];for(let i=out.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
export const opposite=(side:Side):Side=>side==='left'?'right':'left'
export const correctSide=(shape:Shape,side:Side):Side=>shape==='heart'?side:opposite(side)
export interface HFPlan {index:number;phase:'test'|'practice';round:number;mode:Mode;shape:Shape;side:Side;transition:Transition;deadlineMs:number}
/** Seeded directed Euler circuit: edges classify the CURRENT shape and previous/current rule transition. */
function mixedShapes(profile:Profile,rand:()=>number):Shape[]{const start:Shape=rand()<0.5?'heart':'flower',other:Shape=start==='heart'?'flower':'heart',each=profile==='research'?8:4,edges:Record<Shape,Shape[]>={heart:[],flower:[]}
 for(const shape of ['heart','flower'] as const){const self=profile==='research'?each:(shape===start?3:4);edges[shape]=shuffle([...Array<Shape>(self).fill(shape),...Array<Shape>(each).fill(shape==='heart'?'flower':'heart')],rand)}
 const stack:Shape[]=[start],circuit:Shape[]=[];while(stack.length){const current=stack[stack.length-1];if(edges[current].length)stack.push(edges[current].pop()!);else circuit.push(stack.pop()!)}
 const full=circuit.reverse();if(full[0]!==start||full[full.length-1]!==start||!full.includes(other))throw Error('Euler circuit failed');return full
}
export function hfPlan(c:HFConfig,seed:string,phase:'test'|'practice'='test',round=0):HFPlan[]{assertHFConfig(c);if(!seed||seed.length>256||!['test','practice'].includes(phase)||!Number.isInteger(round)||round<0||round>2||(phase==='test'&&round!==0))throw Error('Invalid hearts-flowers plan identity')
 const rand=random(HF_PROTOCOL.randomizationAlgorithmVersion+':'+seed+':'+phase+':'+round),result:HFPlan[]=[],add=(mode:Mode,shape:Shape,side:Side,transition:Transition)=>result.push({index:result.length,phase,round,mode,shape,side,transition,deadlineMs:phase==='practice'?3500:2500})
 for(const [mode,shape,n] of [['heartOnly','heart',phase==='practice'?2:c.heartTrials],['flowerOnly','flower',phase==='practice'?2:c.flowerTrials]] as const)for(const side of shuffle([...Array<Side>(n/2).fill('left'),...Array<Side>(n/2).fill('right')],rand))add(mode,shape,side,null)
 if(phase==='practice'){const examples=shuffle([{shape:'heart' as const,side:'left' as const},{shape:'heart' as const,side:'right' as const},{shape:'flower' as const,side:'left' as const},{shape:'flower' as const,side:'right' as const}],rand);for(const [i,p] of examples.entries())add('mixed',p.shape,p.side,i===0?null:examples[i-1].shape===p.shape?'repeat':'switch');return result}
 const shapes=mixedShapes(c.profile,rand),firstSide:Side=rand()<0.5?'left':'right',queues:Record<string,Side[]>={}
 for(const shape of ['heart','flower'] as const)for(const transition of ['switch','repeat'] as const){let sides:Side[]=c.profile==='research'?['left','left','left','left','right','right','right','right']:['left','left','right','right'];if(c.profile==='experience'&&shape===shapes[0]&&transition==='repeat')sides=[firstSide,opposite(firstSide),opposite(firstSide)];queues[shape+transition]=shuffle(sides,rand)}
 for(const [i,shape] of shapes.entries()){const transition:Transition=i===0?null:shape===shapes[i-1]?'repeat':'switch';add('mixed',shape,transition===null?firstSide:queues[shape+transition].pop()!,transition)}
 if(result.length!==c.totalTrials||Object.values(queues).some(q=>q.length))throw Error('Balanced hearts-flowers plan failed');return result
}
export type Stage='ready'|'stimulus'|'blank'|'complete'
export interface HFState {stage:Stage;onsetMs:number|null;closedMs:number|null;completeMs:number|null;endReason:'response'|'deadline'|null;response:{side:Side;atMs:number;input:Input;token:string;key:string|null}|null;held:string[];ignored:{early:number;held:number;late:number}}
export type HFEvent={kind:'onset';atMs:number}|{kind:'timeout';atMs:number}|{kind:'finish';atMs:number}|{kind:'down'|'up'|'activate';atMs:number;side:Side;input:Input;token:string;key:string|null;repeat:boolean}
export const initialHFState=():HFState=>({stage:'ready',onsetMs:null,closedMs:null,completeMs:null,endReason:null,response:null,held:[],ignored:{early:0,held:0,late:0}})
export function hfKey(key:string):Side|null {if(key==='ArrowLeft')return 'left';if(key==='ArrowRight')return 'right';const m=/^focus:(left|right):(Space| |Enter|NumpadEnter)$/.exec(key);return m?m[1] as Side:null}
export function reduceHFEvent(s:HFState,e:HFEvent,p:HFPlan,c:HFConfig,start:number){if(s.stage==='complete')throw Error('Event after completion')
 if(e.kind==='onset'){if(s.stage!=='ready'||e.atMs<start)throw Error('Invalid onset');s.stage='stimulus';s.onsetMs=e.atMs;return}
 if(e.kind==='timeout'){if(s.stage!=='stimulus'||e.atMs<s.onsetMs!+p.deadlineMs)throw Error('Early deadline');s.stage='blank';s.closedMs=e.atMs;s.endReason='deadline';return}
 if(e.kind==='finish'){if(s.stage!=='blank'||e.atMs<s.closedMs!+c.blankMs)throw Error('Unexecuted blank');s.stage='complete';s.completeMs=e.atMs;return}
 if(e.input==='keyboard'){if(e.key===null||hfKey(e.key)!==e.side)throw Error('Keyboard mapping mismatch');if(e.token!=='key:'+e.key)throw Error('Keyboard token mismatch')}else if(e.key!==null)throw Error('Nonkeyboard key mismatch')
 if(e.kind==='up'){s.held=s.held.filter(token=>token!==e.token);return}if(e.kind==='activate'&&e.input!=='assistive')throw Error('Atomic activation must identify assistive input')
 if(e.repeat||s.held.includes(e.token)){s.ignored.held++;return}if(e.kind==='down')s.held.push(e.token)
 if(s.stage!=='stimulus'){s.ignored[s.stage==='ready'?'early':'late']++;return}if(e.atMs>=s.onsetMs!+p.deadlineMs){s.ignored.late++;return}
 s.response={side:e.side,atMs:e.atMs,input:e.input,token:e.token,key:e.key};s.stage='blank';s.closedMs=e.atMs;s.endReason='response'
}
export interface HFRaw {plan:HFPlan;startedAtPerfMs:number;endedAtPerfMs:number;status:'complete'|'interrupted';stopReason:string|null;initialHeld:string[];events:HFEvent[];state:HFState;ignoredRepeatCount:number;overflow:boolean}
