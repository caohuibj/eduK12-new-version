import {SEARCH_FONT} from './font'
export type Profile='research'|'experience'
export const SEARCH_IDENTITY={testType:'visual-search-two-stage',engineVersion:'0.1.0',scoringVersion:'0.1.0',configVersion:'0.1.0'} as const
export const SEARCH_PROTOCOL={schemaVersion:1 as const,key:'visual-search-two-stage/0.1.0/0.1.0',version:'0.1.0',clock:'performance' as const,randomizationAlgorithmVersion:'search-fnv1a-utf16-xorshift32-grid-jitter-balanced-v1',trialEnvelopeVersion:1 as const,phases:[{key:'test' as const,persists:true,required:true}],measurementCriticalConfigPaths:['*']}
export const COLOURS=['#FFFFFF','#00FF00'] as const
export function searchConfig(profile:Profile){if(profile!=='research'&&profile!=='experience')throw Error('Unknown search profile');return {profile,totalTrials:profile==='research'?180:36,blockTrials:60,targetCharacters:['O','X'],targetColours:[...COLOURS],setSizes:[10,20,30],targetCounts:[0,1,5],previewMs:800,
 stimulus:{width:300,height:360,background:'#000000',foilColour:'#FFFFFF',fontFamily:'EduVisualSearchLiberationSans',fontPx:24,font:SEARCH_FONT,columns:6,rows:6,cellWidth:50,cellHeight:60,jitterPx:2,circleRadius:16,hitRadius:22},
 targetReminder:'both-phases-text-v1',inputPolicy:'fresh-cycle-per-stage-v1',practice:{version:'search-easier-three-v1',trials:3,setSize:8,targetCounts:[1,0,1],minimumCorrect:3,maxRounds:3,repeatInstructionsBeforeRetry:true},
 profileDefinitionVersion:'0.1.0',metricDefinitionVersion:'0.1.0',qualityDefinitionVersion:'0.1.0',reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0'}}
export type SearchConfig=ReturnType<typeof searchConfig>
export function same(a:unknown,b:unknown):boolean{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&same((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]))}
export function assertSearchConfig(v:unknown):asserts v is SearchConfig{const p=(v as SearchConfig|null)?.profile;if((p!=='research'&&p!=='experience')||!same(v,searchConfig(p)))throw Error('Unsupported frozen search config')}
function random(seed:string){let s=2166136261;for(let i=0;i<seed.length;i++)s=Math.imul(s^seed.charCodeAt(i),16777619)>>>0;if(!s)s=0x9e3779b9;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296}}
function shuffle<T>(a:readonly T[],rand:()=>number){const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return x}
export interface SearchItem {id:string;x:number;y:number;letter:string;colour:string;target:boolean}
export interface SearchPlan {index:number;phase:'test'|'practice';round:number;condition:string;targetCharacter:'O'|'X';targetColour:typeof COLOURS[number];setSize:number;targetCount:number;items:SearchItem[]}
export function searchPlan(c:SearchConfig,seed:string,phase:'test'|'practice'='test',round=0):SearchPlan[]{assertSearchConfig(c);if(!seed||seed.length>256||!Number.isInteger(round)||round<0||round>2||(phase==='test'&&round!==0))throw Error('Invalid search plan identity')
 const rand=random(SEARCH_PROTOCOL.randomizationAlgorithmVersion+':'+seed+':'+phase+':'+round),design:{targetCharacter:'O'|'X';targetColour:typeof COLOURS[number];setSize:number;targetCount:number}[]=[]
 if(phase==='practice')design.push({targetCharacter:'O',targetColour:'#00FF00',setSize:8,targetCount:1},{targetCharacter:'X',targetColour:'#FFFFFF',setSize:8,targetCount:0},{targetCharacter:'O',targetColour:'#FFFFFF',setSize:8,targetCount:1})
 else for(const targetCharacter of ['O','X'] as const)for(const targetColour of COLOURS)for(const setSize of [10,20,30])for(const targetCount of [0,1,5])for(let rep=0;rep<(c.profile==='research'?5:1);rep++)design.push({targetCharacter,targetColour,setSize,targetCount})
 return (phase==='test'?shuffle(design,rand):design).map((d,index)=>{const cells=shuffle(Array.from({length:36},(_,i)=>i),rand).slice(0,d.setSize),targetCells=new Set(shuffle(cells,rand).slice(0,d.targetCount)),foilCount=d.setSize-d.targetCount,foilOrder=shuffle([...('UDGCQ')],rand),foils=shuffle(Array.from({length:foilCount},(_,i)=>foilOrder[i%5]),rand);let foilIndex=0
  const items=cells.sort((a,b)=>a-b).map(cell=>{const target=targetCells.has(cell);return {id:`cell-${cell}`,x:25+(cell%6)*50+(rand()*4-2),y:30+Math.floor(cell/6)*60+(rand()*4-2),letter:target?d.targetCharacter:foils[foilIndex++],colour:target?d.targetColour:'#FFFFFF',target}})
  return {...d,index,phase,round,condition:`${d.targetCharacter}/${d.targetColour}/${d.setSize}/${d.targetCount}`,items}})}
