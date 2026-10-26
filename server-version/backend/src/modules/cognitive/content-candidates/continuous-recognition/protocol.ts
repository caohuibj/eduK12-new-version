import { createHash } from 'node:crypto'
import { z } from 'zod'

/** Isolated candidate contract, deliberately not a platform registry entry or publication tuple. */
export const IDENTITY = Object.freeze({ candidateId: 'continuous-recognition', status: 'DESIGN_PROPOSAL',
  candidateContractVersion: '0.1.0', generatorVersion: 'seeded-blocks-0.1.0',
  scoringVersion: 'paired-targets-0.1.0', responseRule: 'image-and-following-isi-half-open-0.1.0',
  qualityRule: 'research-review-required-0.1.0' } as const)
export type Profile = 'research' | 'experience'
export type Kind = 'target-first' | 'target-repeat' | 'filler-first' | 'vigilance-repeat'
const idSchema = z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/)
const requestSchema = z.object({ profile: z.enum(['research', 'experience']), seed: z.string().min(1).max(256),
  formalAssetIds: z.array(idSchema).min(1).max(4096), practiceAssetIds: z.array(idSchema).length(6) }).strict()
export interface Request { profile: Profile; seed: string; formalAssetIds: string[]; practiceAssetIds: string[] }
export interface Presentation { index: number; block: number; slot: number; assetId: string; kind: Kind;
  firstIndex: number | null; plannedOnsetMs: number; plannedImageOffsetMs: number; plannedWindowEndMs: number }
export interface Pair { assetId: string; firstIndex: number; repeatIndex: number; lagImages: number;
  interveningImages: number; blockLag: number }
export interface Manifest { formal: Presentation[]; practice: Array<{ index: number; assetId: string; seenBefore: boolean }>;
  targetPairs: Pair[]; vigilancePairs: Pair[]; readyPoolSizes: number[]; lagHistogram: Record<string, number>;
  counts: { targetFirst: number; targetRepeat: number; fillerFirst: number; vigilanceRepeat: number; total: number } }
export interface FrozenCandidate { identity: typeof IDENTITY; request: Request; parameters: ReturnType<typeof parameters>;
  manifest: Manifest; snapshotHash: string }
