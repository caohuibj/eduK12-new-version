import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {PrismaClient} from '@prisma/client'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {assertCurrentRunStartAuthority} from '../../modules/assessment-run/startAuthority'
import {assertEducationAssessmentExecutionSource} from '../../modules/assessment-run/educationAssessmentExecution'
const url=integrationDatabaseUrl('PR363_SOURCE_SQL_DATABASE_URL')
const suite=url?describe:describe.skip
let db:PrismaClient
suite('PR363 migrated source SQL with restricted runtime role',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect()})
 it('uses a non-owner role and only the classified metadata table permissions',async()=>{
  const [role]=await db.$queryRaw<Array<{superuser:boolean;owner:boolean;readable:boolean;writable:boolean}>>`
   SELECT r.rolsuper AS superuser,c.relowner=r.oid AS owner,
    has_table_privilege(current_user,'education_assessment_deliveries','SELECT') AS readable,
    has_table_privilege(current_user,'education_assessment_deliveries','INSERT,UPDATE') AS writable
   FROM pg_roles r CROSS JOIN pg_class c WHERE r.rolname=current_user AND c.oid='education_assessment_deliveries'::regclass`
  expect(role).toEqual({superuser:false,owner:false,readable:true,writable:true})
 })
 it('parses the complete education account-mode query and refuses a nonexistent respondent',async()=>{
  await expect(db.$transaction(tx=>assertCurrentRunStartAuthority(tx,randomUUID(),{accountMode:'DETECT_EDUCATION_LIBRARY'})))
   .rejects.toMatchObject({code:'RUN_ACCOUNT_INACTIVE'})
 })
 it('parses the source binding query and refuses a nonexistent execution instead of authorizing by family',async()=>{
  await expect(db.$transaction(tx=>assertEducationAssessmentExecutionSource(tx,{executionId:randomUUID(),compositeId:randomUUID(),purpose:'NEW_START'})))
   .rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_EXECUTION_BINDING'})
 })
})
