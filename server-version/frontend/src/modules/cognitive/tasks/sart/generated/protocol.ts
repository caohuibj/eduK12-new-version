// Exact pure content projection. Backend SHA256: 62097f12f207a19b522ecb26d729081f89e04a72a3059e925ce54ab2139674de
export type SartProfile = 'research' | 'experience'
export type SartInput = 'touch' | 'mouse' | 'pen' | 'keyboard'
export const SART_IDENTITY = {testType:'sart',engineVersion:'0.1.0',scoringVersion:'0.1.0',configVersion:'0.1.0'} as const
export const SART_PROTOCOL = {schemaVersion:1 as const,key:'sart/0.1.0/0.1.0',version:'0.1.0',clock:'performance' as const,
  randomizationAlgorithmVersion:'sart-fnv1a-xorshift32-fisher-yates-v1',trialEnvelopeVersion:1 as const,
  phases:[{key:'test' as const,persists:true,required:true}],measurementCriticalConfigPaths:['*']}
export function sartConfig(profile:SartProfile){
  if(profile!=='research'&&profile!=='experience')throw Error('Unknown SART profile')
  return {profile,totalTrials:profile==='research'?225:90,repetitionsPerDigitSize:profile==='research'?5:2,
    digits:[1,2,3,4,5,6,7,8,9],noGoDigit:3,fontSizesPx:[32,48,63,67,80],fontFamily:'system-ui, sans-serif',
    digitMs:250,maskMs:900,fieldHeightPx:310,background:'#111111',foreground:'#FFFFFF',
    inputPolicy:'first-fresh-down-half-open-window-held-across-trials-v1',
    practice:{trials:9,digitMs:400,maskMs:1400,feedbackMs:600,minimumGoCorrect:7,requiredNoGoCorrect:1,maxRounds:3,repeatInstructionsBeforeRetry:true},
    profileDefinitionVersion:'0.1.0',parameterDefinitionVersion:'0.1.0',metricDefinitionVersion:'0.1.0',
    qualityDefinitionVersion:'0.1.0',reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0'}
}
export type SartConfig=ReturnType<typeof sartConfig>
export function same(a:unknown,b:unknown):boolean{
  if(a===b)return true
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false
  const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&same((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]))
}
export function assertSartConfig(v:unknown):asserts v is SartConfig{
  const profile=(v as SartConfig|null)?.profile
  if((profile!=='research'&&profile!=='experience')||!same(v,sartConfig(profile)))throw Error('Unsupported frozen SART config')
}
function random(seed:string){let s=2166136261;for(let i=0;i<seed.length;i++)s=Math.imul(s^seed.charCodeAt(i),16777619)>>>0;if(!s)s=0x9e3779b9
  return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296}}
export interface SartPlan {index:number;phase:'test'|'practice';round:number;digit:number;fontPx:number;digitMs:number;maskMs:number}
export function sartPlan(c:SartConfig,seed:string,phase:'test'|'practice'='test',round=0):SartPlan[]{
  assertSartConfig(c);if(!seed||seed.length>256||!['test','practice'].includes(phase)||!Number.isInteger(round)||round<0||round>2||(phase==='test'&&round!==0))throw Error('Invalid SART plan identity')
  const cells:{digit:number;fontPx:number}[]=[]
  if(phase==='test')for(const digit of c.digits)for(const fontPx of c.fontSizesPx)for(let i=0;i<c.repetitionsPerDigitSize;i++)cells.push({digit,fontPx})
  else for(const digit of c.digits)cells.push({digit,fontPx:48})
  const rng=random(`${SART_PROTOCOL.randomizationAlgorithmVersion}:${seed}:${phase}:${round}`)
  for(let i=cells.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[cells[i],cells[j]]=[cells[j],cells[i]]}
  return cells.map((cell,index)=>({...cell,index,phase,round,digitMs:phase==='test'?c.digitMs:c.practice.digitMs,maskMs:phase==='test'?c.maskMs:c.practice.maskMs}))
}
export type SartEvent = {kind:'mask';atMs:number}|{kind:'down'|'up';atMs:number;token:string;input:SartInput;repeat:boolean}
export interface SartRaw {plan:SartPlan;onsetMs:number;endedAtMs:number;status:'complete'|'interrupted';stopReason:string|null;
  heldBefore:string[];events:SartEvent[];ignoredRepeats:number;overflow:boolean}
export const sartDeadline=(p:SartPlan)=>p.digitMs+p.maskMs
export const SART_LIMITS={eventsPerTrial:128,heldTokens:16} as const
