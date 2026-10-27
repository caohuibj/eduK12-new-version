import {BANK_HASH,BANK_VERSION,FAMILIES,ITEMS,freeze,type Family} from './items'
export {BANK_HASH,BANK_VERSION,FAMILIES,ITEMS,freeze,type Family} from './items'
export type Profile = 'research' | 'experience'
export type InputMode = 'touch' | 'mouse' | 'pen' | 'keyboard' | 'assistive'
export const NUMBER_SERIES_IDENTITY = freeze({testType:'number-series',engineVersion:'0.1.0',scoringVersion:'0.1.0',configVersion:'0.1.0'} as const)
export const NUMBER_SERIES_PROTOCOL = {
  schemaVersion:1 as const,key:'number-series/0.1.0/0.1.0',version:'0.1.0',clock:'performance' as const,
  randomizationAlgorithmVersion:'number-series-fnv1a-utf16-xorshift32-fisher-yates-v1',trialEnvelopeVersion:1 as const,
  phases:[{key:'test' as const,persists:true,required:true}],measurementCriticalConfigPaths:['*'],
}
freeze(NUMBER_SERIES_PROTOCOL)
export interface NumberSeriesConfig extends Record<string,unknown> {
  profile:Profile; totalItems:12|24; itemsPerCondition:4|8; itemsPerBlock:6
  bankVersion:typeof BANK_VERSION; bankHash:typeof BANK_HASH
  parameterInterpretationVersion:'0.1.0'; reportDefinitionVersion:'0.1.0'; presentationVersion:'0.1.0'
  profileDefinitionVersion:'0.1.0'; randomizationAlgorithmVersion:typeof NUMBER_SERIES_PROTOCOL.randomizationAlgorithmVersion
  responseRule:'first-valid-choice-or-explicit-skip'; itemDeadlineMs:null; maxAnswer:200
  practice:{items:3;passCorrect:3;maximumRounds:3;feedback:'explain-each';reRead:'full-instructions-and-three-examples'}
}
export function numberSeriesConfig(profile:Profile):NumberSeriesConfig {
  if(profile!=='research'&&profile!=='experience')throw Error('Unsupported number-series profile')
  return freeze({profile,totalItems:profile==='research'?24:12,itemsPerCondition:profile==='research'?8:4,itemsPerBlock:6,
    bankVersion:BANK_VERSION,bankHash:BANK_HASH,parameterInterpretationVersion:'0.1.0',reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0',profileDefinitionVersion:'0.1.0',
    randomizationAlgorithmVersion:NUMBER_SERIES_PROTOCOL.randomizationAlgorithmVersion,responseRule:'first-valid-choice-or-explicit-skip',itemDeadlineMs:null,maxAnswer:200,
    practice:{items:3,passCorrect:3,maximumRounds:3,feedback:'explain-each',reRead:'full-instructions-and-three-examples'}})
}
export function canonicalValue(v:unknown):unknown {
  if(Array.isArray(v))return v.map(canonicalValue)
  if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonicalValue((v as Record<string,unknown>)[k])]))
  return v
}
export const same=(a:unknown,b:unknown)=>JSON.stringify(canonicalValue(a))===JSON.stringify(canonicalValue(b))
export function assertNumberSeriesConfig(v:unknown):asserts v is NumberSeriesConfig {
  if(!v||typeof v!=='object'||!same(v,numberSeriesConfig((v as NumberSeriesConfig).profile)))throw Error('Unknown frozen number-series configuration')
}
export interface NumberSeriesPlan {
  index:number; phase:'practice'|'test'; round:number; blockIndex:number; itemId:string; family:Family
  known:readonly number[]; options:readonly number[]; correctIndex:number; answer:number
}
function random(seed:string) {
  let h=2166136261
  for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619)}
  let state=h>>>0||0x9e3779b9
  return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296}
}
function shuffle<T>(input:readonly T[],rng:()=>number):T[] {
  const a=[...input]
  for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a
}
const PRACTICE = freeze([
  {id:'practice-addition',family:'addition' as const,known:[1,2,3,4],answer:5,distractors:[4,6,7]},
  {id:'practice-multiplication',family:'multiplication' as const,known:[1,2,4,8],answer:16,distractors:[8,10,18]},
  {id:'practice-growing-gap',family:'growing-gap' as const,known:[1,2,4,7],answer:11,distractors:[10,7,12]},
])
export function numberSeriesPlan(c:NumberSeriesConfig,seed:string,phase:'practice'|'test'='test',round=0):NumberSeriesPlan[] {
  assertNumberSeriesConfig(c)
  if(typeof seed!=='string'||!seed.length||seed.length>256||!['practice','test'].includes(phase)||!Number.isInteger(round)||round<0||round>2||(phase==='test'&&round!==0))throw Error('Invalid seed/phase/round')
  const rng=random(`${c.randomizationAlgorithmVersion}|${c.profile}|${seed}|${phase}|${round}`)
  if(phase==='practice')return freeze(PRACTICE.map((item,index)=>{
    const correctIndex=Math.floor(rng()*4),options=shuffle(item.distractors,rng);options.splice(correctIndex,0,item.answer)
    return {index,phase,round,blockIndex:0,itemId:item.id,family:item.family,known:[...item.known],options,correctIndex,answer:item.answer}
  }))
  const byFamily=FAMILIES.map(family=>{
    const items=shuffle(ITEMS.filter(item=>item.family===family&&(c.profile==='research'||item.short)),rng)
    const positions=shuffle(Array.from({length:c.itemsPerCondition},(_,i)=>i%4),rng)
    return items.map((item,i)=>{const options=shuffle(item.distractors.map(d=>d.value),rng);options.splice(positions[i],0,item.answer)
      return {index:0,phase,round:0,blockIndex:0,itemId:item.id,family,known:[...item.known],options,correctIndex:positions[i],answer:item.answer}})
  })
  const result:NumberSeriesPlan[]=[]
  for(let block=0;block<c.totalItems/6;block++){
    const cells=shuffle(byFamily.flatMap(items=>items.slice(block*2,block*2+2)),rng)
    for(const p of cells)result.push({...p,index:result.length,blockIndex:block})
  }
  return freeze(result)
}
export type NumberSeriesEvent =
  | {kind:'answer';atMs:number;choice:number;input:InputMode;key:string|null}
  | {kind:'skip';atMs:number;input:InputMode}
  | {kind:'interrupt';atMs:number;reason:string}
