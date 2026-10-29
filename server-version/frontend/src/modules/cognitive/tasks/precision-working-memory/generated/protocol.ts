// Exact pure content projection. Backend SHA256: c492bbcf4b7f0d3a609ede6cee034ef17d18ba08352005d144d2e847fd6ba464
/** Independent browser variant of colour-cued spatial delayed estimation. No third-party runtime. */
export const SPATIAL_IDENTITY={testType:'precision-working-memory',engineVersion:'0.1.0',scoringVersion:'0.1.0',configVersion:'0.1.0'} as const
export const SPATIAL_PROTOCOL={schemaVersion:1 as const,key:'precision-working-memory/0.1.0/0.1.0',version:'0.1.0',clock:'performance' as const,
  randomizationAlgorithmVersion:'spatial-fnv1a-utf16-xorshift32-balanced-v1',trialEnvelopeVersion:1 as const,
  phases:[{key:'test' as const,persists:true,required:true}],measurementCriticalConfigPaths:['*']}
export const PALETTE={black:'#000000',yellow:'#F0E442',cyan:'#00AAFF',green:'#00FF00',red:'#E53935'} as const
export const COLOURS=Object.keys(PALETTE) as Colour[]
export type Colour=keyof typeof PALETTE
export type Profile='research'|'experience'
export type Input='touch'|'mouse'|'pen'|'keyboard'
export function spatialConfig(profile:Profile){
  if(!['research','experience'].includes(profile))throw Error('Unknown spatial profile')
  return {profile,totalTrials:profile==='research'?400:40,blockTrials:40,setSizes:[1,5],palette:{...PALETTE},
    geometry:{field:300,radius:110,barLength:32,barWidth:6,hitMinRadius:90,hitMaxRadius:130,minSeparationDeg:18,background:'#666666'},
    encodingMs:500,retentionMs:1000,itiMinMs:950,itiMaxMs:1049,warningMs:3000,responseDeadlineMs:null,
    inputPolicy:'ring-select-release-explicit-confirm-v1',practice:{version:'spatial-easier-six-v1',trials:6,minimumCorrect:5,maxRounds:3,
      setSizes:[1,1,1,3,3,3],encodingMs:1000,retentionMs:500,toleranceDeg:30,feedback:'per_trial',repeatInstructionsBeforeRetry:true},
    profileDefinitionVersion:'0.1.0',metricDefinitionVersion:'0.1.0',qualityDefinitionVersion:'0.1.0',reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0'}
}
export type SpatialConfig=ReturnType<typeof spatialConfig>
export function same(a:unknown,b:unknown):boolean {
  if(a===b)return true
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false
  const x=Object.keys(a),y=Object.keys(b)
  return x.length===y.length&&x.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&same((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]))
}
export function assertSpatialConfig(value:unknown):asserts value is SpatialConfig {
  const profile=(value as SpatialConfig|null)?.profile
  if((profile!=='research'&&profile!=='experience')||!same(value,spatialConfig(profile)))throw Error('Unsupported frozen spatial config')
}
export function signedError(response:number,target:number){return ((response-target+180)%360+360)%360-180}
export function normalizeAngle(angle:number){return ((angle%360)+360)%360}
export function position(angle:number){return {x:150+110*Math.cos(angle*Math.PI/180),y:150+110*Math.sin(angle*Math.PI/180)}}
export interface SpatialItem {colour:Colour;positionIndex:number;angleDeg:number}
export interface SpatialPlan {index:number;phase:'practice'|'test';round:number;setSize:number;targetColour:Colour;items:SpatialItem[];itiMs:number;keyboardStartAngle:number}
function rng(seed:string){let state=2166136261;for(let i=0;i<seed.length;i++)state=Math.imul(state^seed.charCodeAt(i),16777619)>>>0
  if(!state)state=0x9e3779b9
  return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296}}
function shuffle<T>(items:readonly T[],random:()=>number){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
/** Complete seeded manifest. Target colour is balanced independently from target position; short profiles cover the circle. */
export function spatialPlan(config:SpatialConfig,seed:string,phase:'practice'|'test'='test',round=0):SpatialPlan[]{
  assertSpatialConfig(config)
  if(!seed||seed.length>256||!Number.isInteger(round)||round<0||round>2||(phase==='test'&&round!==0))throw Error('Invalid spatial plan identity')
  const random=rng(SPATIAL_PROTOCOL.randomizationAlgorithmVersion+':'+seed+':'+phase+':'+round),grid=Array.from({length:100},(_,i)=>i)
  const build=(index:number,setSize:number,targetColour:Colour,target:number):SpatialPlan=>{
    const chosen=[target],others=shuffle(COLOURS.filter(c=>c!==targetColour),random)
    while(chosen.length<setSize){const available=grid.filter(i=>chosen.every(j=>Math.min(Math.abs(i-j),100-Math.abs(i-j))>=5));chosen.push(available[Math.floor(random()*available.length)])}
    const items=shuffle(chosen.map((positionIndex,i)=>({colour:i===0?targetColour:others[i-1],positionIndex,angleDeg:1+positionIndex*3.6})),random)
    return {index,phase,round,setSize,targetColour,items,itiMs:950+Math.floor(random()*100),keyboardStartAngle:random()*360}
  }
  if(phase==='practice')return config.practice.setSizes.map((size,index)=>build(index,size,COLOURS[index%5],Math.floor(random()*100)))
  const positions=(count:number)=>count===200?[...shuffle(grid,random),...shuffle(grid,random)]:shuffle(Array.from({length:20},(_,i)=>i*5+Math.floor(random()*5)),random)
  const a=positions(config.totalTrials/2),b=positions(config.totalTrials/2),result:SpatialPlan[]=[]
  // A full 40-trial block has 20 per load and four target probes of each colour per load.
  const blockCount=config.totalTrials/40
  for(let block=0;block<blockCount;block++){
    const batch:SpatialPlan[]=[]
    for(const size of [1,5]){
      const colours=shuffle(Array.from({length:20},(_,i)=>COLOURS[i%5]),random),targets=size===1?a:b
      for(let j=0;j<20;j++)batch.push(build(0,size,colours[j],targets[block*20+j]))
    }
    for(const item of shuffle(batch,random))result.push({...item,index:result.length})
  }
  return result
}
export interface SpatialResponse {angleDeg:number;x:number;y:number;rawX:number|null;rawY:number|null;input:Input;firstSelectedAtMs:number;lastAdjustedAtMs:number;confirmedAtMs:number}
export interface SpatialEvent {kind:'select'|'release'|'keyboard'|'confirm';atMs:number;angleDeg:number;input:Input}
export interface SpatialRaw {plan:SpatialPlan;status:'complete'|'interrupted';stopReason:string|null;
  startedAtPerfMs:number;encodingOnsetMs:number|null;retentionOnsetMs:number|null;responseOnsetMs:number|null;endedAtPerfMs:number;
  warningAtMs:number|null;signedErrorDeg:number|null;response:SpatialResponse|null;events:SpatialEvent[];eventOverflow:boolean}
export function targetAngle(plan:SpatialPlan){const item=plan.items.find(i=>i.colour===plan.targetColour);if(!item)throw Error('Missing target colour');return item.angleDeg}
