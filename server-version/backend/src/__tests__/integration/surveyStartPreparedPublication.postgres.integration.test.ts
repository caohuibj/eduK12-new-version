import { randomUUID,randomBytes } from 'node:crypto'
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest'
const hashProbe=vi.hoisted(()=>({
  inTransaction:false,snapshotHashesInside:0,snapshotHashesOutside:0,
  canonicalHash:undefined as undefined|((value:unknown)=>string),
}))
vi.mock('../../modules/assessment-runtime/canonical',async importOriginal=>{
  const actual=await importOriginal<typeof import('../../modules/assessment-runtime/canonical')>()
  hashProbe.canonicalHash=actual.canonicalHash as (value:unknown)=>string
  return {...actual,canonicalHash:(value:unknown)=>{
    if(value&&typeof value==='object'&&(value as {runtimeStatus?:string}).runtimeStatus==='SURVEY_FINAL_V1'){
      if(hashProbe.inTransaction)hashProbe.snapshotHashesInside++
      else hashProbe.snapshotHashesOutside++
    }
    return actual.canonicalHash(value as never)
  }}
})
import { prisma as db } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import { hashResearchCredential } from '../../modules/survey/identity.service'
import { joinLinkedStudy,startLinkedWave,startSingleUnlinkedWave } from '../../modules/survey/admission.service'

