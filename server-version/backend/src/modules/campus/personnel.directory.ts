import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import type {AuthenticatedPrincipal} from '../../types'
import {assertPersonnelGovernor,decryptPersonnel,personnelFail,personnelHash} from './personnel.binding'
import {digestCampusStudentNumber} from './admission.service'
import {campusStudentReference} from './studentReference'

export const directoryQuery=z.object({
 kind:z.enum(['ALL','STUDENT','STAFF']).default('ALL'),
 activation:z.enum(['ALL','PENDING','ACTIVATED']).default('ALL'),
 membership:z.enum(['ALL','CURRENT','ENDED','NONE']).default('ALL'),
 classUnitId:z.string().guid().optional(),
 query:z.string().trim().max(40).default(''),
 sort:z.enum(['recent','pending']).default('recent'),
 page:z.coerce.number().int().min(1).max(100000).default(1),
 pageSize:z.coerce.number().int().min(1).max(50).default(25),
}).strict()
export const directoryEntryId=z.string().regex(/^[pu]\.[0-9a-f-]{36}$/i)
type Query=z.infer<typeof directoryQuery>
type Input={actor:AuthenticatedPrincipal;organizationId:string}
type Row={id:string;personId:string|null;userId:string|null;kind:'STUDENT'|'STAFF';persona:string;
 profileCipher:string|null;expected:boolean;classUnitId:string|null;className:string|null;grade:string|null;
 username:string|null;membership:'CURRENT'|'ENDED'|'NONE';admission:string|null;usable:boolean;createdAt:Date}

// A projection only: no account creation/backfill and no expected-account merge.
// Student enrollment is an independent source: pending students have no membership yet.
function subjects(org:string){return Prisma.sql`
 WITH subjects AS (
  SELECT 'p.'||p.id AS id,p.id AS person_id,p.claimed_user_id AS user_id,p.kind,p.persona,
    p.profile_cipher,p.expected_user_id IS NOT NULL AS expected,p.class_unit_id,p.created_at,p.number_digest
  FROM campus_personnel p WHERE p.organization_id=${org}
  UNION ALL
  SELECT 'u.'||u.id,NULL,u.id,CASE WHEN u.role='STUDENT' THEN 'STUDENT' ELSE 'STAFF' END,
    CASE WHEN u.role='STUDENT' THEN 'STUDENT' WHEN EXISTS(
      SELECT 1 FROM organization_memberships m JOIN organization_persona_grants pg
       ON pg.membership_id=m.id AND pg.organization_id=m.organization_id
      WHERE m.organization_id=${org} AND m.user_id=u.id AND pg.persona='COUNSELOR' AND pg.revoked_at IS NULL
       AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
    ) THEN 'COUNSELOR' ELSE 'TEACHER' END,
    NULL,FALSE,COALESCE(e.class_unit_id,sc.class_unit_id),COALESCE(e.created_at,first_m.created_at),e_digest.student_no_digest
  FROM users u JOIN campus_accounts ca ON ca.user_id=u.id
  LEFT JOIN campus_student_enrollments e ON e.user_id=u.id AND e.organization_id=${org}
  LEFT JOIN campus_student_eligibilities e_digest ON e_digest.id=e.eligibility_id AND e_digest.organization_id=${org}
  LEFT JOIN LATERAL (SELECT m.created_at FROM organization_memberships m
    WHERE m.organization_id=${org} AND m.user_id=u.id ORDER BY m.created_at,m.id LIMIT 1) first_m ON TRUE
  LEFT JOIN LATERAL (SELECT a.class_unit_id FROM organization_student_class_assignments a
    JOIN organization_memberships m ON m.id=a.membership_id AND m.organization_id=a.organization_id
    WHERE a.organization_id=${org} AND m.user_id=u.id AND a.is_primary=TRUE
     AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
     AND a.valid_from<=statement_timestamp() AND (a.valid_until IS NULL OR a.valid_until>statement_timestamp())
    ORDER BY a.valid_from DESC,a.id LIMIT 1) sc ON TRUE
  WHERE u.account_domain='SCHOOL' AND u.role IN ('STUDENT','TEACHER','ADMIN')
   AND (e.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM organization_memberships m
    WHERE m.organization_id=${org} AND m.user_id=u.id AND (m.org_role='ORG_ADMIN' OR EXISTS(
     SELECT 1 FROM organization_persona_grants pg WHERE pg.membership_id=m.id AND pg.organization_id=m.organization_id
       AND pg.persona IN ('STUDENT','TEACHER','COUNSELOR')))))
   AND NOT EXISTS(SELECT 1 FROM campus_personnel p WHERE p.organization_id=${org} AND p.claimed_user_id=u.id)
 ), directory AS (
  SELECT s.*,ca.login_name AS username,unit.name AS class_name,grade.name AS grade,
   CASE WHEN m.id IS NULL THEN 'NONE' WHEN m.valid_from<=statement_timestamp()
     AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp()) THEN 'CURRENT' ELSE 'ENDED' END AS membership,
   e.status AS admission,
   COALESCE(u.is_active AND NOT u.is_frozen AND NOT u.must_change_password
     AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
     AND (u.role<>'TEACHER' OR u.teacher_approved),FALSE) AS usable
  FROM subjects s
  LEFT JOIN users u ON u.id=s.user_id
  LEFT JOIN campus_accounts ca ON ca.user_id=u.id
  LEFT JOIN LATERAL (SELECT m.id,m.valid_from,m.valid_until FROM organization_memberships m
    WHERE m.organization_id=${org} AND m.user_id=s.user_id AND m.valid_from<=statement_timestamp()
    ORDER BY (m.valid_until IS NULL OR m.valid_until>statement_timestamp()) DESC,m.valid_from DESC,m.id DESC LIMIT 1) m ON TRUE
  LEFT JOIN campus_student_enrollments e ON e.organization_id=${org} AND e.user_id=s.user_id
  LEFT JOIN organization_units unit ON unit.organization_id=${org} AND unit.id=s.class_unit_id
  LEFT JOIN organization_units grade ON grade.organization_id=${org} AND grade.id=unit.parent_unit_id
 )`}
