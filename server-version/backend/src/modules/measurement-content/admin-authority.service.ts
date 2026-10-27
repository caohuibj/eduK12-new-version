import {validateStaticSjtRegistryMappings} from '../situational/static-measurement-release'
import {readSjtEntryDistributionSource,SjtEntryAuthorityError} from '../situational/entry-authority'
import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {AdminPermissionError} from '../admin-permissions/service'
import {ADMIN_STEP_UP_SECONDS,validAdminProof,type AdminSessionProof} from '../admin-permissions/proof'
import {canonicalHash} from '../assessment-runtime/canonical'
import {contentGrantInputSchema,type ContentGrantInput} from './content-authority'
const uuid=z.string().guid(),reason=z.string().trim().min(1).max(500)
const wireGrant=z.object({ ...contentGrantInputSchema.shape,
  validFrom:z.string().datetime().transform(value=>new Date(value)),
  expiresAt:z.string().datetime().transform(value=>new Date(value)),
}).strict().pipe(contentGrantInputSchema).superRefine((grant,ctx)=>{
  if(!supported(grant)||!uuid.safeParse(grant.subjectId).success||(!platformSjt(grant)&&!platformReference(grant)&&!platformScaleLibrary(grant)&&!platformScalePublic(grant)&&!platformSjtDistribution(grant)&&!uuid.safeParse(grant.scope.scopeId).success)||
    grant.scope.resourceKeys.some(key=>!uuid.safeParse(key).success))
    ctx.addIssue({code:'custom',message:'Only exact Survey project, Training course, formal reference governance, installed situational measurement or entry distribution grants are supported'})
  if(platformSjtDistribution(grant)&&(grant.remainingDelegationDepth!==0||grant.delegableCapabilities.length!==0))
    ctx.addIssue({code:'custom',message:'Situational entry distribution does not support delegation'})
})
export const adminContentRootRequestSchema=z.object({requestId:uuid,expectedVersion:z.literal(0),reason,grant:wireGrant}).strict()
export const adminContentRevokeRequestSchema=z.object({expectedVersion:z.number().int().positive(),reason}).strict()
const options={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:5000}
function deny(message = '内容授权范围或当前身份无效'): never {
  throw new AdminPermissionError(403, message)
}
function platformSjt(grant:Pick<ContentGrantInput,'scope'|'capabilities'>){
  return grant.scope.product==='TRAINING'&&grant.scope.scopeKind==='PLATFORM'&&grant.scope.scopeId==='situational-registry'
    &&grant.scope.resourceKind==='measurement'&&grant.capabilities.length===1&&grant.capabilities[0]==='measurement.publish'
}
function platformReference(grant:Pick<ContentGrantInput,'scope'|'capabilities'>){
  return grant.scope.product==='TRAINING'&&grant.scope.scopeKind==='PLATFORM'&&grant.scope.scopeId==='reference-governance'
    &&grant.scope.resourceKind==='reference'&&grant.capabilities.every(capability=>['reference.review','reference.publish'].includes(capability))
}
function platformScaleLibrary(grant:Pick<ContentGrantInput,'scope'|'capabilities'>){
  return ['TRAINING','SURVEY'].includes(grant.scope.product)&&grant.scope.scopeKind==='PLATFORM'&&grant.scope.scopeId==='scale-library-governance'&&(
    grant.scope.product==='TRAINING'&&grant.scope.resourceKind==='catalog'&&grant.capabilities.length===1&&grant.capabilities[0]==='catalog.manage'||
    grant.scope.resourceKind==='material'&&grant.capabilities.length===1&&grant.capabilities[0]==='material.distribute')
}
function platformScalePublic(grant:Pick<ContentGrantInput,'scope'|'capabilities'>){
  return grant.scope.product==='TRAINING'&&grant.scope.scopeKind==='PLATFORM'&&grant.scope.scopeId==='scale-public-delivery'&&
    grant.scope.resourceKind==='material'&&grant.capabilities.length===1&&grant.capabilities[0]==='material.distribute'
}
function platformSjtDistribution(grant:Pick<ContentGrantInput,'scope'|'capabilities'>){
  return grant.scope.product==='SURVEY'&&grant.scope.scopeKind==='PLATFORM'&&grant.scope.scopeId==='situational-library-governance'
    &&grant.scope.resourceKind==='material'&&grant.capabilities.length===1&&grant.capabilities[0]==='material.distribute'
}
function supported(grant:Pick<ContentGrantInput,'scope'|'capabilities'>){
  if(educationDistribution(grant))return true
  if(platformSjt(grant)||platformReference(grant)||platformScaleLibrary(grant)||platformScalePublic(grant)||platformSjtDistribution(grant))return true
  if(grant.scope.product==='TRAINING')return grant.scope.scopeKind==='COURSE'&&(
    grant.scope.resourceKind==='report'&&grant.capabilities.every(capability=>['report.edit','report.publish'].includes(capability))||
    grant.scope.resourceKind==='reference'&&grant.capabilities.every(capability=>['reference.analyze','reference.review','reference.publish'].includes(capability))||
    grant.scope.resourceKind==='data'&&grant.capabilities.length===1&&grant.capabilities[0]==='data.reinterpret')
  return grant.scope.product==='SURVEY'&&grant.scope.scopeKind==='PROJECT'&&
    (grant.scope.resourceKind==='reference'&&grant.capabilities.every(c=>['reference.analyze','reference.review','reference.publish'].includes(c))||
     grant.scope.resourceKind==='data'&&grant.capabilities.length===1&&grant.capabilities[0]==='data.reinterpret')
}
function educationDistribution(grant:Pick<ContentGrantInput,'scope'|'capabilities'>){
 return ['SCHOOL','TEACHER'].includes(grant.scope.product)&&grant.scope.scopeKind==='ORGANIZATION'
  &&grant.scope.resourceKind==='material'&&grant.capabilities.length===1&&grant.capabilities[0]==='material.distribute'
}
type UserRow={id:string;token_version:number;platform_role:string;account_domain:string;role:string;teacher_approved:boolean;is_active:boolean;is_frozen:boolean;must_change_password:boolean;expires_at:Date|null}
function assertProof(proof:AdminSessionProof){if(!validAdminProof(proof,ADMIN_STEP_UP_SECONDS))deny('内容授权变更需要最近的管理员双因素验证')}
async function lockActor(tx:Prisma.TransactionClient,actorId:string,proof:AdminSessionProof,targetId?:string){
  // SHARE is intentional: consumers hold User SHARE alongside grant SHARE.
  // Never hold User UPDATE while waiting for a grant held by those consumers.
  const users=await tx.$queryRaw<UserRow[]>(Prisma.sql`SELECT id,token_version,platform_role::text,account_domain,role::text,teacher_approved,
    is_active,is_frozen,must_change_password,expires_at FROM users
    WHERE id IN (${Prisma.join([...new Set([actorId,...(targetId?[targetId]:[])])].sort())}) ORDER BY id FOR SHARE`)
  const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
  assertProof(proof)
  const actor=users.find(user=>user.id===actorId)
  if(!clock||!actor||actor.platform_role!=='SYSTEM_ADMIN'||!['LEGACY','TRAINING'].includes(actor.account_domain)||
    !actor.is_active||actor.is_frozen||actor.must_change_password||actor.token_version!==proof.tokenVersion||
    actor.expires_at&&actor.expires_at<=clock.now)deny('操作者会话已失效，请重新登录')
  return {users,now:clock.now}
}
async function recheckAfterWait(tx:Prisma.TransactionClient,proof:AdminSessionProof,users:UserRow[]){
  const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
  assertProof(proof)
  if(!clock||users.some(user=>user.expires_at&&user.expires_at<=clock.now))deny('当前账号已过期')
}
type GrantRow={id:string;subject_id:string;issuer_id:string;parent_grant_id:string|null;product:string;scope_kind:string;scope_id:string;
 resource_kind:string;resource_keys:string[];capabilities:string[];delegable_capabilities:string[];remaining_delegation_depth:number;
 valid_from:Date;expires_at:Date;ancestry:string[];version:number;revoked_at:Date|null;revoked_by:string|null;revoke_reason:string|null}
