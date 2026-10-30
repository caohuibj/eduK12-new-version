import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_SURVEY_COGNITIVE_TECHNICAL_BUDGET==='1'?describe:describe.skip
suite('Survey exact frozen trial count database boundary on separate technical fixture',()=>{
 let db:any,legacy:any,native:any,before=0
 const observations:any[]=[]
 beforeAll(async()=>{
  const url=process.env.PRECISE_SURVEY_COGNITIVE_DATABASE_URL;if(!url)throw Error('Explicit technical fixture required');requireIsolatedReleaseDatabase(url)
  const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'||parsed.pathname!=='/precise_survey_cognitive_budget_test_20261030'||parsed.username!=='precise_task1_runtime')throw Error('Separate restricted runtime technical clone required')
  db=(await import('../../config/database')).prisma
  expect(await db.$queryRaw`SELECT current_user,current_setting('session_replication_role') AS replication`).toEqual([{current_user:'precise_task1_runtime',replication:'origin'}])
  legacy=await db.surveyCognitiveSession.findFirstOrThrow({where:{slotKey:'go',status:'COMPLETED',result:{trialCount:120}}})
  native=await db.surveyCognitiveSession.findFirstOrThrow({where:{slotKey:'exact_reaction',status:'COMPLETED',result:{trialCount:8}}})
  before=await db.surveyCognitiveResult.count();expect(before).toBe(2)
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_SURVEY_COGNITIVE_TECHNICAL_EVIDENCE??'/tmp/survey-cognitive-budget-technical.json',JSON.stringify({productionAccessed:false,
   scope:'Database rejection only. Original 120-trial technical fixture from the repository and cloned real-HTTP native 8-trial result, not a new authoring permission or real-user grant.',observations},null,2)+'\n')
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 async function rejectCount(row:any,count:number){
  const zero='0'.repeat(64)
  await expect(db.$executeRaw`INSERT INTO survey_cognitive_results(id,session_id,project_id,wave_id,attempt_id,publication_id,slot_key,epoch,measurement_digest,submission_id,payload_hash,raw_hash,raw_cipher,result_hash,result_cipher,trial_count)
   VALUES(${randomUUID()},${row.id},${row.projectId},${row.waveId},${row.attemptId},${row.publicationId},${row.slotKey},${row.epoch},${row.measurementDigest},${'rejected-budget-'+randomUUID()},${zero},${zero},'REJECTED SYNTHETIC INSERT',${zero},'REJECTED SYNTHETIC INSERT',${count})`).rejects.toMatchObject({meta:{code:'23514'}})
 }
 it('retains exact legacy 120 and native 8 boundaries inside the absolute 1000 bound',async()=>{
  for(const count of [119,121])await rejectCount(legacy,count)
  for(const count of [7,9])await rejectCount(native,count)
  expect(await db.surveyCognitiveResult.count()).toBe(before)
  expect((await db.surveyCognitiveResult.findUniqueOrThrow({where:{sessionId:legacy.id}})).trialCount).toBe(120)
  expect((await db.surveyCognitiveResult.findUniqueOrThrow({where:{sessionId:native.id}})).trialCount).toBe(8)
  observations.push({legacyWrongCountsRejected23514:[119,121],nativeWrongCountsRejected23514:[7,9],rejectedRowsPersisted:0,originalResultsUnchanged:true})
 })
})
