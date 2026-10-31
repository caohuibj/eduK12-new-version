import {randomUUID} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {readReportingArtifactRecord,createOrReuseReportingArtifact} from '../../modules/reporting/artifact'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {lockTeacherDisclosure} from '../../modules/huiteacher/privacyReleaseV2.service'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite=url&&process.env.TEACHER_GROUP_TRANSACTION_CONTINUATION?describe:describe.skip
suite('Teacher group artifact transaction boundary',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);await db.$connect()})
 afterAll(async()=>{await db.$disconnect()})
 it('cannot persist an artifact or audit after its disclosure-lock transaction expires',async()=>{
  const proof=JSON.parse(await readFile('/tmp/teacher-native-group-leaves/proof.json','utf8'))
  const stored=await readReportingArtifactRecord(proof.artifacts.COGNITIVE)
  if(stored.analysisKind!=='GROUP')throw Error('Retained real GROUP artifact required')
  const artifactId=randomUUID(),generatedAt=new Date(),analysisIdentityHash=canonicalHash({syntheticTransactionCounterexample:artifactId})
  const payload={...stored.artifactPayload,artifactId,analysisIdentityHash,generatedAt:generatedAt.toISOString()}
  const input={organizationId:stored.organizationId,cohortSnapshotId:stored.cohortSnapshotId!,specId:stored.specId,analysisIdentityHash,artifactPayload:payload,snapshotHash:canonicalHash(payload),generatedByUserId:stored.generatedByUserId,generatedAt}
  let attempted=false,persistResolved=false,persistenceErrorCode:string|null=null
  await expect(db.$transaction(async tx=>{
   await lockTeacherDisclosure(tx,stored.organizationId)
   // Controlled 200ms pause in this isolated counterexample only. The real
   // Prisma deadline releases the advisory xact lock before persistence.
   await new Promise(resolve=>setTimeout(resolve,200))
   attempted=true
   try{await createOrReuseReportingArtifact(input,tx);persistResolved=true}
   catch(error){persistenceErrorCode=(error as {code?:string}).code??null;throw error}
  },{timeout:100})).rejects.toMatchObject({code:'P2028'})
  expect(attempted).toBe(true);expect(persistResolved).toBe(false);expect(persistenceErrorCode).toBe('P2028')
  const [artifacts]=await db.$queryRaw<Array<{n:number}>>`SELECT COUNT(*)::int AS n FROM reporting_analysis_artifacts WHERE id=${artifactId}`
  const [audits]=await db.$queryRaw<Array<{n:number}>>`SELECT COUNT(*)::int AS n FROM organization_governance_audits WHERE target_id=${artifactId}`
  expect(artifacts.n).toBe(0);expect(audits.n).toBe(0)
  await db.$transaction(tx=>lockTeacherDisclosure(tx,stored.organizationId))
  await writeFile('/tmp/teacher-group-transaction-boundary/proof.json',JSON.stringify({passed:true,actualPostgres:true,actualPrismaTransactionExpiry:true,persistAttemptedAfterExpiry:attempted,persistenceErrorCode,artifactRows:artifacts.n,auditRows:audits.n,advisoryLockReacquired:true,finalsReplayed:0,canonicalResultsDecoded:0,productionAccessed:false},null,2))
 })
})