function storedInput(row:GrantRow):ContentGrantInput{return contentGrantInputSchema.parse({subjectId:row.subject_id,
 scope:{product:row.product,scopeKind:row.scope_kind,scopeId:row.scope_id,resourceKind:row.resource_kind,resourceKeys:row.resource_keys},
 capabilities:row.capabilities,delegableCapabilities:row.delegable_capabilities,remainingDelegationDepth:row.remaining_delegation_depth,
 validFrom:row.valid_from,expiresAt:row.expires_at})}
const comparable=(grant:ContentGrantInput)=>({...grant,validFrom:grant.validFrom.toISOString(),expiresAt:grant.expiresAt.toISOString()})
/** Root issuance only. No administrator/owner identity implicitly acquires rights. */
export async function issueAdminContentRoot(actorId:string,proof:AdminSessionProof,raw:unknown){
  const input=adminContentRootRequestSchema.parse(raw),grant=input.grant,scope=grant.scope,isPlatformSjt=platformSjt(grant),isPlatformReference=platformReference(grant),isLibrary=platformScaleLibrary(grant),isScalePublic=platformScalePublic(grant),isSjtDistribution=platformSjtDistribution(grant),isEducationDistribution=educationDistribution(grant)
  if(isEducationDistribution&&(grant.remainingDelegationDepth!==0||grant.delegableCapabilities.length))deny('教育资源分发授权不允许转委托')
  assertProof(proof)
  return prisma.$transaction(async tx=>{
    // Match consumers: Project/Course → Users → composites/deliveries → grants/resources.
    // Static registry publishing shares source → mapping → Users → grant order
    // with its publisher. The initial read only orders locks, never authorizes.
    let registryResources:Array<{id:string}>=[]
    if(isPlatformSjt){
      const mappings=await validateStaticSjtRegistryMappings(tx,scope.resourceKeys)
      if(mappings.length!==scope.resourceKeys.length||mappings.some(row=>!scope.resourceKeys.includes(row.id)))deny()
      registryResources=mappings
    }
    const projects=isEducationDistribution?await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM organizations
      WHERE id=${scope.scopeId} AND product_domain='SCHOOL' AND status='ACTIVE' FOR UPDATE`)
      :isPlatformSjt||isPlatformReference||isLibrary||isScalePublic||isSjtDistribution?[{id:scope.scopeId}]:scope.product==='TRAINING'
      ?await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM courses
        WHERE id=${scope.scopeId} AND creator_id=${grant.subjectId} AND course_type='TRAINING_COURSE' AND NOT is_library FOR SHARE`)
      :await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM survey_projects
      WHERE id=${scope.scopeId} AND owner_user_id=${grant.subjectId} FOR SHARE`)
    if(projects.length!==1)deny()
    if(isEducationDistribution){
      const {lockEducationAssessmentUsers}=await import('../education-tools/assessment-resource.locks')
      await lockEducationAssessmentUsers(tx,[actorId,grant.subjectId])
    }
    const {users}=await lockActor(tx,actorId,proof,grant.subjectId)
    const target=users.find(user=>user.id===grant.subjectId)
    if(!target||!target.is_active||target.is_frozen||target.must_change_password)deny()
    if(isEducationDistribution){
      const product=scope.product==='TEACHER'?'HUITEACHER':'HUISCHOOL'
      const [entitlement]=await tx.$queryRaw<Array<{organization_id:string}>>(Prisma.sql`SELECT organization_id FROM education_product_entitlements
        WHERE organization_id=${scope.scopeId} AND product=${product} AND status='ACTIVE' FOR SHARE`)
      if(!entitlement)deny()
      // A distinct explicit system authorization, never implied by target admin
      // status or by being able to read the underlying Training definitions.
      if(target.account_domain!=='SCHOOL'&&!(target.platform_role==='SYSTEM_ADMIN'&&['LEGACY','TRAINING'].includes(target.account_domain)))deny()
      if(target.account_domain==='SCHOOL'){
        const {captureEducationAssessmentIssuer}=await import('../education-tools/assessment-resource.issuer')
        await captureEducationAssessmentIssuer(tx,{product:scope.product as 'SCHOOL'|'TEACHER',organizationId:scope.scopeId,
          principal:{userId:target.id,accountDomain:'SCHOOL',platformRole:target.platform_role as 'STANDARD',role:target.role as 'ADMIN',
            username:'',tokenVersion:target.token_version,mustChangePassword:target.must_change_password}})
      }
    }else if(isLibrary||isScalePublic||isSjtDistribution){
      if(!['TRAINING','LEGACY'].includes(target.account_domain))deny()
      if(grant.scope.resourceKind==='material'){
        const entry=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM admin_entry_grants WHERE user_id=${grant.subjectId} AND entry=${scope.product} AND revoked_at IS NULL FOR SHARE`)
        if(!entry.length)deny('分发权限仅可授予具有对应入口管理资格的账号')
      }
    }else if(scope.product==='TRAINING'){
      if(!['TRAINING','LEGACY'].includes(target!.account_domain)||(isPlatformSjt?target!.platform_role!=='SYSTEM_ADMIN':target!.role!=='TEACHER'||target!.teacher_approved!==true))deny()
    }else{
    if(target!.account_domain!=='SURVEY')deny()
    const qualified=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT g.user_id AS id
      FROM survey_researcher_grants g JOIN survey_mfa_credentials m ON m.user_id=g.user_id
      WHERE g.user_id=${grant.subjectId} AND g.status='ACTIVE' AND m.enabled FOR SHARE OF g,m`)
    if(qualified.length!==1)deny()
    }
    let trainingResources:Array<{id:string}>=[]
    if(scope.product==='TRAINING'&&!isPlatformSjt&&!isPlatformReference&&!isLibrary&&!isScalePublic){
      // Initial headers order locks only; the locked FINAL query below remains
      // authoritative and must match these actual parent composites.
      const attemptParents=scope.resourceKind==='data'?await tx.$queryRaw<Array<{id:string;composite_assessment_id:string}>>(Prisma.sql`
        SELECT id,composite_assessment_id FROM composite_assessment_attempts WHERE id IN (${Prisma.join(scope.resourceKeys)})`):[]
      const compositeIds=scope.resourceKind==='data'?[...new Set(attemptParents.map(row=>row.composite_assessment_id))]:scope.resourceKeys
      if(!compositeIds.length)deny()
      const composites=await tx.$queryRaw<Array<{id:string;course_id:string|null;product_kind:string;questionnaire_type:string|null}>>(Prisma.sql`SELECT id,course_id,product_kind,questionnaire_type::text FROM composite_assessments
        WHERE id IN (${Prisma.join(compositeIds)}) AND created_by=${grant.subjectId} ORDER BY id FOR SHARE`)
      const deliveries=await tx.$queryRaw<Array<{composite_id:string}>>(Prisma.sql`SELECT composite_id FROM questionnaire_course_deliveries
        WHERE course_id=${scope.scopeId} AND composite_id IN (${Prisma.join(compositeIds)}) ORDER BY composite_id FOR SHARE`)
      const linked=new Set(deliveries.map(row=>row.composite_id))
      const authorizedParents=composites.filter(row=>row.product_kind==='QUESTIONNAIRE'
        ?row.questionnaire_type==='COURSE'&&linked.has(row.id):row.product_kind==='LEGACY_COMPOSITE'&&row.course_id===scope.scopeId)
      if(scope.resourceKind==='data'){
        const parentIds=new Set(authorizedParents.map(row=>row.id))
        const attempts=await tx.$queryRaw<Array<{id:string;composite_assessment_id:string}>>(Prisma.sql`
          SELECT id,composite_assessment_id FROM composite_assessment_attempts WHERE id IN (${Prisma.join(scope.resourceKeys)})
            AND delivery_course_id=${scope.scopeId} AND status='COMPLETED' AND delivery_mode='FINAL_ONLY' AND runtime_generation='UNIFIED_V1'
            AND training_content_binding IS NOT NULL AND training_content_binding_hash IS NOT NULL
            AND training_content_interpretation_encrypted IS NOT NULL AND training_content_interpretation_hash IS NOT NULL
            AND aggregate_input_hash IS NOT NULL ORDER BY id FOR SHARE`)
        trainingResources=attempts.filter(row=>parentIds.has(row.composite_assessment_id)
          &&attemptParents.some(prior=>prior.id===row.id&&prior.composite_assessment_id===row.composite_assessment_id))
      }else trainingResources=authorizedParents
    }
    const distributionResources:Array<{id:string}>=[]
    if(isSjtDistribution){
      // Deterministic source SHARE locks, after Users and before root insertion.
      // A course grant, registry mapping or arbitrary release ID is not authority.
      for(const measurementReleaseId of [...scope.resourceKeys].sort()){
        try{
          const source=await readSjtEntryDistributionSource(tx,measurementReleaseId)
          if(source.measurementReleaseId!==measurementReleaseId)deny()
          distributionResources.push({id:source.measurementReleaseId})
        }catch(error){
          if(error instanceof SjtEntryAuthorityError)deny('该 SJT 版本不符合入口分发要求')
          throw error
        }
      }
    }
    let educationResources:Array<{id:string}>=[]
    if(isEducationDistribution){
      // Exact source assembly, C/P/R releases and declared stimulus assets all
      // require separate resource identities. No wildcard or fake Scale wrapper.
      const composites=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM composite_assessments
        WHERE id IN (${Prisma.join(scope.resourceKeys)}) AND status='PUBLISHED' ORDER BY id FOR SHARE`)
      const releases=await tx.$queryRaw<Array<{id:string;scope:unknown;layer:string}>>(Prisma.sql`SELECT id,scope,layer FROM measurement_content_releases
        WHERE id IN (${Prisma.join(scope.resourceKeys)}) AND status='PUBLISHED' ORDER BY id FOR SHARE`)
      if(releases.some(row=>row.layer!=='MEASUREMENT'&&(row.scope as {kind:string;product?:string}).kind!=='PLATFORM'
        &&(row.scope as {product?:string}).product!==scope.product))deny('私有参考与报告必须先在目标教育产品独立发布')
      const assets=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM stored_assets
        WHERE id IN (${Prisma.join(scope.resourceKeys)}) AND deleted_at IS NULL AND size_bytes>0 ORDER BY id FOR SHARE`)
      educationResources=[...composites,...releases,...assets]
    }
    const resources=isEducationDistribution?educationResources:isSjtDistribution?distributionResources:isScalePublic?await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM scales WHERE id IN (${Prisma.join(scope.resourceKeys)}) AND instrument_class='CUSTOM_DESCRIPTIVE' ORDER BY id FOR SHARE`)
      :isLibrary?await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM measurement_content_releases WHERE id IN (${Prisma.join(scope.resourceKeys)}) AND family='SCALE' AND layer='MEASUREMENT' AND status='PUBLISHED' ORDER BY id FOR SHARE`)
      :isPlatformSjt?registryResources:isPlatformReference
      ?await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM measurement_content_releases
        WHERE id IN (${Prisma.join(scope.resourceKeys)}) AND layer='MEASUREMENT' AND status<>'REVOKED' ORDER BY id FOR SHARE`)
      :scope.product==='TRAINING'?trainingResources
      :scope.resourceKind==='reference'
      ?await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM measurement_content_releases
        WHERE id IN (${Prisma.join(scope.resourceKeys)}) AND layer='MEASUREMENT'
          AND scope->>'kind'='PRIVATE' AND scope->>'product'='SURVEY'
          AND scope->>'resourceId'=${scope.scopeId} AND scope->>'ownerId'=${grant.subjectId} ORDER BY id FOR SHARE`)
      :await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM survey_wave_finals
        WHERE id IN (${Prisma.join(scope.resourceKeys)}) AND project_id=${scope.scopeId} ORDER BY id FOR SHARE`)
    if(resources.length!==scope.resourceKeys.length||resources.some(row=>!scope.resourceKeys.includes(row.id)))deny()
    // Check after all waits, not a pre-lock statement timestamp.
    const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
    assertProof(proof)
    if(!clock||grant.expiresAt<=clock.now||target!.expires_at&&target!.expires_at<=clock.now)deny()
    // TIMESTAMP(3) stores UTC wall time; never let the session zone cast an instant.
    const inserted=await tx.$queryRaw<GrantRow[]>(Prisma.sql`INSERT INTO content_capability_grants
      (id,subject_id,issuer_id,product,scope_kind,scope_id,resource_kind,resource_keys,capabilities,
       delegable_capabilities,remaining_delegation_depth,valid_from,expires_at,ancestry)
      VALUES (${input.requestId},${grant.subjectId},${actorId},${scope.product},${scope.scopeKind},${scope.scopeId},${scope.resourceKind},
       ${scope.resourceKeys}::text[],${grant.capabilities}::text[],${grant.delegableCapabilities}::text[],${grant.remainingDelegationDepth},
       (${grant.validFrom}::timestamptz AT TIME ZONE 'UTC'),(${grant.expiresAt}::timestamptz AT TIME ZONE 'UTC'),${[input.requestId]}::text[]) ON CONFLICT (id) DO NOTHING RETURNING *`)
    if(!inserted.length){
      const [existing]=await tx.$queryRaw<GrantRow[]>(Prisma.sql`SELECT * FROM content_capability_grants WHERE id=${input.requestId} FOR SHARE`)
      await recheckAfterWait(tx,proof,users)
      const audit=await tx.adminAuthorizationAudit.findUnique({where:{id:input.requestId}})
      if(!existing||existing.issuer_id!==actorId||existing.parent_grant_id!==null||existing.version!==1||existing.revoked_at||
        canonicalHash(comparable(storedInput(existing)))!==canonicalHash(comparable(grant))||!audit||audit.actorUserId!==actorId||
        audit.reason!==input.reason||audit.action!=='CONTENT_ROOT_GRANTED')throw new AdminPermissionError(409,'授权请求编号已用于其他内容或已撤销')
      return {grantId:input.requestId,version:1,changed:false}
    }
    await recheckAfterWait(tx,proof,users)
    await tx.adminAuthorizationAudit.create({data:{id:input.requestId,actorUserId:actorId,targetUserId:grant.subjectId,
      // entry is the legacy browser-entry enum (TRAINING/SURVEY). Education's
      // exact product/organization remains in the grant, not a false entry label.
      entry:isEducationDistribution?null:scope.product,action:'CONTENT_ROOT_GRANTED',version:1,reason:input.reason}})
    return {grantId:input.requestId,version:1,changed:true}
  },options)
}
/** Emergency system withdrawal works even for an expired/disabled recipient.
 * No descendant rewrite: existing consumer ancestry SHARE locks serialize it. */
