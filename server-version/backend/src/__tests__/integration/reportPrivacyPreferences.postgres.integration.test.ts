import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {createAssessmentRunDraft} from '../../modules/assessment-run/repository'
import {readReportPrivacyPreferences,saveReportPrivacyPreferences,
  readReportPrivacyPolicyState} from '../../modules/report-privacy/preferences.service'
import {freezePrivacyForRunPublication,readFrozenPrivacyForRun}
  from '../../modules/report-privacy/snapshot.service'
import {STANDARD} from '../../modules/report-privacy/registry'
import type {AuthenticatedPrincipal} from '../../types'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=url&&process.env.DATABASE_URL===url?describe:describe.skip
const actor=(id:string):AuthenticatedPrincipal=>({
  userId:id,username:'privacy_test_user',role:'TEACHER',
  platformRole:'STANDARD',accountDomain:'SCHOOL',tokenVersion:0,mustChangePassword:false,
})
let db:PrismaClient
const start=async()=>{
  const id=randomUUID()
  return db.user.create({data:{id,username:'privacy_'+id.replace(/-/g,''),
    accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true,passwordHash:'synthetic'}})
}

suite('ReportPrivacy PR1 persistence / uniqueness / immutable snapshot — real isolated PostgreSQL',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(url!)
    db=new PrismaClient({datasources:{db:{url:url!}}})
    await db.$connect()
  })
  afterAll(async()=>{await db?.$disconnect()})
  it('persists publisher and mandatory school preferences with revisions, idempotence and live product authorization',async()=>{
    const admin=await start()
    const school=await db.organization.create({data:{
      id:randomUUID(),name:'PR1 privacy teacher '+randomUUID(),
      productDomain:'SCHOOL',createdByUserId:admin.id}})
    const member=await db.organizationMembership.create({data:{
      id:randomUUID(),organizationId:school.id,userId:admin.id,orgRole:'ORG_ADMIN'}})
    await db.educationProductEntitlement.create({data:{
      organizationId:school.id,product:'HUITEACHER',status:'ACTIVE',grantedByUserId:admin.id}})
    const grant=await db.educationProductRoleGrant.create({data:{
      id:randomUUID(),organizationId:school.id,membershipId:member.id,
      product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:admin.id}})
    const input={actor:actor(admin.id),organizationId:school.id,
      product:'HUITEACHER' as const,scenario:'TEACHER_STUDENT_EVALUATION' as const}
    const initial=await readReportPrivacyPreferences(input)
    expect(initial.selected).toEqual(STANDARD)
    expect(initial.disclosureState).toBe('LEGACY_STRICT')
    expect(initial.catalog.reportConsumerActive).toBe(false)

    const firstRequest={scope:'MY' as const,expectedRevision:0,
      preset:'CUSTOM' as const,
      options:{...STANDARD,withholdSmallCells:true},requestKey:randomUUID()}
    const first=await saveReportPrivacyPreferences({...input,request:firstRequest})
    expect(first).toMatchObject({saved:true,revision:1,reportConsumerActive:false})
    await expect(saveReportPrivacyPreferences({...input,request:firstRequest}))
      .resolves.toMatchObject({revision:1})

    const [a,b]=await Promise.allSettled([
      saveReportPrivacyPreferences({...input,request:{
        scope:'MY',expectedRevision:1,preset:'ENHANCED',requestKey:randomUUID()}}),
      saveReportPrivacyPreferences({...input,request:{
        scope:'MY',expectedRevision:1,preset:'STANDARD',requestKey:randomUUID()}}),
    ])
    expect([a,b].filter(x=>x.status==='fulfilled')).toHaveLength(1)
    expect([a,b].filter(x=>x.status==='rejected')).toHaveLength(1)
    const got=await readReportPrivacyPreferences(input)
    expect(got.mine?.revision).toBe(2)
    expect(got.selectedPreset).toMatch(/STANDARD|ENHANCED/)

    await saveReportPrivacyPreferences({...input,request:{
      scope:'SCHOOL_DEFAULT',expectedRevision:0,preset:'ENHANCED',
      requestKey:randomUUID()}})
    await saveReportPrivacyPreferences({...input,request:{
      scope:'SCHOOL_MINIMUM',expectedRevision:0,
      options:{withholdSmallCells:true},requestKey:randomUUID()}})
    const effective=await readReportPrivacyPreferences(input)
    expect(effective.locks.withholdSmallCells).toBe('SCHOOL_MINIMUM')
    expect(effective.effective.withholdSmallCells).toBe(true)
    expect(effective.revisions.schoolDefault).toBe(1)

    const draft=await createAssessmentRunDraft({organizationId:school.id,
      name:'privacy frozen draft',createdByUserId:admin.id})
    const preflight=await readReportPrivacyPolicyState({...input,runId:draft.id})
    expect(preflight.disclosureState).toBe('LEGACY_STRICT')
    await expect(db.$transaction(tx=>freezePrivacyForRunPublication(tx,{
      ...input,runId:draft.id,expectedPrivacyFingerprint:'0'.repeat(64),
    }))).rejects.toMatchObject({code:'PRIVACY_PREFERENCE_CHANGED'})
    const frozen=await db.$transaction(tx=>freezePrivacyForRunPublication(tx,{
      ...input,runId:draft.id,expectedPrivacyFingerprint:preflight.fingerprint,
    }))
    expect(frozen.effectiveHash).toMatch(/^[a-f0-9]{64}$/)
    const before=await db.$transaction(tx=>readFrozenPrivacyForRun(tx,{
      organizationId:school.id,runId:draft.id,product:'HUITEACHER',
      scenario:'TEACHER_STUDENT_EVALUATION'}))
    expect(before.mode).toBe('FROZEN_V1')
    await expect(db.educationReportPolicySnapshot.update({
      where:{id:frozen.id},data:{origin:'TAMPER'},
    })).rejects.toThrow()
    await expect(db.$transaction(tx=>freezePrivacyForRunPublication(tx,{
      ...input,runId:draft.id,expectedPrivacyFingerprint:preflight.fingerprint,
    }))).rejects.toMatchObject({code:'PRIVACY_RUN_ALREADY_FROZEN'})
    await expect(readReportPrivacyPreferences({...input,product:'HUISCHOOL',
      scenario:'SCHOOL_GENERAL_EDUCATION_GROUP'}))
      .rejects.toMatchObject({code:'PRIVACY_CAMPUS_PUBLISHER_REQUIRED'})
    await db.educationProductRoleGrant.update({where:{id:grant.id},
      data:{revokedAt:new Date()}})
    await expect(saveReportPrivacyPreferences({...input,request:firstRequest}))
      .rejects.toMatchObject({code:'PRIVACY_TEACHER_PUBLISHER_REQUIRED'})
  })

  it('unique school-default and school-minimum storage is independent of publisher scope',async()=>{
    const user=await start()
    const org=await db.organization.create({data:{id:randomUUID(),
      name:'PR1 privacy other '+randomUUID(),productDomain:'SCHOOL',createdByUserId:user.id}})
    const member=await db.organizationMembership.create({data:{
      id:randomUUID(),organizationId:org.id,userId:user.id,orgRole:'ORG_ADMIN'}})
    await db.educationProductEntitlement.create({data:{
      organizationId:org.id,product:'HUITEACHER',status:'ACTIVE',grantedByUserId:user.id}})
    await db.educationProductRoleGrant.create({data:{
      id:randomUUID(),organizationId:org.id,membershipId:member.id,
      product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:user.id}})
    const input={actor:actor(user.id),organizationId:org.id,
      product:'HUITEACHER' as const,scenario:'TEACHER_ADULT_FORM_GROUP' as const}
    const requests=[randomUUID(),randomUUID()].map(requestKey=>
      saveReportPrivacyPreferences({...input,request:{
        scope:'SCHOOL_DEFAULT' as const,expectedRevision:0,preset:'STANDARD' as const,requestKey}}))
    const values=await Promise.allSettled(requests)
    expect(values.filter(x=>x.status==='fulfilled')).toHaveLength(1)
    const rows=await db.educationReportPrivacyPreference.findMany({where:{
      organizationId:org.id,product:'HUITEACHER',scenario:'TEACHER_ADULT_FORM_GROUP',
      ownerScopeKind:'SCHOOL_DEFAULT',
    }})
    expect(rows).toHaveLength(1)
    expect(rows[0].ownerUserId).toBeNull()
  })
})