export type SearchInput='touch'|'mouse'|'pen'|'keyboard'|'assistive'
export type SearchStage='preview'|'search'|'locate'|'complete'
export type SearchSelection={kind:'none'}|{kind:'item';id:string}
export type SearchEvent={kind:'reveal';atMs:number}|{kind:'down'|'up'|'focus'|'activate';atMs:number;control:string;token:string;input:SearchInput;key:string|null;repeat:boolean;primary:boolean}
export interface SearchState {stage:SearchStage;searchAtMs:number|null;locateAtMs:number|null;selectionAtMs:number|null;selection:SearchSelection|null;searchInput:SearchInput|null;locateInput:SearchInput|null;focused:string|null;held:{token:string;control:string;input:SearchInput;key:string|null;stage:SearchStage;downAtMs:number}|null;ignored:{early:number;repeat:number;multiple:number;held:number;crossStage:number;outside:number}}
export const initialSearchState=():SearchState=>({stage:'preview',searchAtMs:null,locateAtMs:null,selectionAtMs:null,selection:null,searchInput:null,locateInput:null,focused:null,held:null,ignored:{early:0,repeat:0,multiple:0,held:0,crossStage:0,outside:0}})
/** Only a genuine new activation in the correct stage can answer. NONE is explicit, never a default index. */
export function reduceSearchEvent(s:SearchState,e:SearchEvent,p:SearchPlan,c:SearchConfig,start:number){
 if(s.stage==='complete')throw Error('Search input after completion')
 if(e.kind==='reveal'){if(s.stage!=='preview'||e.atMs<start+c.previewMs)throw Error('Search preview was not presented');s.stage='search';s.searchAtMs=e.atMs;return}
 if((e.input==='keyboard'?e.key===null:e.key!==null)||!['done','none','outside',...p.items.map(i=>i.id)].includes(e.control))throw Error('Unknown search input binding')
 const activate=()=>{if(s.stage==='search'&&e.control==='done'){s.locateAtMs=e.atMs;s.searchInput=e.input;s.stage='locate';s.focused=null}
  else if(s.stage==='locate'&&(e.control==='none'||p.items.some(i=>i.id===e.control))){s.selection=e.control==='none'?{kind:'none'}:{kind:'item',id:e.control};s.selectionAtMs=e.atMs;s.locateInput=e.input;s.stage='complete'}else s.ignored.early++}
 if(e.kind==='focus'){if(s.stage==='locate'&&e.control!=='done'&&e.control!=='outside')s.focused=e.control;else s.ignored.early++;return}
 if(e.kind==='activate'){if(e.input!=='assistive')throw Error('Atomic search activation must identify assistive input');if(s.held)s.ignored.held++;else activate();return}
 if(e.kind==='down'){if(!e.primary){s.ignored.multiple++;return}if(e.repeat){s.ignored.repeat++;return}if(s.held){s.ignored.held++;return}s.held={token:e.token,control:e.control,input:e.input,key:e.key,stage:s.stage,downAtMs:e.atMs};return}
 const h=s.held;if(!h||h.token!==e.token)return;s.held=null
 if(h.stage!==s.stage){s.ignored.crossStage++;return}if(e.control!==h.control||e.input!==h.input||e.key!==h.key){s.ignored.outside++;return}activate()
}
export function moveSearchFocus(p:SearchPlan,current:string|null,key:string):string {if(current==='none')return key==='ArrowUp'?p.items[p.items.length-1].id:p.items[0].id;const item=p.items.find(i=>i.id===current);if(!item)return p.items[0].id
 const candidates=p.items.filter(i=>key==='ArrowLeft'?i.x<item.x-10:key==='ArrowRight'?i.x>item.x+10:key==='ArrowUp'?i.y<item.y-10:i.y>item.y+10).sort((a,b)=>Math.hypot(a.x-item.x,a.y-item.y)-Math.hypot(b.x-item.x,b.y-item.y));return candidates[0]?.id??(key==='ArrowDown'?'none':item.id)}
export interface SearchRaw {plan:SearchPlan;startedAtPerfMs:number;endedAtPerfMs:number;status:'complete'|'interrupted';stopReason:string|null;events:SearchEvent[];state:SearchState;ignoredRepeatCount:number;overflow:boolean}
