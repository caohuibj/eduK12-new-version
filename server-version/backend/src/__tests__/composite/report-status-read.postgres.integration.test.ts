import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma} from '../../config/database'
import {getCompositeReportStatus} from '../../modules/composite/composite.service'
import {createReportOutboxFixture} from '../integration/report-outbox-fixture'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'

const url=integrationDatabaseUrl('REPORT_STATUS_INTEGRATION_DATABASE_URL','RELEASE_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip

suite('participant report status authoritative joined SQL / PostgreSQL',()=>{
 beforeAll(()=>{requireIsolatedReleaseDatabase(url!)})
 afterAll(async()=>{
  await(await import('../../config/queue')).closeQueues(true)
  await prisma.$disconnect()
 })
 const fixture=async()=>{
  const f=await createReportOutboxFixture(prisma)
  await prisma.compositeAssessmentAttempt.update({where:{id:f.parent.id},data:{asyncReportEpoch:1}})
  const job=await prisma.compositeReportJob.create({data:{attemptId:f.parent.id,attemptEpoch:1,
   slotSetHash:f.parent.frozenActiveSlotSetHash!,status:'PENDING',budgetHeld:true}})
  return {...f,job}
 }
 it('uses one SQL per poll and immediately observes PENDING, PROCESSING, READY and replacement state',async()=>{
  const f=await fixture()
  for(const state of ['PENDING','PROCESSING','READY','FAILED'] as const){
   await prisma.compositeReportJob.update({where:{id:f.job.id},data:{status:state,
    completedAt:state==='READY'?new Date('2026-11-13T00:00:00Z'):null,
    budgetHeld:state==='PENDING'||state==='PROCESSING',
    leaseToken:state==='PROCESSING'?'synthetic-lease':null,
    leaseExpiresAt:state==='PROCESSING'?new Date(Date.now()+30_000):null,
    reportEncrypted:state==='READY'?'opaque-unused-report':null,
    aggregateInputHash:state==='READY'?'a'.repeat(64):null}})
   const query=vi.spyOn(prisma,'$queryRaw'),parent=vi.spyOn(prisma.compositeAssessmentAttempt,'findUnique'),job=vi.spyOn(prisma.compositeReportJob,'findUnique')
   try{
    const status=await getCompositeReportStatus(f.parent.id,{userId:f.participant.id})
    expect(status.reportStatus).toMatchObject({state,jobId:f.job.id})
    if(state==='READY')expect(status.reportStatus.completedAt).toEqual(new Date('2026-11-13T00:00:00Z'))
    expect(query).toHaveBeenCalledTimes(1)
    expect(parent).not.toHaveBeenCalled();expect(job).not.toHaveBeenCalled()
   }finally{query.mockRestore();parent.mockRestore();job.mockRestore()}
  }
 })
 it('rechecks user and anonymous ownership on every poll',async()=>{
  const f=await fixture()
  await expect(getCompositeReportStatus(f.parent.id,{userId:f.owner.id})).rejects.toMatchObject({statusCode:403})
  await expect(getCompositeReportStatus(f.parent.id,{recoveryTokenHash:'proof'})).rejects.toMatchObject({statusCode:403})
  await prisma.compositeAssessmentAttempt.update({where:{id:f.parent.id},data:{userId:null,recoveryTokenHash:'proof'}})
  await expect(getCompositeReportStatus(f.parent.id,{recoveryTokenHash:'proof'})).resolves.toMatchObject({attemptId:f.parent.id})
  await expect(getCompositeReportStatus(f.parent.id,{userId:f.participant.id})).rejects.toMatchObject({statusCode:403})
  await expect(getCompositeReportStatus(f.parent.id,{recoveryTokenHash:'wrong-proof'})).rejects.toMatchObject({statusCode:403})
 })
 it('never pairs a READY job from another epoch or disabled async generation with the current attempt',async()=>{
  const f=await fixture()
  await prisma.compositeReportJob.create({data:{attemptId:f.parent.id,attemptEpoch:2,
   slotSetHash:f.parent.frozenActiveSlotSetHash!,status:'READY',reportEncrypted:'opaque-unused-report',aggregateInputHash:'a'.repeat(64)}})
  expect((await getCompositeReportStatus(f.parent.id,{userId:f.participant.id})).reportStatus)
   .toMatchObject({state:'PENDING',jobId:f.job.id})
  await prisma.compositeReportJob.update({where:{id:f.job.id},data:{status:'READY',budgetHeld:false,reportEncrypted:'opaque-unused-report',aggregateInputHash:'a'.repeat(64)}})
  await prisma.compositeAssessmentAttempt.update({where:{id:f.parent.id},data:{asyncReportEpoch:null}})
  expect((await getCompositeReportStatus(f.parent.id,{userId:f.participant.id})).reportStatus)
   .toMatchObject({state:'WAITING',jobId:null})
 })
})