const selection=Prisma.sql`id,person_id AS "personId",user_id AS "userId",kind,persona,
 profile_cipher AS "profileCipher",expected,class_unit_id AS "classUnitId",class_name AS "className",grade,
 username,membership,admission,usable,created_at AS "createdAt"`
function project(org:string,row:Row){
 const profile=row.profileCipher?decryptPersonnel(org,row.personId!,row.profileCipher):null
 return {id:row.id,personId:row.personId,kind:row.kind,persona:row.persona,source:row.personId?'IMPORTED':'EXISTING',
  number:profile?.number??null,name:profile?.name??null,username:row.username,
  reference:row.kind==='STUDENT'&&row.userId?campusStudentReference(org,row.userId):null,
  activation:row.userId?'ACTIVATED':row.expected?'OWNER_CONFIRMATION':'PENDING',
  account:row.userId?(row.usable?'USABLE':'UNAVAILABLE'):'NOT_CREATED',membership:row.membership,
  admission:row.kind==='STUDENT'?(row.admission??'NOT_REGISTERED'):'NOT_APPLICABLE',
  classUnitId:row.classUnitId,className:row.className,grade:row.grade,createdAt:row.createdAt,
  existingAccount:row.expected}
}
export async function listPersonnelDirectory(input:Input&{query:Query}){
 return prisma.$transaction(async tx=>{
  await assertPersonnelGovernor(tx,input.actor,input.organizationId)
  const {query:q,organizationId:org}=input
  const number=/^[a-zA-Z0-9_-]{2,40}$/.test(q.query)?q.query.toUpperCase():null
  const studentDigest=number?digestCampusStudentNumber(org,number):null
  const staffDigest=number?personnelHash(['staff-number',org,number]):null
  const conditions=Prisma.sql`
   (${q.kind}='ALL' OR d.kind=${q.kind})
   AND (${q.activation}='ALL' OR (${q.activation}='ACTIVATED')=(d.user_id IS NOT NULL))
   AND (${q.membership}='ALL' OR d.membership=${q.membership})
   AND (${q.query}='' OR d.number_digest=CASE WHEN d.kind='STUDENT' THEN ${studentDigest} ELSE ${staffDigest} END
     OR strpos(lower(COALESCE(d.username,'')),lower(${q.query}))>0)
   AND (${q.classUnitId??null}::text IS NULL OR d.class_unit_id=${q.classUnitId??null}
     OR EXISTS(SELECT 1 FROM organization_staff_class_assignments a JOIN organization_memberships m
       ON m.id=a.membership_id AND m.organization_id=a.organization_id
       WHERE a.organization_id=${org} AND m.user_id=d.user_id AND a.class_unit_id=${q.classUnitId??null}
       AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
       AND a.valid_from<=statement_timestamp() AND (a.valid_until IS NULL OR a.valid_until>statement_timestamp()))
     OR (d.user_id IS NULL AND EXISTS(SELECT 1 FROM campus_personnel_assignments a WHERE a.organization_id=${org}
       AND a.person_id=d.person_id AND a.class_unit_id=${q.classUnitId??null})))`
  const cte=subjects(org)
  const count=await tx.$queryRaw<Array<{total:number}>>(Prisma.sql`${cte} SELECT COUNT(*)::int AS total FROM directory d WHERE ${conditions}`)
  const rows=await tx.$queryRaw<Row[]>(Prisma.sql`${cte} SELECT ${selection} FROM directory d WHERE ${conditions}
    ORDER BY CASE WHEN ${q.sort}='pending' AND d.user_id IS NULL THEN 0 ELSE 1 END,d.created_at DESC,d.id
    LIMIT ${q.pageSize} OFFSET ${(q.page-1)*q.pageSize}`)
  return {list:rows.map(row=>project(org,row)),total:count[0].total,page:q.page,pageSize:q.pageSize,batchImport:true}
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:15000})
}
export async function readPersonnelDirectoryEntry(input:Input&{entryId:string}){
 return prisma.$transaction(async tx=>{
  await assertPersonnelGovernor(tx,input.actor,input.organizationId)
  const rows=await tx.$queryRaw<Row[]>(Prisma.sql`${subjects(input.organizationId)} SELECT ${selection} FROM directory WHERE id=${input.entryId}`)
  if(!rows[0])return personnelFail('PERSONNEL_NOT_FOUND',404)
  const row=rows[0],org=input.organizationId
  const classes=await tx.$queryRaw<Array<{className:string;grade:string;role:string;pending:boolean}>>`
   SELECT unit.name AS "className",grade.name AS grade,a.staff_role AS role,FALSE AS pending
   FROM organization_staff_class_assignments a JOIN organization_memberships m ON m.id=a.membership_id AND m.organization_id=a.organization_id
   JOIN organization_units unit ON unit.id=a.class_unit_id AND unit.organization_id=a.organization_id
   JOIN organization_units grade ON grade.id=unit.parent_unit_id AND grade.organization_id=unit.organization_id
   WHERE a.organization_id=${org} AND m.user_id=${row.userId}
    AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
    AND a.valid_from<=statement_timestamp() AND (a.valid_until IS NULL OR a.valid_until>statement_timestamp())
   UNION ALL
   SELECT unit.name,grade.name,a.staff_role,TRUE FROM campus_personnel_assignments a
   JOIN organization_units unit ON unit.id=a.class_unit_id AND unit.organization_id=a.organization_id
   JOIN organization_units grade ON grade.id=unit.parent_unit_id AND grade.organization_id=unit.organization_id
   WHERE a.organization_id=${org} AND a.person_id=${row.personId} AND ${row.userId}::text IS NULL
   ORDER BY grade,"className",role
  `
  return {...project(org,row),classes}
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:15000})
}