export async function revokeAdminContentGrant(actorId:string,proof:AdminSessionProof,grantId:string,raw:unknown){
  uuid.parse(grantId);const input=adminContentRevokeRequestSchema.parse(raw);assertProof(proof)
  return prisma.$transaction(async tx=>{
    const {users}=await lockActor(tx,actorId,proof)
    const [grant]=await tx.$queryRaw<GrantRow[]>(Prisma.sql`SELECT * FROM content_capability_grants WHERE id=${grantId} FOR UPDATE`)
    await recheckAfterWait(tx,proof,users)
    if(!grant||!supported(storedInput(grant)))deny()
    if(grant.revoked_at){
      if(grant.version===input.expectedVersion+1&&grant.revoked_by===actorId&&grant.revoke_reason===input.reason)
        return {grantId,version:grant.version,changed:false}
      throw new AdminPermissionError(409,'授权已经撤销或版本已变化')
    }
    if(grant.version!==input.expectedVersion)throw new AdminPermissionError(409,'授权版本已变化')
    const count=await tx.$executeRaw(Prisma.sql`UPDATE content_capability_grants
      SET revoked_at=(clock_timestamp() AT TIME ZONE 'UTC'),revoked_by=${actorId},revoke_reason=${input.reason},version=version+1
      WHERE id=${grantId} AND version=${input.expectedVersion} AND revoked_at IS NULL`)
    if(count!==1)throw new AdminPermissionError(409,'授权版本已变化')
    await tx.adminAuthorizationAudit.create({data:{id:randomUUID(),actorUserId:actorId,targetUserId:grant.subject_id,
      entry:['SCHOOL','TEACHER'].includes(grant.product)?null:grant.product,action:'CONTENT_GRANT_REVOKED',version:input.expectedVersion+1,reason:JSON.stringify({grantId,reason:input.reason})}})
    return {grantId,version:input.expectedVersion+1,changed:true}
  },options)
}

/** Exact, bounded governance metadata only; never reads a FINAL or release body. */
export async function readAdminContentGrant(actorId:string,proof:AdminSessionProof,grantId:string){
  uuid.parse(grantId);assertProof(proof)
  return prisma.$transaction(async tx=>{
    const {users}=await lockActor(tx,actorId,proof)
    const [row]=await tx.$queryRaw<GrantRow[]>(Prisma.sql`SELECT * FROM content_capability_grants WHERE id=${grantId} FOR SHARE`)
    await recheckAfterWait(tx,proof,users)
    if(!row||!supported(storedInput(row)))deny()
    const grant=storedInput(row)
    return {grantId:row.id,version:row.version,parentGrantId:row.parent_grant_id,issuerId:row.issuer_id,
      ...comparable(grant),revokedAt:row.revoked_at?.toISOString()??null}
  },options)
}

/** Internal consumer reuse: call after the exact source/mapping locks. */
export {lockActor as lockCurrentContentSystemActor,recheckAfterWait as recheckContentSystemActorAfterWait}