const DB_URL=integrationDatabaseUrl('SURVEY_IDEMPOTENCY_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=DB_URL?describe:describe.skip
if(DB_URL){
  const url=new URL(DB_URL)
  if(!['localhost','127.0.0.1'].includes(url.hostname)||!/test|ci/i.test(url.pathname)){
    if(process.env.CI!=='true')throw new Error('survey prepared-publication coverage requires an isolated loopback test database')
  }
}

const secret=()=>randomBytes(32).toString('base64url')
const hashSnapshot=(value:unknown)=>{
  if(!hashProbe.canonicalHash)throw new Error('canonical hash instrumentation was not initialized')
  return hashProbe.canonicalHash(value)
}
function resetProbes(){
  hashProbe.inTransaction=false
  hashProbe.snapshotHashesInside=0
  hashProbe.snapshotHashesOutside=0
}
function observeTransactions(){
  const original=db.$transaction.bind(db)
  return vi.spyOn(db,'$transaction').mockImplementation((async(fn:any,options:any)=>
    original(async(tx:any)=>{
      const previous=hashProbe.inTransaction
      hashProbe.inTransaction=true
      try{return await fn(tx)}finally{hashProbe.inTransaction=previous}
    },options)) as any)
}
function frozenSnapshot(projectId:string,waveId:string,collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES',marker:string){
  return {
    schemaVersion:1,purpose:'RESEARCH_ONLY',projectId,waveId,collectionMode,consentVersion:1,
    linkageNoticeConfirmed:collectionMode==='LINKED_WAVES',consentDigest:'synthetic-consent',units:[],
    runtimeStatus:'SURVEY_FINAL_V1',syntheticLargeBody:(marker+'-').repeat(24_000),
  }
}
async function insertPublication(input:{id:string;projectId:string;waveId:string;collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES';version:number;invalidDigest?:boolean}){
  const compiledSnapshot=frozenSnapshot(input.projectId,input.waveId,input.collectionMode,`publication-${input.version}`)
  const definitionDigest=input.invalidDigest?'f'.repeat(64):hashSnapshot(compiledSnapshot)
  await db.surveyPublication.create({data:{id:input.id,projectId:input.projectId,definitionDigest,
    compiledSnapshot:compiledSnapshot as any,consentVersion:1,version:input.version}})
  return compiledSnapshot
}
async function fixture(collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES'){
  const suffix=randomUUID(),owner=await db.user.create({data:{
    id:`survey-prefetch-owner-${suffix}`,username:`survey-prefetch-owner-${suffix}`,
    passwordHash:'SYNTHETIC NONLOGIN',role:'TEACHER',accountDomain:'SURVEY',
  }})
  const alias=`pref-${suffix.replace(/-/g,'').slice(0,12)}`
  await db.surveyAccount.create({data:{userId:owner.id,loginName:alias,normalizedLogin:alias}})
  const project=await db.surveyProject.create({data:{id:randomUUID(),publicId:randomUUID(),ownerUserId:owner.id,
    title:`Prepared snapshot ${suffix}`,collectionMode,status:'ACTIVE'}})
  const waveId=randomUUID(),publicationId=randomUUID()
  await insertPublication({id:publicationId,projectId:project.id,waveId,collectionMode,version:1})
  const wave=await db.surveyWave.create({data:{id:waveId,projectId:project.id,ordinal:1,title:'Synthetic START wave',
    status:'OPEN',consentText:'Synthetic consent',consentVersion:1,linkageNoticeConfirmed:collectionMode==='LINKED_WAVES',
    publicationId,quotaStarts:null,startsCount:0,allowNewParticipants:true}})
  const entryToken=secret()
  await db.surveyEntryToken.create({data:{id:randomUUID(),projectId:project.id,waveId,
    tokenHash:hashResearchCredential(entryToken),expiresAt:new Date(Date.now()+3_600_000)}})
  return {projectId:project.id,publicId:project.publicId!,waveId:wave.id,entryToken}
}

suite('Survey START prepared-publication behavior on real PostgreSQL',()=>{
  const oldWorkspace=process.env.SURVEY_WORKSPACE_ENABLED
  const oldPublication=process.env.SURVEY_PUBLICATION_ENABLED
  beforeAll(()=>{
    process.env.SURVEY_WORKSPACE_ENABLED='true'
    process.env.SURVEY_PUBLICATION_ENABLED='true'
  })
  afterAll(async()=>{
    if(oldWorkspace===undefined)delete process.env.SURVEY_WORKSPACE_ENABLED
    else process.env.SURVEY_WORKSPACE_ENABLED=oldWorkspace
    if(oldPublication===undefined)delete process.env.SURVEY_PUBLICATION_ENABLED
    else process.env.SURVEY_PUBLICATION_ENABLED=oldPublication
    await db.$disconnect()
  })

  it('fails closed when the wave switches to a bad publication after prefetch and before locked admission',async()=>{
    const f=await fixture('SINGLE_UNLINKED'),badPublicationId=randomUUID()
    const original=db.surveyWave.findFirst.bind(db.surveyWave)
    let switched=false,prefetchReads=0
    const txSpy=observeTransactions()
    const findSpy=vi.spyOn(db.surveyWave,'findFirst').mockImplementation(async(args:any)=>{
      const row=await original(args)
      if(args?.select?.publication?.select?.compiledSnapshot&&!switched){
        switched=true;prefetchReads++
        await insertPublication({id:badPublicationId,projectId:f.projectId,waveId:f.waveId,
          collectionMode:'SINGLE_UNLINKED',version:2,invalidDigest:true})
        // Published Waves are immutable through the public write path. Temporarily
        // disable only that guard in this disposable integration DB to model a
        // stale/corrupt publication pointer arriving between the pre-read and lock.
        await db.$transaction(async tx=>{
          await tx.$executeRaw`ALTER TABLE "survey_waves" DISABLE TRIGGER "survey_wave_published_guard"`
          try{await tx.surveyWave.update({where:{id:f.waveId},data:{publicationId:badPublicationId}})}
          finally{await tx.$executeRaw`ALTER TABLE "survey_waves" ENABLE TRIGGER "survey_wave_published_guard"`}
        })
      }
      return row
    })
    resetProbes()
    try{
      await expect(startSingleUnlinkedWave({publicId:f.publicId,waveId:f.waveId,entryToken:f.entryToken,
        consentVersion:1,consent:true,operationKey:secret(),accessCredential:secret()}))
        .rejects.toMatchObject({statusCode:409})
      expect(switched).toBe(true)
      expect(prefetchReads).toBe(1)
      expect(hashProbe.snapshotHashesOutside).toBe(1)
      expect(hashProbe.snapshotHashesInside).toBe(1)
      expect(await db.surveyWaveAttempt.count({where:{waveId:f.waveId}})).toBe(0)
      expect((await db.surveyWave.findUniqueOrThrow({where:{id:f.waveId}})).startsCount).toBe(0)
    }finally{
      findSpy.mockRestore();txSpy.mockRestore()
    }
  },60000)

  it('unlinked operation/session replay stays idempotent without a locked snapshot read or rehash',async()=>{
    const f=await fixture('SINGLE_UNLINKED'),operationKey=secret(),accessCredential=secret()
    const original=db.surveyWave.findFirst.bind(db.surveyWave)
    let prefetchReads=0
    const findSpy=vi.spyOn(db.surveyWave,'findFirst').mockImplementation(async(args:any)=>{
      if(args?.select?.publication?.select?.compiledSnapshot)prefetchReads++
      return original(args)
    })
    const txSpy=observeTransactions()
    resetProbes()
    try{
      const input={publicId:f.publicId,waveId:f.waveId,entryToken:f.entryToken,consentVersion:1,consent:true,operationKey,accessCredential}
      const first=await startSingleUnlinkedWave(input)
      expect(hashProbe.snapshotHashesOutside).toBe(1)
      expect(hashProbe.snapshotHashesInside).toBe(0)
      const replay=await startSingleUnlinkedWave(input)
      expect(replay).toMatchObject({attemptId:first.attemptId,recovered:true})
      expect(prefetchReads).toBe(2) // one verified pre-read per request; no second hash under the lock
      expect(hashProbe.snapshotHashesOutside).toBe(2)
      expect(hashProbe.snapshotHashesInside).toBe(0)
      const attempt=await db.surveyWaveAttempt.findFirstOrThrow({where:{waveId:f.waveId}})
      expect(attempt.operationKeyHash).toBe(hashResearchCredential(operationKey))
      expect(attempt.sessionHash).toBe(hashResearchCredential(accessCredential))
      expect((await db.surveyWave.findUniqueOrThrow({where:{id:f.waveId}})).startsCount).toBe(1)
      expect(await db.surveyWaveAttempt.count({where:{waveId:f.waveId}})).toBe(1)
    }finally{
      findSpy.mockRestore();txSpy.mockRestore()
    }
  },60000)

  it('linked admission replay retains one attempt without a locked snapshot read or rehash',async()=>{
    const f=await fixture('LINKED_WAVES')
    const enrollment=await joinLinkedStudy({publicId:f.publicId,waveId:f.waveId,entryToken:f.entryToken,consentVersion:1,consent:true})
    const original=db.surveyWave.findFirst.bind(db.surveyWave)
    let prefetchReads=0
    const findSpy=vi.spyOn(db.surveyWave,'findFirst').mockImplementation(async(args:any)=>{
      if(args?.select?.publication?.select?.compiledSnapshot)prefetchReads++
      return original(args)
    })
    const txSpy=observeTransactions()
    resetProbes()
    try{
      const input={publicId:f.publicId,waveId:f.waveId,researchCode:enrollment.researchCode,
        accessCredential:enrollment.accessCredential,consentVersion:1,consent:true}
      const first=await startLinkedWave(input)
      expect(first).toMatchObject({attemptId:enrollment.attemptId,recovered:true})
      expect(hashProbe.snapshotHashesOutside).toBe(1)
      expect(hashProbe.snapshotHashesInside).toBe(0)
      const replay=await startLinkedWave(input)
      expect(replay).toMatchObject({attemptId:first.attemptId,recovered:true})
      expect(prefetchReads).toBe(2)
      expect(hashProbe.snapshotHashesOutside).toBe(2)
      expect(hashProbe.snapshotHashesInside).toBe(0)
      expect((await db.surveyWave.findUniqueOrThrow({where:{id:f.waveId}})).startsCount).toBe(1)
      expect(await db.surveyWaveAttempt.count({where:{waveId:f.waveId}})).toBe(1)
    }finally{
      findSpy.mockRestore();txSpy.mockRestore()
    }
  },60000)
})
