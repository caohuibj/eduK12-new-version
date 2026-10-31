import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {UserRole} from '@prisma/client'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'

/** Prepare one real same-version reanalysis for the separate native restore test. */
async function main() {
  const fixturePath=process.env.EVC_RUNTIME_FIXTURE!
  requireIsolatedReleaseDatabase(process.env.DATABASE_URL!)
  const fixture=JSON.parse(readFileSync(fixturePath,'utf8')) as {attemptId:string;signingKey:string}
  const attemptId=fixture.attemptId
  process.env.BUNDLE_REVIEW_SIGNING_KEY=fixture.signingKey
  process.env.BUNDLE_PRODUCTS_ENABLED='true'

  const {prisma}=await import('../../config/database')
  let closeQueues:((doNotWaitJobs?:boolean)=>Promise<void>)|undefined
  try {
    ;({closeQueues}=await import('../../config/queue'))
    const parent=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({
      where:{id:attemptId},include:{compositeAssessment:{select:{createdBy:true}}},
    })
    assert.equal(parent.status,'COMPLETED','EVC parent must already be completed')
    const ownerId=parent.compositeAssessment.createdBy
    assert.ok(ownerId,'Completed EVC parent must retain its source owner')
    const initial=await prisma.bundleAnalysis.findFirstOrThrow({
      where:{attemptId,attemptEpoch:parent.attemptEpoch,requestKey:'INITIAL'},
    })
    assert.equal(initial.status,'READY','EVC INITIAL analysis must already be READY')
    assert.ok(initial.factsHash,'READY INITIAL analysis must retain its facts hash')
    const originalHash=initial.factsHash
    assert.equal(await prisma.bundleAnalysis.count({where:{attemptId}}),1,'Prepare only a fresh single-analysis EVC fixture')
    assert.equal(await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:attemptId}}),3,'EVC fixture must retain three real unit snapshots')

    const {loadPackage}=await import('../../modules/assessment-bundle/onboarding/loader')
    const {packageEntry}=await import('../../modules/assessment-bundle/onboarding/catalog')
    const {BundleDefinitionProvider}=await import('../../modules/bundle-product/definition-provider')
    const {createBundleProductService}=await import('../../modules/bundle-product/service')
    const {reanalyze}=await import('../../modules/bundle-product/analysis')
    const pack=loadPackage(resolve(__dirname,'../../modules/assessment-bundle/packages/learning_motivation_math_support/0.1.1'))
    const provider=new BundleDefinitionProvider([packageEntry(pack)])
    const product=createBundleProductService(provider)
    const appended=await reanalyze({userId:ownerId,role:UserRole.ADMIN},attemptId,{
      requestId:randomUUID(),targetBundleKey:'learning_motivation_math_support',targetBundleVersion:'0.1.1',
      reason:'Native restore fixture: explicit same-version reanalysis',previousAnalysisId:initial.id,
    },provider,product.eligible)
    assert.equal(appended.status,'READY','Explicit same-version reanalysis must be READY')
    assert.ok(appended.analysisId&&appended.analysisId!==initial.id,'Reanalysis must append a new real analysis')
    const stored=await prisma.bundleAnalysis.findUniqueOrThrow({where:{id:appended.analysisId}})
    assert.equal(stored.attemptId,attemptId,'Appended analysis must belong to the original EVC attempt')
    assert.equal(stored.status,'READY','Appended analysis must be durably READY')
    assert.equal(stored.previousAnalysisId,initial.id,'Appended analysis must retain the INITIAL history pointer')
    assert.equal((await prisma.bundleAnalysis.findUniqueOrThrow({where:{id:initial.id}})).factsHash,originalHash,'Original INITIAL facts must remain unchanged')
    assert.equal(await prisma.bundleAnalysis.count({where:{attemptId}}),2,'Prepared EVC fixture must have exactly two analyses')
    assert.equal(await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:attemptId}}),3,'Reanalysis must preserve the three unit snapshots')

    writeFileSync(fixturePath,JSON.stringify({...fixture,analysisId:stored.id},null,2)+'\n')
    console.info('EVC restore fixture prepared: two analyses and three unit snapshots')
  } finally {
    try { await closeQueues?.(true) }
    finally { await prisma.$disconnect() }
  }
}

if(require.main===module) {
  main().catch((error:unknown)=>{
    console.error('EVC restore fixture preparation failed:',error instanceof assert.AssertionError?error.message:error instanceof Error?error.name:'UnknownError')
    process.exitCode=1
  })
}
