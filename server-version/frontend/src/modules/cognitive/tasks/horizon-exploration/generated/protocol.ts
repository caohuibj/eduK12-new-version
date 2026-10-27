// Exact pure content projection. Backend SHA256: a303f7ba29c0b9b859cf325ac3dd6bda939079ae6e70f386df0c950dcca31feb
export type Profile='research'|'experience'
export type Side='left'|'right'
export type HorizonInput='touch'|'mouse'|'pen'|'keyboard'|'assistive'
export const HORIZON_IDENTITY={testType:'horizon-exploration',engineVersion:'0.1.0',scoringVersion:'0.1.0',configVersion:'0.1.0'} as const
export const HORIZON_PROTOCOL={schemaVersion:1 as const,key:'horizon-exploration/0.1.0/0.1.0',version:'0.1.0',clock:'performance' as const,randomizationAlgorithmVersion:'horizon-fnv1a-utf16-xorshift32-boxmuller-balanced-v1',trialEnvelopeVersion:1 as const,phases:[{key:'test' as const,persists:true,required:true}],measurementCriticalConfigPaths:['*']}
export interface HorizonConfig extends Record<string,unknown> {
 profile:Profile;totalGames:number;gamesPerBlock:80|40;profileDefinitionVersion:'0.1.0';metricDefinitionVersion:'0.1.0';qualityDefinitionVersion:'0.1.0';reportDefinitionVersion:'0.1.0';presentationVersion:'0.1.0';randomizationAlgorithmVersion:'horizon-fnv1a-utf16-xorshift32-boxmuller-balanced-v1';feedbackMs:300;rewardSD:8;rewardBounds:readonly [1,100];meanDifferences:readonly [4,8,12,20,30];practice:{games:3;maximumGroups:3;criterion:'complete-guided-games-not-choice-correctness'}
}
export function horizonConfig(profile:Profile):HorizonConfig {if(!['research','experience'].includes(profile))throw Error('Unknown Horizon profile');return {profile,totalGames:profile==='research'?320:40,gamesPerBlock:profile==='research'?80:40,profileDefinitionVersion:'0.1.0',metricDefinitionVersion:'0.1.0',qualityDefinitionVersion:'0.1.0',reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0',randomizationAlgorithmVersion:'horizon-fnv1a-utf16-xorshift32-boxmuller-balanced-v1',feedbackMs:300,rewardSD:8,rewardBounds:[1,100],meanDifferences:[4,8,12,20,30],practice:{games:3,maximumGroups:3,criterion:'complete-guided-games-not-choice-correctness'}}}
function sort(v:unknown):unknown {if(Array.isArray(v))return v.map(sort);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort((v as Record<string,unknown>)[k])]));return v}
export const same=(a:unknown,b:unknown)=>JSON.stringify(sort(a))===JSON.stringify(sort(b))
export function assertHorizonConfig(v:unknown):asserts v is HorizonConfig {if(!v||typeof v!=='object'||!same(v,horizonConfig((v as HorizonConfig).profile)))throw Error('Unknown exact Horizon configuration')}
export interface HorizonPlan {index:number;phase:'practice'|'test';round:number;blockIndex:number;cellId:string;freeChoices:1|6;totalSteps:5|10;information:'equal'|'unequal';lessSampledSide:Side|null;higherMeanSide:Side;absoluteMeanDifference:number;anchorMean:40|52|60;anchorSide:Side;means:Record<Side,number>;forced:Side[];rewards:Record<Side,number[]>}
function rng(seed:string) {let h=2166136261;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619)}let state=h>>>0||0x9e3779b9;return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return ((state>>>0)+0.5)/4294967296}}
function shuffle<T>(values:T[],r:()=>number) {const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
const side=(n:number):Side=>n%2===0?'left':'right'
export const otherSide=(s:Side):Side=>s==='left'?'right':'left'
export function horizonPlan(c:HorizonConfig,seed:string,phase:'practice'|'test'='test',round=0):HorizonPlan[] {
 assertHorizonConfig(c);if(!seed||seed.length>256||!['practice','test'].includes(phase)||!Number.isInteger(round)||round<0||round>2||(phase==='test'&&round!==0))throw Error('Invalid Horizon seed/phase/round')
 const random=rng(`${seed}|${phase}|${round}|${c.randomizationAlgorithmVersion}`)
 if(phase==='practice')return ([{h:1,info:'unequal',forced:['left','right','right','right']},{h:6,info:'equal',forced:['left','right','left','right']},{h:6,info:'unequal',forced:['right','left','left','left']}] as const).map((p,index)=>({index,phase,round,blockIndex:0,cellId:`guided-${index}`,freeChoices:p.h,totalSteps:p.h===1?5:10,information:p.info,lessSampledSide:p.info==='equal'?null:index===0?'left':'right',higherMeanSide:'left',absoluteMeanDifference:1,anchorMean:52,anchorSide:'left',means:{left:52,right:51},forced:[...p.forced],rewards:{left:[52,52,52,52,52,52,52,52,52,52].slice(0,p.h+4),right:[49,55,50,51,51,51,51,51,51,51].slice(0,p.h+4)}}))
 type Cell={h:0|1;info:0|1;d:number;high:0|1;orientation:0|1;id:string}
 const cells:Cell[]=[],offset=Math.floor(random()*2)
 for(const h of [0,1] as const)for(const info of [0,1] as const)for(let d=0;d<5;d++)for(const high of [0,1] as const)for(const orientation of [0,1] as const){if(c.profile==='experience'&&orientation!==(high^((d+h+info+offset)%2)))continue;cells.push({h,info,d,high,orientation,id:`${h}:${info}:${d}:${high}:${orientation}`})}
 const assignment=shuffle(cells,random),plans:HorizonPlan[]=[]
 for(let repeat=0;repeat<(c.profile==='research'?4:1);repeat++){
  const block=assignment.map((cell,ordinal)=>{const anchorCode=(ordinal+repeat)%4,anchorMean:40|60=anchorCode<2?40:60,anchorSide=side(anchorCode),higherMeanSide=side(cell.high),delta=c.meanDifferences[cell.d],otherMean=anchorMean+(anchorSide===higherMeanSide?-delta:delta),means={left:anchorSide==='left'?anchorMean:otherMean,right:anchorSide==='right'?anchorMean:otherMean},freeChoices:1|6=cell.h===0?1:6,totalSteps:5|10=cell.h===0?5:10,information=cell.info===0?'equal' as const:'unequal' as const,lessSampledSide=information==='unequal'?side(cell.orientation):null
   const forced:Side[]=information==='unequal'?shuffle([lessSampledSide!,otherSide(lessSampledSide!),otherSide(lessSampledSide!),otherSide(lessSampledSide!)],random):[side(cell.orientation),...shuffle([side(cell.orientation),otherSide(side(cell.orientation)),otherSide(side(cell.orientation))],random)]
   const rewards={} as Record<Side,number[]>
   for(const arm of ['left','right'] as const)rewards[arm]=Array.from({length:totalSteps},()=>{const normal=Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());return Math.min(100,Math.max(1,Math.round(means[arm]+c.rewardSD*normal)))})
   return {index:0,phase,round:0,blockIndex:repeat,cellId:cell.id,freeChoices,totalSteps,information,lessSampledSide,higherMeanSide,absoluteMeanDifference:delta,anchorMean,anchorSide,means,forced,rewards}
  });for(const plan of shuffle(block,random))plans.push({...plan,index:plans.length})
 }return plans
}
export interface HorizonChoice {step:number;side:Side;atMs:number;rtMs:number;input:HorizonInput;reward:number;forced:boolean;firstFree:boolean}
export interface HorizonState {stage:'choice'|'feedback'|'complete';choices:HorizonChoice[];readyAtMs:number;completeAtMs:number|null;held:string[];ignored:{early:number;held:number;wrongForced:number;inactive:number}}
export type HorizonEvent={kind:'ready';atMs:number}|{kind:'down'|'up'|'activate';atMs:number;side:Side;input:HorizonInput;token:string;key:string|null;repeat:boolean}
export interface HorizonRaw {plan:HorizonPlan;startedAtPerfMs:number;endedAtPerfMs:number;status:'complete'|'interrupted';stopReason:string|null;events:HorizonEvent[];state:HorizonState;ignoredRepeatCount:number;overflow:boolean}
export const initialHorizonState=(started:number):HorizonState=>({stage:'choice',choices:[],readyAtMs:started,completeAtMs:null,held:[],ignored:{early:0,held:0,wrongForced:0,inactive:0}})
export function horizonKey(key:string):Side|null {if(key==='ArrowLeft'||/^focus:left:(Space|Enter| )$/.test(key))return 'left';if(key==='ArrowRight'||/^focus:right:(Space|Enter| )$/.test(key))return 'right';return null}
export function reduceHorizonEvent(s:HorizonState,e:HorizonEvent,p:HorizonPlan,c:HorizonConfig) {
 if(e.kind==='ready'){if(s.stage!=='feedback'||e.atMs<s.readyAtMs)throw Error('Horizon feedback not completed');if(s.choices.length===p.totalSteps){s.stage='complete';s.completeAtMs=e.atMs}else{s.stage='choice';s.readyAtMs=e.atMs}return}
 if(e.input==='keyboard'){if(!e.key||horizonKey(e.key)!==e.side||e.token!=='key:'+e.key)throw Error('Horizon keyboard mapping differs')}
 else {if(e.key!==null)throw Error('Horizon pointer/assistive key differs');if(e.input==='assistive'?(e.kind!=='activate'||e.token!=='assistive:'+e.side):!e.token.startsWith('pointer:'))throw Error('Horizon input mapping differs')}
 if(e.kind==='activate'&&e.input!=='assistive')throw Error('Horizon atomic input must be identified')
 if(e.kind==='up'){s.held=s.held.filter(t=>t!==e.token);return}
 if(e.repeat)throw Error('Repeat key belongs to bounded aggregate, not choice log')
 if(s.held.includes(e.token)){s.ignored.held++;return}if(e.kind==='down')s.held.push(e.token)
 if(s.stage!=='choice'){s.ignored.inactive++;return}if(e.atMs<s.readyAtMs){s.ignored.early++;return}
 const step=s.choices.length;if(step<4&&e.side!==p.forced[step]){s.ignored.wrongForced++;return}
 const consumed=s.choices.filter(x=>x.side===e.side).length,reward=p.rewards[e.side][consumed];if(reward===undefined)throw Error('Horizon reward queue exhausted')
 s.choices.push({step,side:e.side,atMs:e.atMs,rtMs:e.atMs-s.readyAtMs,input:e.input,reward,forced:step<4,firstFree:step===4});s.stage='feedback';s.readyAtMs=e.atMs+c.feedbackMs
}
