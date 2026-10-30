import {readFileSync} from 'node:fs'
import {afterAll,it,expect} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {finishP6StartedConnection,type P6StartedConnection} from './education-package-completion.fixture'

const url=integrationDatabaseUrl('BUNDLE_PRODUCT_TEST_DATABASE_URL'),path=process.env.P6_PUBLIC_BUNDLE_CONTINUATIONS
const test=url&&path?it:it.skip
test('completes only the two already STARTED School/Teacher connections after U withdrawal; does not replay publication or START',async()=>{
 requireIsolatedReleaseDatabase(url!)
 const inputs=JSON.parse(readFileSync(path!,'utf8')) as P6StartedConnection[]
 expect(inputs.map(input=>input.product).sort()).toEqual(['SCHOOL','TEACHER'])
 for(const input of inputs){
  const [row]=await db.$queryRaw<Array<{revoked:boolean}>>`SELECT grant_row.revoked_at IS NOT NULL AS revoked
   FROM assessment_run_executions e JOIN assessment_run_tracks t ON t.id=e.track_id
   JOIN education_assessment_deliveries d ON t.resource_key='education-assessment:'||d.product||':'||d.organization_id||':'||d.id
   JOIN content_capability_grants grant_row ON grant_row.id=d.entry#>>'{educationOrigin,publicPackage,grantId}'
   WHERE e.id=${input.executionId} AND e.status IN ('STARTED','COMPLETED') AND e.runtime_binding_ref=${input.parentId}`
  expect(row?.revoked).toBe(true)
  expect(await finishP6StartedConnection(input)).toMatchObject({product:input.product,state:'READY'})
 }
},60000)
afterAll(async()=>{await db.$disconnect()})
