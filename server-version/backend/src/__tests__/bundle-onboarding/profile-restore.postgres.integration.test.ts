import {it,expect,vi} from 'vitest'
import {PrismaClient} from '@prisma/client'
import fs from 'node:fs'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {readReport} from '../../modules/bundle-product/analysis'
import {decryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import * as factsModule from '../../modules/assessment-bundle/report-facts'
const url=integrationDatabaseUrl('EVC_RESTORE_DATABASE_URL'),fixturePath=process.env.EVC_RUNTIME_FIXTURE
const test=url&&fixturePath?it:it.skip
test('reads the native-restored frozen EVC report without a second engine invocation',async()=>{
  process.env.DATABASE_URL=url!;requireIsolatedReleaseDatabase(url!)
  const fixture=JSON.parse(fs.readFileSync(fixturePath!,'utf8'))
  const db=new PrismaClient({datasources:{db:{url}}})
  const spy=vi.spyOn(factsModule,'projectBundleReportFacts').mockImplementation(()=>{throw new Error('RESTORE_MUST_NOT_RECOMPUTE')})
  try{
    const row=await db.bundleAnalysis.findUniqueOrThrow({where:{id:fixture.analysisId}})
    const facts=decryptCognitivePayload<any>(row.payloadEncrypted!)
    expect(canonicalHash(facts)).toBe(row.factsHash)
    const reopened=await readReport(fixture.attemptId,'student',fixture.analysisId)
    expect(reopened.factsHash).toBe(row.factsHash)
    expect((reopened.view as any).profileView).toMatchObject({state:'MATCHED',profileId:'P4',actions:[]})
    expect(spy).not.toHaveBeenCalled()
    expect(await db.bundleAnalysis.count({where:{attemptId:fixture.attemptId}})).toBe(2)
    expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:fixture.attemptId}})).toBe(3)
  }finally{spy.mockRestore();await db.$disconnect()}
},60000)
