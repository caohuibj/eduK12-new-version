/** Method: Hodel et al. 2014, DOI 10.3389/fpsyg.2014.00153 (CC BY).
 * Original implementation; no jsPsych or third-party artwork copied. */
export type Profile='research'|'experience'
export type Language='zh'|'en'
export type Location=0|1|2|3
export type Condition='R'|'S'|'tail'
export function freeze<T>(value:T):T{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
export const IDENTITY=freeze({testType:'serial-reaction-learning',engineVersion:'0.1.0',scoringVersion:'0.1.0',configVersion:'0.1.0'} as const)
export const PROTOCOL=freeze({schemaVersion:1 as const,key:'serial-reaction-learning/0.1.0/0.1.0',version:'0.1.0',clock:'performance' as const,randomizationAlgorithmVersion:'srl-fnv1a-xorshift32-weighted-backtrack-v1',trialEnvelopeVersion:1 as const,phases:[{key:'test' as const,persists:true,required:true}],measurementCriticalConfigPaths:['*']})
/** Published spatial sequences, zero-based UL/UR/LL/LR. Method attribution above. */
export const SEQUENCES=freeze([[2,0,3,1,0,2,3,0,1,3],[0,2,1,3,2,0,1,2,3,1]] as const)
export const SOURCE_VERSION='hodel-2014-published-spatial-sequences-and-project-R30-v1'
export interface Config extends Record<string,unknown>{profile:Profile;runs:2|5;trialsPerRun:84;totalTrials:168|420;rsiMs:500;input:'touch';deadlineMs:null;sourceVersion:typeof SOURCE_VERSION;profileDefinitionVersion:'0.1.0';parameterInterpretationVersion:'0.1.0';reportDefinitionVersion:'0.1.0';presentationVersion:'0.1.0';randomizationAlgorithmVersion:typeof PROTOCOL.randomizationAlgorithmVersion;practice:{items:4;passCorrect:4;maximumRounds:3};minimumConditionFirstAccuracy:0.8;maxResponsesPerTrial:2048}
export function configFor(profile:Profile):Config{if(profile!=='research'&&profile!=='experience')throw Error('Unknown SRL profile');return freeze({profile,runs:profile==='research'?5:2,trialsPerRun:84,totalTrials:profile==='research'?420:168,rsiMs:500,input:'touch',deadlineMs:null,sourceVersion:SOURCE_VERSION,profileDefinitionVersion:'0.1.0',parameterInterpretationVersion:'0.1.0',reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0',randomizationAlgorithmVersion:PROTOCOL.randomizationAlgorithmVersion,practice:{items:4,passCorrect:4,maximumRounds:3},minimumConditionFirstAccuracy:0.8,maxResponsesPerTrial:2048})}
export function canonical(v:unknown):unknown{if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical((v as Record<string,unknown>)[k])]));return v}
export const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b))
export function assertConfig(value:unknown):asserts value is Config{if(!value||typeof value!=='object'||!same(value,configFor((value as Config).profile)))throw Error('Unknown frozen SRL parameters')}
export interface Plan{index:number;phase:'practice'|'test';round:number;run:number;position:number;sequenceVariant:0|1;source:'R'|'S';condition:Condition;target:Location}
function rngFor(seed:string){let h=2166136261;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619)}let n=h>>>0||0x9e3779b9;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296}}
function shuffled<T>(a:readonly T[],rng:()=>number){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
/** Randomized constrained construction, not uniform sampling of all valid schedules.
 * R30 aggregate follows full S location frequencies; four tail targets are separate.
 * No immediate repeats, including source boundaries and run boundaries. */
export function planFor(c:Config,seed:string,phase:'practice'|'test'='test',round=0):Plan[]{
  assertConfig(c);if(typeof seed!=='string'||!seed.length||seed.length>256||!['practice','test'].includes(phase)||!Number.isInteger(round)||round<0||round>2||(phase==='test'&&round!==0))throw Error('Bad SRL seed/phase/round')
  const variant=(rngFor(`${PROTOCOL.randomizationAlgorithmVersion}|${seed}|variant`)()<.5?0:1) as 0|1
  if(phase==='practice')return freeze(shuffled([0,1,2,3] as Location[],rngFor(`${PROTOCOL.randomizationAlgorithmVersion}|${seed}|practice|${round}`)).map((target,index)=>({index,phase,round,run:0,position:index,sequenceVariant:variant,source:'R' as const,condition:'R' as const,target})))
  const rng=rngFor(`${PROTOCOL.randomizationAlgorithmVersion}|${seed}|formal`),sequence=SEQUENCES[variant],plans:Plan[]=[]
  let previous:Location|null=null
  for(let run=0;run<c.runs;run++){
    const remaining=[0,0,0,0];sequence.forEach(x=>remaining[x]+=3)
    const targets:Location[]=[];let nodes=0
    const fill=(position:number,last:Location|null):boolean=>{
      if(++nodes>100_000)throw Error('SRL constrained construction budget exhausted; no fallback schedule')
      if(position===80)return true
      const offset=position%16
      if(offset>=6){const target=sequence[offset-6] as Location;if(target===last)return false;targets.push(target);if(fill(position+1,target))return true;targets.pop();return false}
      const candidates=([0,1,2,3] as Location[]).filter(x=>remaining[x]>0&&x!==last&&(offset!==5||x!==sequence[0])).map(x=>({x,rank:Math.pow(rng(),1/remaining[x])})).sort((a,b)=>b.rank-a.rank)
      for(const {x} of candidates){remaining[x]--;targets.push(x);if(fill(position+1,x))return true;targets.pop();remaining[x]++}
      return false
    }
    if(!fill(0,previous)||remaining.some(Boolean))throw Error('SRL R30 constraints not satisfied')
    const tails=shuffled([0,1,2,3] as Location[],rng)
    if(tails[0]===targets[79])[tails[0],tails[1]]=[tails[1],tails[0]]
    targets.push(...tails)
    targets.forEach((target,position)=>{const offset=position%16,source=position<80&&offset>=6?'S':'R',condition:Condition=position>=80?'tail':source==='S'&&offset>=8?'S':'R';plans.push({index:plans.length,phase,round:0,run,position,sequenceVariant:variant,source,condition,target})})
    previous=targets[83]
  }
  return freeze(plans)
}
export type Event={kind:'tap';atMs:number;location:Location;input:'touch'}|{kind:'interrupt';atMs:number;reason:string}
export interface Raw{plan:Plan;startedAtPerfMs:number;endedAtPerfMs:number;status:'completed'|'interrupted';firstLocation:Location|null;firstRtMs:number|null;firstCorrect:boolean|null;correctAtMs:number|null;events:Event[];ignoredInputCount:number}
const finite=(x:number)=>Number.isFinite(x)&&x>=0
export function reviewRaw(raw:Raw,expected:Plan){
  if(!same(raw.plan,expected)||!finite(raw.startedAtPerfMs)||!finite(raw.endedAtPerfMs)||!Number.isSafeInteger(raw.ignoredInputCount)||raw.ignoredInputCount<0||!Array.isArray(raw.events)||!raw.events.length||raw.events.length>2049)throw Error('SRL frozen plan or record differs')
  let at=raw.startedAtPerfMs,first:Extract<Event,{kind:'tap'}>|null=null,correctAt:number|null=null,interrupted=false
  for(const [i,e] of raw.events.entries()){
    if(!finite(e.atMs)||e.atMs<at||correctAt!==null||interrupted)throw Error('SRL event order/clock differs')
    at=e.atMs
    if(e.kind==='tap'){if(i>=2048)throw Error('SRL response record limit exceeded');if(!Number.isInteger(e.location)||e.location<0||e.location>3||e.input!=='touch')throw Error('SRL touch location differs');if(!first)first=e;if(e.location===expected.target)correctAt=e.atMs}
    else if(e.kind==='interrupt'){if(!e.reason||e.reason.length>96||i!==raw.events.length-1)throw Error('SRL interruption differs');interrupted=true}
    else throw Error('Unknown SRL event')
  }
  if(raw.endedAtPerfMs!==at||(!interrupted&&correctAt===null)||raw.status!==(interrupted?'interrupted':'completed')||raw.firstLocation!==(first?.location??null)||raw.firstRtMs!==(first?first.atMs-raw.startedAtPerfMs:null)||raw.firstCorrect!==(first?first.location===expected.target:null)||raw.correctAtMs!==correctAt)throw Error('SRL first response/correction was rewritten')
  return {answered:first!==null,firstCorrect:raw.firstCorrect,firstRtMs:raw.firstRtMs,completed:correctAt!==null,interrupted,corrections:raw.events.filter(e=>e.kind==='tap').length-(first?1:0)}
}
