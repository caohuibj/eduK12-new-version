// Exact pure content projection. Backend SHA256: 26ae990d8676825f61b8a00c634dc618e9f4b112017dbfcb1172ad4150d81f44
export type PvtProfile = 'research' | 'experience'
export type PvtLanguage = 'zh' | 'en'
export type PvtInput = 'touch' | 'mouse' | 'pen' | 'keyboard'
export const PVT_IDENTITY = {testType:'pvt',engineVersion:'0.1.0',scoringVersion:'0.1.0',configVersion:'0.1.0'} as const
export const PVT_PROTOCOL = {schemaVersion:1 as const,key:'pvt/0.1.0/0.1.0',version:'0.1.0',clock:'performance' as const,randomizationAlgorithmVersion:'pvt-fnv1a-xorshift32-rejection-integer-v1',trialEnvelopeVersion:1 as const,phases:[{key:'test' as const,persists:true,required:true}],measurementCriticalConfigPaths:['*']}
export function pvtConfig(profile:PvtProfile){
  if(profile!=='research'&&profile!=='experience')throw Error('Unknown PVT profile')
  return {profile,durationMs:profile==='research'?600000:180000,waitMinimumMs:2000,waitMaximumMs:10000,feedbackMs:1000,responseWindowMs:30000,
    circleDiameterPx:88,fieldHeightPx:270,background:'#15232e',foreground:'#FFFFFF',fontFamily:'system-ui, sans-serif',
    inputPolicy:'first-fresh-down-half-open-no-rt-classification-v1',endPolicy:'fixed-duration-with-explicit-censor-v1',
    practice:{trials:3,waitMs:[3000,5000,3000],feedbackMs:2000,maxRounds:2,repeatInstructionsBeforeRetry:true},
    profileDefinitionVersion:'0.1.0',parameterDefinitionVersion:'0.1.0',metricDefinitionVersion:'0.1.0',qualityDefinitionVersion:'0.1.0',reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0'}
}
export type PvtConfig = ReturnType<typeof pvtConfig>
export function same(a:unknown,b:unknown):boolean{
  if(a===b)return true
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false
  const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&same((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]))
}
export function canonical(v:unknown):string{
  const sort=(x:unknown):unknown=>Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort((x as Record<string,unknown>)[k])])):x
  return JSON.stringify(sort(v))
}
export function assertPvtConfig(value:unknown):asserts value is PvtConfig{
  const profile=(value as PvtConfig|null)?.profile
  if((profile!=='research'&&profile!=='experience')||!same(value,pvtConfig(profile)))throw Error('Unsupported frozen PVT config')
}
export interface PvtPlan {phase:'practice'|'test';round:number;index:number;waitMs:number;feedbackMs:number}
export const pvtCycleBudget=(c:PvtConfig)=>Math.ceil(c.durationMs/c.feedbackMs)+2
function random(seed:string){let s=2166136261;for(let i=0;i<seed.length;i++)s=Math.imul(s^seed.charCodeAt(i),16777619)>>>0;if(!s)s=0x9e3779b9
  return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return s>>>0}}
export function pvtManifest(c:PvtConfig,seed:string){
  assertPvtConfig(c);if(!seed||seed.length>256)throw Error('Invalid PVT seed')
  const rng=random(`${PVT_PROTOCOL.randomizationAlgorithmVersion}:${seed}`),range=c.waitMaximumMs-c.waitMinimumMs+1,ceiling=Math.floor(4294967296/range)*range
  const integer=()=>{let n=rng();while(n>=ceiling)n=rng();return c.waitMinimumMs+n%range}
  // This is a safety reservoir, never a promised target count. Only exposed cycles are recorded/scored.
  return {formal:Array.from({length:pvtCycleBudget(c)},(_,index):PvtPlan=>({phase:'test',round:0,index,waitMs:integer(),feedbackMs:index?c.feedbackMs:0})),practice:Array.from({length:c.practice.maxRounds},(_,round)=>c.practice.waitMs.map((waitMs,index):PvtPlan=>({phase:'practice',round,index,waitMs,feedbackMs:index?c.practice.feedbackMs:0})))}
}
export type PvtEvent = {kind:'target';atMs:number}|{kind:'down'|'up';atMs:number;token:string;input:PvtInput;repeat:boolean}
export type PvtOutcome = 'responded'|'early'|'timeout'|'budget-end'|'interrupted'
export interface PvtRaw {plan:PvtPlan;phaseStartedAtMs:number;waitStartedAtMs:number;endedAtMs:number;outcome:PvtOutcome;stopReason:string|null;heldBefore:string[];events:PvtEvent[];ignoredRepeats:number;overflow:boolean}
export const PVT_LIMITS={eventsPerCycle:128,heldTokens:16} as const
export interface PvtSnapshot {schemaVersion:1;testType:string;engineVersion:string;scoringVersion:string;configVersion:string;config:PvtConfig;protocol:typeof PVT_PROTOCOL;configHash:string;protocolSignature:string;frozenAt:string}
export interface PvtContext {contextKey:string;language:PvtLanguage;snapshot:PvtSnapshot;randomSeed:string;manifestHash:string}
export interface PvtRealm {timeOriginMs:number;pageInstanceId:string}
export interface PvtDraft {contextKey:string;raw:PvtRaw;configHash:string;protocolSignature:string;manifestHash:string;realm:PvtRealm;recordKey:string;recordDigest:string}
export interface PvtFinal {contextKey:string;configHash:string;protocolSignature:string;manifestHash:string;formalCount:number;practiceCount:number;termination:'completed'|'aborted';terminationReason:string|null;recordDigests:string[];finalPayloadDigest:string}
export function validatePvtContext(value:PvtContext,digest:(v:unknown)=>string):PvtContext{
  const c=structuredClone(value),s=c.snapshot
  if((c.language!=='zh'&&c.language!=='en')||!c.contextKey||c.contextKey.length>512||!c.randomSeed||c.randomSeed.length>256||s.schemaVersion!==1||!Number.isFinite(Date.parse(s.frozenAt))||s.testType!==PVT_IDENTITY.testType||s.engineVersion!==PVT_IDENTITY.engineVersion||s.scoringVersion!==PVT_IDENTITY.scoringVersion||s.configVersion!==PVT_IDENTITY.configVersion||!same(s.protocol,PVT_PROTOCOL))throw Error('Unknown frozen PVT identity/language')
  assertPvtConfig(s.config)
  if(digest(s.config)!==s.configHash||digest(s.protocol)!==s.protocolSignature||digest(pvtManifest(s.config,c.randomSeed))!==c.manifestHash)throw Error('Frozen PVT hash mismatch')
  return c
}
