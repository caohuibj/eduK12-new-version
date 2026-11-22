import {Prisma} from '@prisma/client'
import {BoundedArtifactCache} from '../assessment-runtime/bounded-artifact-cache'
import {canonicalHash,retainImmutableCanonicalValue} from '../assessment-runtime/canonical'
import type {TrainingContentSnapshot} from '../composite/training-content-binding'
import type {StoredRelease} from '../measurement-content/repository'
import {educationCompositionKey,educationCompositionRuntimeAnchorSchema,type EducationCompositionRuntimeAnchor} from './private-tool.composition-contracts'
import {privateToolFail} from './private-tool.contracts'

type Unit=TrainingContentSnapshot['units'][number]
type Facts={anchor:EducationCompositionRuntimeAnchor;units:Map<string,Unit>}
type CachedFacts=Facts&{anchorHash:string}
type HeaderRow={creationKey:string;creationHash:string;manifestHash:string;origin?:unknown;units?:Unit[]}
// Immutable, DB-contained content facts only. Process-level reuse still verifies
// the live PUBLISHED seal header in DB on every transaction; no grant, role,
// emergency state or account decision is cached.
const facts=new WeakMap<object,Map<string,Facts>>()
const sealedCompositionCache=new BoundedArtifactCache<CachedFacts>(128,2*1024*1024)
export const resetSealedCompositionContentCacheForTests=()=>{sealedCompositionCache.clear()}
export const sealedCompositionContentCacheStats=()=>sealedCompositionCache.stats()

const deepFreeze=<T>(value:T):T=>{
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const child of Object.values(value))deepFreeze(child)
  Object.freeze(value)
 }
 return value
}
const storeTxFacts=(tx:Prisma.TransactionClient,compositeId:string,result:Facts)=>{
 if(!('$transaction'in tx)){
  let byParent=facts.get(tx);if(!byParent){byParent=new Map();facts.set(tx,byParent)}
  byParent.set(compositeId,result)
 }
}
export async function readSealedCompositionContent(tx:Prisma.TransactionClient,input:{compositeId:string;ownerId:string;anchor?:EducationCompositionRuntimeAnchor}){
 const prior=!('$transaction'in tx)?facts.get(tx)?.get(input.compositeId):undefined
 if(prior){
  if(prior.anchor.origin.ownerUserId!==input.ownerId||input.anchor&&canonicalHash(input.anchor)!==canonicalHash(prior.anchor))privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
  return prior
 }
 const [header]=await tx.$queryRaw<HeaderRow[]>(Prisma.sql`
  SELECT creation_key AS "creationKey",creation_hash AS "creationHash",training_content_snapshot_hash AS "manifestHash"
  FROM composite_assessments WHERE id=${input.compositeId} AND created_by=${input.ownerId} AND status='PUBLISHED'
   AND product_kind='ORGANIZATION_RESOURCE' AND NOT public_enabled AND NOT copyable`)
 if(!header)privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
 const hasInlinePayload=header.origin!==undefined||header.units!==undefined
 const cacheKey=`${input.compositeId}:${input.ownerId}:${header.creationKey}:${header.creationHash}:${header.manifestHash}`
 if(!hasInlinePayload){
  const cached=sealedCompositionCache.get(cacheKey)
  if(cached){
   if(cached.anchor.origin.ownerUserId!==input.ownerId||input.anchor&&canonicalHash(input.anchor)!==cached.anchorHash)
    privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
   const result:Facts={anchor:cached.anchor,units:cached.units}
   storeTxFacts(tx,input.compositeId,result)
   return result
  }
 }
 const row=hasInlinePayload?header:(await tx.$queryRaw<HeaderRow[]>(Prisma.sql`
  SELECT creation_key AS "creationKey",creation_hash AS "creationHash",training_content_snapshot_hash AS "manifestHash",
   training_content_snapshot#>'{educationBinding,origin}' AS origin,training_content_snapshot->'units' AS units
  FROM composite_assessments WHERE id=${input.compositeId} AND created_by=${input.ownerId} AND status='PUBLISHED'
   AND product_kind='ORGANIZATION_RESOURCE' AND NOT public_enabled AND NOT copyable`))[0]
 if(!row)privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
 const anchor=educationCompositionRuntimeAnchorSchema.parse({origin:row.origin,manifestHash:row.manifestHash})
 const anchorHash=canonicalHash(anchor)
 if(anchor.origin.ownerUserId!==input.ownerId||educationCompositionKey(anchor.origin)!==row.creationKey||canonicalHash(anchor.origin)!==row.creationHash
  ||input.anchor&&canonicalHash(input.anchor)!==anchorHash||!Array.isArray(row.units)||row.units.length>50)
  privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
 const units=new Map(row.units.map(unit=>[unit.itemId,unit]))
 if(!hasInlinePayload){
  deepFreeze(anchor)
  retainImmutableCanonicalValue(anchor)
  retainImmutableCanonicalValue(anchor.origin)
  for(const unit of units.values()){deepFreeze(unit);retainImmutableCanonicalValue(unit)}
  const charge=Math.max(1024,Buffer.byteLength(JSON.stringify({anchor,units:row.units}),'utf8')*2)
  sealedCompositionCache.set(cacheKey,{anchor,anchorHash,units},charge)
 }
 const result:Facts={anchor,units}
 storeTxFacts(tx,input.compositeId,result)
 return result
}

/** Pointer containment in the real immutable seal, never a bare source marker,
 * PLATFORM label, client receipt, or a second source compilation. */
export async function assertCompositionPublicContent(tx:Prisma.TransactionClient,input:{compositeId:string;ownerId:string;unit:Unit;release:StoredRelease;measurementOnly?:boolean}){
 const content=await readSealedCompositionContent(tx,input),actual=content.units.get(input.unit.itemId),source=input.unit.source.educationStandard
 if((!source&&!input.unit.source.educationLibrary&&!input.unit.source.educationNative)||!actual||(input.measurementOnly?canonicalHash({itemId:actual.itemId,family:actual.family,source:actual.source,measurement:actual.measurement})!==canonicalHash(input.unit):canonicalHash(actual)!==canonicalHash(input.unit)))privateToolFail('PRIVATE_COMPOSITION_CONTENT_INVALID')
 const {release}=input,pointer=release.layer==='MEASUREMENT'?actual.measurement:release.layer==='REPORT'?actual.report:
  actual.referencePolicy?.choices.find(choice=>choice.releaseId===release.releaseId)
 if(!pointer||pointer.releaseId!==release.releaseId||pointer.contentHash!==release.contentHash||release.family!==actual.family)
  privateToolFail('PRIVATE_COMPOSITION_CONTENT_INVALID')
 if(source&&release.layer!=='MEASUREMENT'&&(release.provenance.standardCombinationId!==source.releaseId||release.provenance.combinationHash!==source.combinationHash
  ||release.provenance.parametersAxisHash!==source.parametersAxisHash||release.provenance.reportAxisHash!==source.reportAxisHash))
  privateToolFail('PRIVATE_COMPOSITION_CONTENT_INVALID')
 return content
}
