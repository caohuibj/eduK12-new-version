import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {resolveEffectiveReportPrivacy} from './effective.service'
import {policyFingerprint,type EducationProduct,type PrivacyScenario} from './schema'
import {assertCurrentPrivacyPublisher,ReportPrivacyError} from './preferences.service'
import type {AuthenticatedPrincipal} from '../../types'

/** PR2/PR3 will invoke this helper INSIDE the canonical Run-publish transaction.
 * No PR1 route invokes it; PR1 must not change any report reader or publisher. */
export async function freezePrivacyForRunPublication(tx:Prisma.TransactionClient,input:{
  organizationId:string;runId:string;product:EducationProduct;
  scenario:PrivacyScenario;actor:AuthenticatedPrincipal;
  expectedPrivacyFingerprint:string;
}){
  // Mirror canonical publish's lock order: organization, then Run.
  // Preference saves acquire the same organization lock before modifying defaults.
  await tx.$queryRaw(Prisma.sql`SELECT id FROM organizations
    WHERE id=${input.organizationId} FOR UPDATE`)
  await assertCurrentPrivacyPublisher(input,tx)
  const runs=await tx.$queryRaw<Array<{status:string}>>(Prisma.sql`
    SELECT status FROM assessment_runs
    WHERE organization_id=${input.organizationId} AND id=${input.runId}
    FOR UPDATE
  `)
  if(runs[0]?.status!=='DRAFT')throw new ReportPrivacyError('PRIVACY_RUN_NOT_DRAFT',409)
  const existing=await tx.educationReportPolicySnapshot.findUnique({
    where:{organizationId_runId:{organizationId:input.organizationId,runId:input.runId}},
    select:{id:true},
  })
  if(existing)throw new ReportPrivacyError('PRIVACY_RUN_ALREADY_FROZEN',409)
  const effective=await resolveEffectiveReportPrivacy({
    organizationId:input.organizationId,product:input.product,
    scenario:input.scenario,actorUserId:input.actor.userId,
  },tx)
  if(effective.fingerprint!==input.expectedPrivacyFingerprint)
    throw new ReportPrivacyError('PRIVACY_PREFERENCE_CHANGED',409)
  const proof={
    schemaVersion:1,product:input.product,scenario:input.scenario,
    options:effective.effective,source:'APPROVED_REPORT_PREFERENCE_V1',
  }
  const row=await tx.educationReportPolicySnapshot.create({data:{
    id:randomUUID(),organizationId:input.organizationId,
    product:input.product,scenario:input.scenario,runId:input.runId,
    policyVersion:1,effective:proof,effectiveHash:policyFingerprint(proof),
    fingerprint:effective.fingerprint,origin:effective.origin,
    schoolDefaultRevision:effective.revisions.schoolDefault,
    schoolMinimumRevision:effective.revisions.schoolMinimum,
    publisherRevision:effective.revisions.publisher,
    publishedByUserId:input.actor.userId,publishedAt:new Date(),
  },select:{id:true,effectiveHash:true}})
  return row
}
/** Missing V1 evidence means LEGACY_STRICT, never an implicit standard-mode upgrade. */
export async function readFrozenPrivacyForRun(tx:Prisma.TransactionClient,input:{
  organizationId:string;runId:string;product:EducationProduct;scenario:PrivacyScenario
}){
  const row=await tx.educationReportPolicySnapshot.findUnique({
    where:{organizationId_runId:{
      organizationId:input.organizationId,runId:input.runId}},
  })
  if(!row)return {mode:'LEGACY_STRICT' as const}
  if(row.product!==input.product||row.scenario!==input.scenario
    ||row.policyVersion!==1||row.effectiveHash!==policyFingerprint(row.effective))
    throw new ReportPrivacyError('PRIVACY_SNAPSHOT_INTEGRITY',409)
  return {mode:'FROZEN_V1' as const,effective:row.effective,
    fingerprint:row.fingerprint,policySnapshotId:row.id}
}