export function parameters(profile: Profile) {
  return { status: 'DESIGN_PROPOSAL' as const, targetNum: profile === 'research' ? 60 : 20,
    imageBlockSize: 4, firstRepeatDelayBlocks: 5, minRepeatDelayBlocks: 4, vigilanceIntervalBlocks: 4,
    fixedOrder: false, imageMs: 750, isiMs: 800, responseRule: IDENTITY.responseRule,
    qualityEvidence: 'PROJECT_PROVISIONAL_RESEARCH_RULE' as const }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b])=>a.localeCompare(b))
    .map(([key,item])=>JSON.stringify(key)+':'+canonical(item)).join(',') + '}'
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Noncanonical value')
  return JSON.stringify(value)
}
export function digest(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex') }
function random(seed: string): () => number {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0) || 0x9e3779b9
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296 }
}
function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i+1)); [items[i],items[j]]=[items[j],items[i]] }
  return items
}
function validateRequest(value: unknown): Request {
  const request = requestSchema.parse(value)
  const all = [...request.formalAssetIds,...request.practiceAssetIds]
  if (new Set(all).size !== all.length) throw new Error('Asset identities must be unique; formal/practice pools must be isolated')
  const t = parameters(request.profile).targetNum
  const total = (t+5)*4, vigilance = Math.floor((t+5)/4), fillers = total-2*t-vigilance
  if (request.formalAssetIds.length < t+fillers) throw new Error('Insufficient logical asset pool')
  return request
}
/** Reimplementation of reviewed block semantics. No images or third-party executable code are loaded. */
function generate(request: Request): Manifest {
  const p = parameters(request.profile), rng = random(IDENTITY.generatorVersion+':'+request.seed)
  const total = (p.targetNum+5)*4, v = Math.floor((p.targetNum+5)/4), f = total-2*p.targetNum-v
  const sampled = shuffle([...request.formalAssetIds],rng)
  const targets = sampled.slice(0,p.targetNum), fillers = sampled.slice(p.targetNum,p.targetNum+f)
  const formal: Presentation[] = [], ready: string[] = [], shown: string[] = [], readyPoolSizes: number[] = []
  let previousFillers: string[] = [], nextTarget=0, nextFiller=0
  const first = new Map<string,number>()
  for (let block=1; block<=p.targetNum+5; block++) {
    if (block>p.minRepeatDelayBlocks+1 && shown.length) ready.push(shown.shift()!)
    const entries: Array<{assetId:string;kind:Kind}> = []
    const filler = () => { const assetId = fillers[nextFiller++]; if (!assetId) throw new Error('Filler budget exhausted')
      previousFillers.push(assetId); entries.push({assetId,kind:'filler-first'}) }
    if (previousFillers.length && block%4===0) {
      shuffle(previousFillers,rng); entries.push({assetId:previousFillers[0],kind:'vigilance-repeat'}); previousFillers=[]
    } else { previousFillers=[]; filler() }
    if (block>5) { readyPoolSizes.push(ready.length); shuffle(ready,rng); const assetId=ready.pop()
      if (!assetId) throw new Error('Empty repeat candidate pool'); entries.push({assetId,kind:'target-repeat'})
    } else filler()
    if (nextTarget<targets.length) { const assetId=targets[nextTarget++]; shown.push(assetId); entries.push({assetId,kind:'target-first'}) }
    else filler()
    while(entries.length<4) filler()
    shuffle(entries,rng)
    for (const [slot,entry] of entries.entries()) {
      const index=formal.length, repeat=entry.kind==='target-repeat'||entry.kind==='vigilance-repeat'
      const firstIndex=repeat ? first.get(entry.assetId) : null
      if (repeat && firstIndex===undefined) throw new Error('Repeat precedes first presentation')
      formal.push({...entry,index,block,slot,firstIndex:firstIndex??null,plannedOnsetMs:index*1550,
        plannedImageOffsetMs:index*1550+750,plannedWindowEndMs:(index+1)*1550})
      if (!repeat) first.set(entry.assetId,index)
    }
  }
  const pairs = (kind:Kind): Pair[] => formal.filter(x=>x.kind===kind).map(x=>({assetId:x.assetId,
    firstIndex:x.firstIndex!,repeatIndex:x.index,lagImages:x.index-x.firstIndex!,
    interveningImages:x.index-x.firstIndex!-1,blockLag:x.block-formal[x.firstIndex!].block}))
  const targetPairs=pairs('target-repeat'), vigilancePairs=pairs('vigilance-repeat'), lagHistogram:Record<string,number>={}
  for (const pair of targetPairs) lagHistogram[pair.lagImages]=(lagHistogram[pair.lagImages]??0)+1
  const practiceOrder=[0,1,2,0,3,1,4,5]
  const practice=practiceOrder.map((asset,index)=>({index,assetId:request.practiceAssetIds[asset],seenBefore:practiceOrder.indexOf(asset)<index}))
  if (formal.length!==total || nextFiller!==f || readyPoolSizes.some(n=>n!==1)) throw new Error('Default block structure diverged')
  return {formal,practice,targetPairs,vigilancePairs,readyPoolSizes,lagHistogram,
    counts:{targetFirst:p.targetNum,targetRepeat:p.targetNum,fillerFirst:f,vigilanceRepeat:v,total}}
}
export function freezeCandidate(value: unknown): FrozenCandidate {
  const request=validateRequest(value)
  const body={identity:{...IDENTITY},request,parameters:parameters(request.profile),manifest:generate(request)}
  return {...body,snapshotHash:digest(body)}
}
/** Replay rejects unrecognized versions and mismatched hashes/sequence, never resolves the latest config. */
export function replayCandidate(value: unknown): FrozenCandidate {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Invalid candidate snapshot')
  const frozen=value as FrozenCandidate
  const rebuilt=freezeCandidate(frozen.request)
  if (canonical(frozen)!==canonical(rebuilt)) throw new Error('Incompatible or altered frozen candidate snapshot')
  return rebuilt
}
