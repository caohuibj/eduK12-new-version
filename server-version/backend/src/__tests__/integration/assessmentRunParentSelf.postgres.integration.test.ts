import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createMembership, createOrganization, grantPersona } from '../../modules/organization/service'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { RunResourceAuthorityRegistry, type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

const DB_URL = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`
const key=(label:string)=>`parent-self-${label}-${suffix}-${randomUUID()}`

async function user(label:string,role:UserRole){
  return db.user.create({data:{username:`parent-self-${label}-${suffix}-${randomUUID().slice(0,8)}`,passwordHash:'test-only',role}})
}

const policy={
  subjectRoles:['PARENT'],respondentRoles:['PARENT'],relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],
  analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:'ORG_SELF_V1',minimumRespondents:null,
}
const adapter:RunResourceAuthorityAdapter={
  family:'BUNDLE',
  capabilities:{transactionMode:'TRANSACTIONAL_DB',startMode:'TRANSACTIONAL',supportsLookupByOperationKey:false,supportsSafeCancel:true,finalAuthority:'CANONICAL_RUNTIME',runtimeBindingKind:'COMPOSITE',runV1Enabled:true},
  async resolveExact(ref){return {family:ref.family,key:ref.key,version:ref.version,scientificMaturity:'PILOT',applicabilityHash:canonicalHash({ref,policy}),...policy,runtimeLaunchTarget:{kind:'COMPOSITE',ref:'parent-self-test-composite'}}},
}
const registry=new RunResourceAuthorityRegistry([adapter])

suite('Organization Run parent SELF population',()=>{
  beforeAll(async()=>{db=new PrismaClient({datasources:{db:{url:DB_URL!}}});await db.$connect()})
  afterAll(async()=>db.$disconnect())

  it('deduplicates one parent across multiple active children',async()=>{
    const owner=await user('owner',UserRole.ADMIN)
    const parent=await user('parent',UserRole.PARENT)
    const studentA=await user('student-a',UserRole.STUDENT)
    const studentB=await user('student-b',UserRole.STUDENT)
    const org=await createOrganization({name:`Parent SELF ${suffix}`,meta:{actorUserId:owner.id,commandKey:key('org')}})
    for(const [student,label] of [[studentA,'a'],[studentB,'b']] as const){
      const membership=await createMembership({organizationId:org.organization.id,userId:student.id,meta:{actorUserId:owner.id,commandKey:key('m-'+label)}})
      await grantPersona({organizationId:org.organization.id,membershipId:membership.id,persona:'STUDENT',meta:{actorUserId:owner.id,commandKey:key('p-'+label)}})
      await db.parentStudentRelationship.create({data:{
        parentUserId:parent.id,studentUserId:student.id,status:'ACTIVE',approvedByUserId:owner.id,approvedAt:new Date(),
      }})
    }
    const run=await createAssessmentRunDraft({organizationId:org.organization.id,name:'parent-self',createdByUserId:owner.id})
    await addAssessmentRunTrackDraft({
      organizationId:org.organization.id,runId:run.id,
      resource:{family:'BUNDLE',key:'parent-self-demo',version:'1.0.0'},
      subjectSelector:{kind:'RELATED_PARENT'},respondentSelector:{kind:'RELATED_PARENT'},requestedPolicy:policy,
    })
    const published=await publishAssessmentRun({organizationId:org.organization.id,runId:run.id,actorUserId:owner.id,expectedVersion:2,resourceRegistry:registry})
    expect(published.executionCount).toBe(1)
    const actors=await db.$queryRaw<Array<{provenanceKind:string;actorRole:string;count:number}>>`
      SELECT "provenance_kind" AS "provenanceKind","actor_role" AS "actorRole",COUNT(*)::int AS "count"
      FROM "assessment_run_actor_snapshots" WHERE "run_id"=${run.id}
      GROUP BY "provenance_kind","actor_role"
    `
    expect(actors).toEqual([{provenanceKind:'EXTERNAL_PARENT',actorRole:'PARENT',count:1}])
  })
})