export interface NumberSeriesRaw {
  plan:NumberSeriesPlan; startedAtPerfMs:number; endedAtPerfMs:number
  status:'answered'|'skipped'|'interrupted'; response:number|null; rtMs:number|null
  input:InputMode|null; stopReason:string|null; events:NumberSeriesEvent[]; ignoredRepeatCount:number
}
export function keyChoice(key:string):number|null {
  const match=/^(?:Digit|Numpad)([1-4])$/.exec(key)??/^focus:([1-4]):(?:Enter|Space)$/.exec(key)
  return match?Number(match[1])-1:null
}
/** Replay the first terminal event; final fields cannot replace or invent a first response. */
export function reviewNumberSeriesRaw(raw:NumberSeriesRaw,expected:NumberSeriesPlan) {
  if(!same(raw.plan,expected)||raw.events.length!==1)throw Error('Number-series frozen item/first event mismatch')
  const e=raw.events[0]
  if(e.atMs<raw.startedAtPerfMs||e.atMs!==raw.endedAtPerfMs)throw Error('Number-series clock ownership mismatch')
  if(e.kind==='answer') {
    if(!Number.isInteger(e.choice)||e.choice<0||e.choice>3||(e.input==='keyboard'?e.key===null||keyChoice(e.key)!==e.choice:e.key!==null))throw Error('Number-series response mapping mismatch')
    if(raw.status!=='answered'||raw.response!==e.choice||raw.input!==e.input||raw.stopReason!==null||raw.rtMs!==e.atMs-raw.startedAtPerfMs)throw Error('Number-series first response differs')
    return {opportunity:true,correct:e.choice===expected.correctIndex,skipped:false,rtMs:raw.rtMs}
  }
  if(raw.response!==null||raw.rtMs!==null)throw Error('Missing answer/time must stay null')
  if(e.kind==='skip') {
    if(raw.status!=='skipped'||raw.input!==e.input||raw.stopReason!==null)throw Error('Explicit skip differs')
    return {opportunity:true,correct:false,skipped:true,rtMs:null}
  }
  if(raw.status!=='interrupted'||raw.input!==null||raw.stopReason!==e.reason)throw Error('Interrupted record differs')
  return {opportunity:false,correct:false,skipped:false,rtMs:null}
}
