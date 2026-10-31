import {randomUUID,createHash} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import {afterAll,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {listTeacherFormGroupVersions,readTeacherFormGroupVersion} from '../../modules/huiteacher/groupReport.service'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
if(url)requireIsolatedReleaseDatabase(url)
process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED='true'
process.env.REPORT_PRIVACY_TEACHER_V2_ENABLED='true'
afterAll(async()=>{await db.$disconnect()})

it.skipIf(!url||!process.env.TEACHER_GROUP_HISTORY_FIXTURE)('pages immutable Form pointers with equal microsecond timestamps without rereading FINALs',async()=>{
 const fixture=JSON.parse(readFileSync(process.env.TEACHER_GROUP_HISTORY_FIXTURE!,'utf8'))
 const key={organizationId:fixture.organizationId,actorUserId:fixture.actorUserId,eventId:fixture.eventId,formId:fixture.formId}
 const [original]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM education_report_release_records
  WHERE organization_id=${key.organizationId} AND source_run_id=${fixture.runId}
   AND report_kind='TEACHER_ADULT_FORM_GROUP' AND report_projection->>'eventId'=${key.eventId}
   AND report_projection->>'formId'=${key.formId} ORDER BY released_at,id LIMIT 1`
 expect(original).toBeDefined()
 const membership=await db.organizationMembership.findFirstOrThrow({where:{organizationId:key.organizationId,userId:key.actorUserId}})
 // A new synthetic grant leaves the preceding fixture's revoked grant intact.
 const grant=await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:key.organizationId,
  membershipId:membership.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:key.actorUserId}})
 let finalQueries=0
 db.$use(async(params,next)=>{
  if(params.action.toLowerCase().includes('queryraw')&&JSON.stringify(params.args,(_,value)=>typeof value==='bigint'?value.toString():value).includes('huiteacher_form_finals'))finalQueries++
  return next(params)
 })
 try{
  const [{stamp}]=await db.$queryRaw<Array<{stamp:string}>>`SELECT to_char(
   date_trunc('second',GREATEST(now(),MAX(released_at)))+interval '1 second 123456 microseconds',
   'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS stamp FROM education_report_release_records WHERE organization_id=${key.organizationId}`
  const ids=Array.from({length:105},()=>randomUUID()).sort().reverse(),distractor=randomUUID()
  // These are synthetic history pointers to one existing released projection,
  // not 105 new generations, answer sets or recalculated statistics.
  for(const id of [...ids,distractor]){
   const scope=createHash('sha256').update(id).digest('hex')
   await db.$executeRaw`INSERT INTO education_report_release_records
    (id,organization_id,report_scope_key,policy_snapshot_id,source_run_id,source_spec_id,report_kind,audience,
     report_digest,effective_population_digest,legacy_source,released_by_user_id,released_at,report_projection)
    SELECT ${id},organization_id,${scope},policy_snapshot_id,source_run_id,source_spec_id,report_kind,audience,
     report_digest,effective_population_digest,legacy_source,released_by_user_id,${stamp}::timestamptz,
     CASE WHEN ${id===distractor} THEN jsonb_set(report_projection,'{eventId}',to_jsonb(${randomUUID()}::text)) ELSE report_projection END
    FROM education_report_release_records WHERE id=${original.id}`
  }
  const first=await listTeacherFormGroupVersions(key)
  expect(first.versions.map(row=>row.versionId)).toEqual(ids.slice(0,100))
  expect(first.nextCursor).toEqual({releasedAt:stamp,versionId:ids[99]})
  const second=await listTeacherFormGroupVersions(key,first.nextCursor!)
  const selected=[...first.versions,...second.versions].filter(row=>ids.includes(row.versionId)).map(row=>row.versionId)
  expect(selected).toEqual(ids)
  expect(new Set(selected).size).toBe(105)
  expect(second.versions.some(row=>row.versionId===distractor)).toBe(false)
  const report=await readTeacherFormGroupVersion({...key,versionId:original.id})
  expect(report.versionId).toBe(original.id)
  expect(finalQueries).toBe(0)
  if(process.env.TEACHER_GROUP_HISTORY_PROOF)writeFileSync(process.env.TEACHER_GROUP_HISTORY_PROOF,JSON.stringify({
   passed:true,syntheticPointers:105,pages:2,equalTimestampMicroseconds:stamp.slice(-7,-1),uniquePointers:selected.length,
   otherEventExcluded:true,existingVersionReadable:true,finalQueries,regeneratedReports:0,productionAccessed:false},null,2))
 }finally{
  await db.educationProductRoleGrant.update({where:{id:grant.id},data:{revokedAt:new Date(),revokedByUserId:key.actorUserId}})
 }
},30_000)
