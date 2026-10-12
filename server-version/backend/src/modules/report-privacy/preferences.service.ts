import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import type {AuthenticatedPrincipal} from '../../types'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
import {resolveOrganizationAccessContext,resolveAssessmentDeliveryAuthority,
  contextHasCapability} from '../organization/access'
import {appendAudit,executeCommand} from '../organization/service'
import {currentClassDeliverySql} from '../organization/deliveryPolicy'
import {reportPrivacyCatalog,recognizePreset} from './registry'
import {resolveEffectiveReportPrivacy,requestedOptions} from './effective.service'
import {policyFingerprint,type EducationProduct,type PrivacyScenario,
  type SavePreferenceRequest} from './schema'

type Tx=Prisma.TransactionClient
export class ReportPrivacyError extends Error {
  constructor(public readonly code:string,public readonly statusCode=403){
    super(code);this.name='ReportPrivacyError'
  }
}
const deny=(code:string,status=403):never=>{throw new ReportPrivacyError(code,status)}
type ScopeInput={organizationId:string;product:EducationProduct;
  scenario:PrivacyScenario;actor:AuthenticatedPrincipal}
const forbiddenDenies=['*','ORGANIZATION_GOVERNANCE','ASSESSMENT_DELIVERY',
  'ASSESSMENT_RUN_PUBLISH','RUN_PUBLISH']

/** Only a currently authorized product publisher may manage default preferences.
 * Saving a preference confers no Run publication or report-reading authority. */
export async function assertCurrentPrivacyPublisher(input:ScopeInput,tx?:Tx){
  reportPrivacyCatalog(input.product,input.scenario)
  if(input.actor.accountDomain!=='SCHOOL')deny('PRIVACY_EDUCATION_ACCOUNT_REQUIRED')
  if(input.product==='HUITEACHER'){
    const scope=await resolveEducationProductMemberScope({
      actorUserId:input.actor.userId,organizationId:input.organizationId,
      product:'HUITEACHER',
    },tx)
    if(!scope?.productAdmin)deny('PRIVACY_TEACHER_PUBLISHER_REQUIRED')
    return {schoolAdmin:true}
  }
  const ctx=await resolveOrganizationAccessContext({
    principal:input.actor,organizationId:input.organizationId,
  },tx)
  if(!ctx)throw new ReportPrivacyError('PRIVACY_CAMPUS_PUBLISHER_REQUIRED',403)
  if(ctx.productDomain!=='SCHOOL'||ctx.organizationStatus!=='ACTIVE'
    ||!ctx.membershipId||ctx.explicitDenies.some(x=>forbiddenDenies.includes(x)))
    throw new ReportPrivacyError('PRIVACY_CAMPUS_PUBLISHER_REQUIRED',403)
  const schoolAdmin=ctx.orgRole==='ORG_ADMIN'&&ctx.canGovern
  if(schoolAdmin)return {schoolAdmin:true}
  const counselor=ctx.personas.includes('COUNSELOR')
    &&contextHasCapability(ctx,'PSYCHOLOGY_STAFF')
  if(input.scenario==='SCHOOL_SENSITIVE_WELLBEING_GROUP'){
    if(!counselor)deny('PRIVACY_CAMPUS_SENSITIVE_PUBLISHER_REQUIRED')
    return {schoolAdmin:false}
  }
  // A member having only a historical TEACHER persona is insufficient:
  // the current canonical delivery scope must still be authorized.
  if(!tx){
    const delivery=await resolveAssessmentDeliveryAuthority({
      principal:input.actor,organizationId:input.organizationId})
    if(!delivery?.deliveryScopes.length)deny('PRIVACY_CAMPUS_PUBLISHER_REQUIRED')
    return {schoolAdmin:false}
  }
  const hasClass=ctx.personas.includes('TEACHER')
    &&(await tx.$queryRaw<Array<{allowed:boolean}>>(Prisma.sql`
      SELECT EXISTS(SELECT 1 FROM organization_staff_class_assignments sa
      WHERE sa.organization_id=${input.organizationId}
        AND sa.membership_id=${ctx.membershipId}
        AND ${currentClassDeliverySql}
      ) AS "allowed"
    `))[0]?.allowed===true
  if(!counselor&&!hasClass)deny('PRIVACY_CAMPUS_PUBLISHER_REQUIRED')
  return {schoolAdmin:false}
}
export async function readReportPrivacyPreferences(input:ScopeInput){
  const permission=await assertCurrentPrivacyPublisher(input)
  const rows=await prisma.educationReportPrivacyPreference.findMany({
    where:{organizationId:input.organizationId,product:input.product,
      scenario:input.scenario,OR:[
        {ownerScopeKind:{in:['SCHOOL_DEFAULT','SCHOOL_MINIMUM']}},
        {ownerScopeKind:'PUBLISHER',ownerUserId:input.actor.userId},
      ]},
    select:{ownerScopeKind:true,preset:true,revision:true,
      options:true,updatedAt:true,ownerUserId:true},
  })
  const mine=rows.find(r=>r.ownerScopeKind==='PUBLISHER'
    &&r.ownerUserId===input.actor.userId)??null
  const school=rows.find(r=>r.ownerScopeKind==='SCHOOL_DEFAULT')??null
  const minimum=rows.find(r=>r.ownerScopeKind==='SCHOOL_MINIMUM')??null
  const visible=(r:typeof mine)=>r?{
    revision:r.revision,preset:r.preset,options:r.options,updatedAt:r.updatedAt}:null
  return {
    editableScopes:permission.schoolAdmin?['MY','SCHOOL_DEFAULT','SCHOOL_MINIMUM']:['MY'],
    mine:visible(mine),schoolDefault:visible(school),schoolMinimum:visible(minimum),
    ...(await resolveEffectiveReportPrivacy({...input,actorUserId:input.actor.userId})),
  }
}

