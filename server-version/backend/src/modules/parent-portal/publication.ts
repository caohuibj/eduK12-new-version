import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import type { ReportingArtifactRecord } from '../reporting/types'
import { fail,parseParentProjection,type ParentReportSource } from './contracts'
export interface ParentPublicationRow {id:string;artifactId:string;organizationId:string;subjectUserId:string;sourceHash:string;projection:unknown;projectionHash:string;payload:any;publicationHash:string;templateHash:string;revokedAt:Date|null}
export const publicationColumns=Prisma.sql`publication.id,publication.source_artifact_id AS "artifactId",publication.organization_id AS "organizationId",publication.subject_user_id AS "subjectUserId",publication.source_hash AS "sourceHash",publication.projection_payload AS projection,publication.projection_hash AS "projectionHash",publication.publication_payload AS payload,publication.publication_hash AS "publicationHash",publication.template_hash AS "templateHash",head.revoked_at AS "revokedAt"`
export function verifyParentPublication(row:ParentPublicationRow,source:{artifactId:string;sourceHash:string;subjectUserId:string;organizationId:string}){
 const p=row.payload
 if(row.revokedAt||row.artifactId!==source.artifactId||row.sourceHash!==source.sourceHash||row.subjectUserId!==source.subjectUserId||row.organizationId!==source.organizationId||
  !p||p.schemaVersion!==1||p.audience!=='PARENT'||p.publicationId!==row.id||p.artifactId!==row.artifactId||p.organizationId!==row.organizationId||p.subjectUserId!==row.subjectUserId||p.sourceHash!==row.sourceHash||
  canonicalHash(p)!==row.publicationHash||canonicalHash(p.template)!==row.templateHash||canonicalHash(row.projection)!==row.projectionHash||canonicalHash(p.projection)!==row.projectionHash||
  p.template.key!==p.projection.policy.key||p.template.version!==p.projection.policy.version||p.template.status!=='PUBLISHED'||p.template.mode!==p.projection.policy.mode||canonicalHash(p.template.toolRef)!==canonicalHash(p.projection.toolRef))fail('PARENT_PUBLICATION_INTEGRITY',409)
 return parseParentProjection(row.projection,row.artifactId,row.subjectUserId)
}
export async function readParentPublication(record:ReportingArtifactRecord,subjectUserId:string):Promise<ParentReportSource|null>{
 const rows=await prisma.$queryRaw<ParentPublicationRow[]>(Prisma.sql`SELECT ${publicationColumns} FROM parent_report_publication_heads head JOIN parent_report_publications publication ON publication.id=head.publication_id AND publication.source_artifact_id=head.source_artifact_id WHERE head.source_artifact_id=${record.id} LIMIT 1`)
 if(!rows.length)return null
 const row=rows[0],projection=verifyParentPublication(row,{artifactId:record.id,sourceHash:record.snapshotHash,subjectUserId,organizationId:record.organizationId})
 return {artifactId:record.id,subjectUserId,organizationId:record.organizationId,policyDomain:record.policyDomain,sourceHash:record.snapshotHash,publicationId:row.id,publicationHash:row.publicationHash,projection}
}
export async function assertCurrentParentPublication(tx:Prisma.TransactionClient,source:ParentReportSource){
 const rows=await tx.$queryRaw<Array<{id:string;hash:string;revokedAt:Date|null}>>`SELECT publication.id,publication.publication_hash AS hash,head.revoked_at AS "revokedAt" FROM parent_report_publication_heads head JOIN parent_report_publications publication ON publication.id=head.publication_id WHERE head.source_artifact_id=${source.artifactId} FOR SHARE OF head`
 const current=rows[0]
 if(source.publicationId){if(!current||current.id!==source.publicationId||current.hash!==source.publicationHash||current.revokedAt)fail('PARENT_PUBLICATION_CHANGED',409,'家长报告已变化，请重新预览')}
 else if(current)fail('PARENT_PUBLICATION_CHANGED',409,'家长报告已变化，请重新预览')
}
