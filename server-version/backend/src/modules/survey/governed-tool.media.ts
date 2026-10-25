import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {collectLibraryMediaIdentities} from '../scale-library-governance/media'
import {assertAssessmentAssetReferencesReady,retainAssessmentAssetReferences,type AssessmentAssetIdentityV1} from '../assessment-media/assessment-asset'
import type {CatalogSourceSnapshot} from './catalog.sources'
import type {LibraryBoundMediaUnit} from '../scale-library-governance/media.authorization'
export function governedMediaRefs(unit:{displayDefinition:unknown;compiledDefinition:unknown}){return collectLibraryMediaIdentities([{value:unit.displayDefinition,path:'definition',releaseId:'content'},{value:unit.compiledDefinition,path:'compiled',releaseId:'content'}]).map(({assetId,contentHash,mimeType})=>({assetId,contentHash,mimeType}))}
export function governedMediaBlocker(unit:CatalogSourceSnapshot){const refs=governedMediaRefs(unit);if(!refs.length)return null;const manifest=unit.provenance.governedMedia as {references?:AssessmentAssetIdentityV1[]}|undefined;return !manifest?.references||canonicalHash(refs)!==canonicalHash(manifest.references)?'展示附件未随原作者的本次提交确认共享，保留其来源记录；请由原作者提交含附件的固定版本':null}
export async function ownGovernedMedia(tx:Prisma.TransactionClient,actor:string,projectId:string,unit:CatalogSourceSnapshot){const {assertSurveyMediaOwned}=await import('./media.references');const allowed=await assertSurveyMediaOwned(tx,actor,projectId,[{kind:unit.ref.kind,definition:unit.displayDefinition,compiledDefinition:unit.compiledDefinition}]),references=governedMediaRefs(unit);if(references.some(r=>!allowed.some(a=>canonicalHash(a)===canonicalHash(r))))throw new Error('共享附件不属于本次原作者工具');await assertAssessmentAssetReferencesReady(references,tx);return {schemaVersion:1,references,sharedBy:actor}}
export async function retainGovernedMedia(tx:Prisma.TransactionClient,id:string,unit:CatalogSourceSnapshot|null){if(!unit)return;const refs=governedMediaRefs(unit);if(refs.length)await retainAssessmentAssetReferences({owner:{entityType:'SurveyGovernedTool',entityId:id,field:'media'},references:refs,db:tx})}
export async function authorizedGovernedUnitMedia(tx:Prisma.TransactionClient,actor:string,unit:LibraryBoundMediaUnit){
 const id=unit.sourceProvenance?.surveyToolReleaseId;if(typeof id!=='string')return null
 const references=governedMediaRefs({displayDefinition:unit.definition,compiledDefinition:unit.compiledDefinition});if(!references.length)return []
 const gid=unit.sourceProvenance?.sourceGrantId;if(typeof gid!=='string')throw new Error('展示附件缺少精确工具使用授权')
 const {catalogSnapshotsForDrafts}=await import('./catalog.service'),map=await catalogSnapshotsForDrafts(tx,actor,[gid]),snapshot=map.get(gid)
 if(!snapshot||snapshot.provenance.surveyToolReleaseId!==id||canonicalHash(snapshot.displayDefinition)!==canonicalHash(unit.definition)||canonicalHash(snapshot.compiledDefinition)!==canonicalHash(unit.compiledDefinition)||governedMediaBlocker(snapshot))throw new Error('展示附件与已批准工具绑定不一致')
 const pins=await tx.assetReference.count({where:{entityType:'SurveyGovernedTool',entityId:id,field:'media',assetId:{in:references.map(r=>r.assetId)}}});if(pins!==references.length)throw new Error('已批准工具的固定附件留存记录缺失')
 await assertAssessmentAssetReferencesReady(references,tx);return references
}