export async function saveReportPrivacyPreferences(input:ScopeInput&{
  request:SavePreferenceRequest
}){
  reportPrivacyCatalog(input.product,input.scenario)
  let normalized:unknown
  try{normalized=requestedOptions(input.request)}catch{deny('PRIVACY_OPTIONS_INVALID',400)}
  const ownerScopeKind=input.request.scope==='MY'?'PUBLISHER':input.request.scope
  const ownerUserId=ownerScopeKind==='PUBLISHER'?input.actor.userId:null
  const preset=ownerScopeKind==='SCHOOL_MINIMUM'?null:
    recognizePreset(normalized as Parameters<typeof recognizePreset>[0])
  // A revoked publisher cannot replay a previously successful command receipt.
  const before=await assertCurrentPrivacyPublisher(input)
  if(ownerScopeKind!=='PUBLISHER'&&!before.schoolAdmin)
    deny('PRIVACY_SCHOOL_DEFAULT_ADMIN_REQUIRED')
  return executeCommand({
    organizationId:input.organizationId,
    meta:{actorUserId:input.actor.userId,commandKey:input.request.requestKey},
    payload:{kind:'REPORT_PRIVACY_PREFERENCE_V1',organizationId:input.organizationId,
      product:input.product,scenario:input.scenario,scope:ownerScopeKind,
      ownerUserId,expectedRevision:input.request.expectedRevision,preset,
      options:normalized},
    work:async(tx,domainEventId)=>{
      // Serialize with the canonical Run publisher (which locks this organization).
      // A preference saved during publish must be ordered before or after its snapshot.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM organizations
        WHERE id=${input.organizationId} FOR UPDATE`)
      const authorization=await assertCurrentPrivacyPublisher(input,tx)
      if(ownerScopeKind!=='PUBLISHER'&&!authorization.schoolAdmin)
        deny('PRIVACY_SCHOOL_DEFAULT_ADMIN_REQUIRED')
      const previous=await tx.educationReportPrivacyPreference.findFirst({
        where:{organizationId:input.organizationId,product:input.product,
          scenario:input.scenario,ownerScopeKind,ownerUserId},
        select:{id:true,revision:true},
      })
      if((previous?.revision??0)!==input.request.expectedRevision)
        deny('PRIVACY_PREFERENCE_CHANGED',409)
      const now=new Date()
      const row=previous
        ?await tx.educationReportPrivacyPreference.updateMany({
          where:{id:previous.id,revision:input.request.expectedRevision},
          data:{preset,options:normalized as Prisma.InputJsonValue,
            revision:{increment:1},updatedByUserId:input.actor.userId,updatedAt:now},
        }).then(changed=>{
          if(changed.count!==1)deny('PRIVACY_PREFERENCE_CHANGED',409)
          return {id:previous.id,revision:input.request.expectedRevision+1}
        })
        :await tx.educationReportPrivacyPreference.create({data:{
          id:randomUUID(),organizationId:input.organizationId,product:input.product,
          scenario:input.scenario,ownerScopeKind,ownerUserId,
          schemaVersion:1,preset,options:normalized as Prisma.InputJsonValue,
          revision:1,updatedByUserId:input.actor.userId,updatedAt:now,
        },select:{id:true,revision:true}})
      await appendAudit(tx,{
        organizationId:input.organizationId,actorUserId:input.actor.userId,
        action:'REPORT_PRIVACY_PREFERENCE_SAVED',targetType:'REPORT_PRIVACY_PREFERENCE',
        targetId:row.id,domainEventId,
        payload:{product:input.product,scenario:input.scenario,
          scope:ownerScopeKind,revision:row.revision,optionsDigest:policyFingerprint(normalized)},
      })
      return {scope:input.request.scope,revision:row.revision,preset,
        saved:true as const,reportConsumerActive:false as const,
        note:'偏好已保存；PR1 不改变现有报告披露规则。'}
    },
  }).catch((error:unknown)=>{
    const e=error as {code?:string;meta?:{code?:string}}
    if(e.code==='P2002'||e.meta?.code==='23505'||e.code==='P2034')
      deny('PRIVACY_PREFERENCE_CHANGED',409)
    throw error
  })
}

/** Purely informational: a legacy Run never silently gains the new default. */
export async function readReportPrivacyPolicyState(input:ScopeInput&{runId?:string}){
  await assertCurrentPrivacyPublisher(input)
  const current=await resolveEffectiveReportPrivacy({...input,actorUserId:input.actor.userId})
  if(!input.runId)return current
  const source=await prisma.$queryRaw<Array<{id:string;createdByUserId:string}>>(Prisma.sql`
    SELECT id, created_by_user_id AS "createdByUserId" FROM assessment_runs
    WHERE id=${input.runId} AND organization_id=${input.organizationId} LIMIT 1
  `)
  if(!source.length)deny('PRIVACY_RUN_NOT_FOUND',404)
  const reader=await assertCurrentPrivacyPublisher(input)
  if(input.product==='HUISCHOOL'&&!reader.schoolAdmin
    &&source[0].createdByUserId!==input.actor.userId)
    deny('PRIVACY_RUN_NOT_FOUND',404)
  const snapshot=await prisma.educationReportPolicySnapshot.findUnique({
    where:{organizationId_runId:{organizationId:input.organizationId,runId:input.runId}},
  })
  if(!snapshot)return {...current,disclosureState:'LEGACY_STRICT' as const,
    runId:input.runId,runPolicy:null}
  if(snapshot.product!==input.product||snapshot.scenario!==input.scenario)
    deny('PRIVACY_RUN_SCENARIO_MISMATCH',404)
  if(snapshot.effectiveHash!==policyFingerprint(snapshot.effective))
    deny('PRIVACY_SNAPSHOT_INTEGRITY',409)
  return {...current,disclosureState:'FROZEN_V1' as const,
    runId:input.runId,runPolicy:{policyVersion:snapshot.policyVersion,
      effective:snapshot.effective,fingerprint:snapshot.fingerprint,
      effectiveHash:snapshot.effectiveHash,origin:snapshot.origin}}
}
