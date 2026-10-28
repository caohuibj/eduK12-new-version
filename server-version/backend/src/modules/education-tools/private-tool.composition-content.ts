import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import type {TrainingContentSnapshot} from '../composite/training-content-binding'
import type {StoredRelease} from '../measurement-content/repository'
import {educationCompositionKey,educationCompositionRuntimeAnchorSchema,type EducationCompositionRuntimeAnchor} from './private-tool.composition-contracts'
import {privateToolFail} from './private-tool.contracts'

type Unit=TrainingContentSnapshot['units'][number]
type Facts={anchor:EducationCompositionRuntimeAnchor;units:Map<string,Unit>}
// Immutable, DB-contained content facts only, bounded by the caller's actual
// transaction. No grant, role, emergency state or account decision is cached.
const facts=new WeakMap<object,Map<string,Facts>>()
export async function readSealedCompositionContent(tx:Prisma.TransactionClient,input:{compositeId:string;ownerId:string;anchor?:EducationCompositionRuntimeAnchor}){
 const prior=!('$transaction'in tx)?facts.get(tx)?.get(input.compositeId):undefined
 if(prior){
  if(prior.anchor.origin.ownerUserId!==input.ownerId||input.anchor&&canonicalHash(input.anchor)!==canonicalHash(prior.anchor))privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
  return prior
 }
 const [row]=await tx.$queryRaw<Array<{creationKey:string;creationHash:string;manifestHash:string;origin:unknown;units:Unit[]}>>(Prisma.sql`
  SELECT creation_key AS "creationKey",creation_hash AS "creationHash",training_content_snapshot_hash AS "manifestHash",
   training_content_snapshot#>'{educationBinding,origin}' AS origin,training_content_snapshot->'units' AS units
  FROM composite_assessments WHERE id=${input.compositeId} AND created_by=${input.ownerId} AND status='PUBLISHED'
   AND product_kind='ORGANIZATION_RESOURCE' AND NOT public_enabled AND NOT copyable`)
 if(!row)privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
 const anchor=educationCompositionRuntimeAnchorSchema.parse({origin:row.origin,manifestHash:row.manifestHash})
 if(anchor.origin.ownerUserId!==input.ownerId||educationCompositionKey(anchor.origin)!==row.creationKey||canonicalHash(anchor.origin)!==row.creationHash
  ||input.anchor&&canonicalHash(input.anchor)!==canonicalHash(anchor)||!Array.isArray(row.units)||row.units.length>50)
  privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
 const result={anchor,units:new Map(row.units.map(unit=>[unit.itemId,unit]))}
 if(!('$transaction'in tx)){
  let byParent=facts.get(tx);if(!byParent){byParent=new Map();facts.set(tx,byParent)}
  byParent.set(input.compositeId,result)
 }
 return result
}

/** Pointer containment in the real immutable seal, never a bare source marker,
 * PLATFORM label, client receipt, or a second source compilation. */
export async function assertCompositionPublicContent(tx:Prisma.TransactionClient,input:{compositeId:string;ownerId:string;unit:Unit;release:StoredRelease;measurementOnly?:boolean}){
 const content=await readSealedCompositionContent(tx,input),actual=content.units.get(input.unit.itemId),source=input.unit.source.educationStandard
 if((!source&&!input.unit.source.educationLibrary)||!actual||(input.measurementOnly?canonicalHash({itemId:actual.itemId,family:actual.family,source:actual.source,measurement:actual.measurement})!==canonicalHash(input.unit):canonicalHash(actual)!==canonicalHash(input.unit)))privateToolFail('PRIVATE_COMPOSITION_CONTENT_INVALID')
 const {release}=input,pointer=release.layer==='MEASUREMENT'?actual.measurement:release.layer==='REPORT'?actual.report:
  actual.referencePolicy?.choices.find(choice=>choice.releaseId===release.releaseId)
 if(!pointer||pointer.releaseId!==release.releaseId||pointer.contentHash!==release.contentHash||release.family!=='SCALE')
  privateToolFail('PRIVATE_COMPOSITION_CONTENT_INVALID')
 if(source&&release.layer!=='MEASUREMENT'&&(release.provenance.standardCombinationId!==source.releaseId||release.provenance.combinationHash!==source.combinationHash
  ||release.provenance.parametersAxisHash!==source.parametersAxisHash||release.provenance.reportAxisHash!==source.reportAxisHash))
  privateToolFail('PRIVATE_COMPOSITION_CONTENT_INVALID')
 return content
}
