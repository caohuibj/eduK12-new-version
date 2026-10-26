import {randomUUID} from 'node:crypto'
import {afterAll,describe,expect,it} from 'vitest'
const suite=process.env.PR356_APPROVAL_ISOLATED==='1'?describe:describe.skip
suite('immutable STANDARD approval entry intent and audit',()=>{
 let db:any
 afterAll(async()=>{if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 it('replays identical scopes, rejects changed request/scope, and audits actual TRAINING/SURVEY products',async()=>{
  const u=new URL(process.env.DATABASE_URL!)
  if(process.env.NODE_ENV!=='test'||!['localhost','127.0.0.1'].includes(u.hostname)||u.port!=='55439'||!/^\/pr356_approval_test_[a-f0-9]{10}$/.test(u.pathname))throw new Error('Dedicated cloned synthetic approval DB required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==5)throw new Error('Retained five-user synthetic baseline required')
  const system=await db.user.findFirstOrThrow({where:{username:{startsWith:'dot356-system-'}}})
  const service=await import('../../modules/survey/standard-triplet.service'),model=await import('../../modules/survey/standard-triplet.model')
  const existing=(await db.$queryRaw`SELECT * FROM survey_standard_releases WHERE state='ONLINE'`)[0]
  const event=(await db.$queryRaw`SELECT metadata FROM survey_events WHERE action='STANDARD_TRIPLET_APPROVED' AND metadata->>'releaseId'=${existing.id}`)[0].metadata
  const old={toolKey:existing.tool_key,...Object.fromEntries(Object.entries(existing.snapshot.parts).map(([axis,p]:any)=>[axis,p.hash])),requestId:existing.id,expectedCombinationHash:existing.combination_hash,reason:event.reason,allowedProducts:event.allowedProducts} as any
  const count=await db.surveyEvent.count(),trials=await db.$queryRaw`SELECT id FROM survey_standard_trials WHERE release_id=${existing.id}`
  expect((await service.approveStandardTriplet(system.id,old)).id).toBe(existing.id)
  expect((await service.approveStandardTriplet(system.id,{...old,requestId:randomUUID()})).id).toBe(existing.id)
  for(const requestId of [existing.id,randomUUID()])await expect(service.approveStandardTriplet(system.id,{...old,requestId,allowedProducts:['SURVEY']})).rejects.toMatchObject({statusCode:409})
  await expect(service.approveStandardTriplet(system.id,{...old,reason:'Changed intent'})).rejects.toMatchObject({statusCode:409})
  expect(await db.surveyEvent.count()).toBe(count)
  expect(await db.$queryRaw`SELECT id FROM survey_standard_trials WHERE release_id=${existing.id}`).toHaveLength(trials.length)
  const parts=model.sourceParts('academic_self_concept_chemistry_zh_cn','1.0.0'),selection={toolKey:'academic_self_concept_chemistry_zh_cn',...Object.fromEntries(parts.map(p=>[p.axis,p.hash]))} as any
  const preview=await service.previewStandardTriplet(db,system.id,selection),input={...selection,requestId:randomUUID(),expectedCombinationHash:preview.combinationHash,reason:'Synthetic both-entry approval',allowedProducts:['SURVEY','TRAINING']}
  await expect(service.approveStandardTriplet(system.id,{...input,requestId:existing.id})).rejects.toMatchObject({statusCode:409})
  const online=await service.approveStandardTriplet(system.id,input);expect(online.state,online.blockers.join()).toBe('ONLINE')
  const audits=await db.$queryRaw`SELECT action,metadata FROM survey_events WHERE metadata->>'releaseId'=${online.id} AND action IN ('STANDARD_TRIPLET_APPROVED','STANDARD_TRIAL_PASSED_ONLINE') ORDER BY created_at`
  expect(audits).toHaveLength(2)
  for(const audit of audits){expect(audit.metadata.scope).toBe('PRODUCT_ENTRIES');expect(audit.metadata.allowedProducts).toEqual(['SURVEY','TRAINING'])}
  const saved=await service.standardReleaseRow(db,online.id)
  expect(saved.snapshot.reference.approvals.at(-1).allowedProducts).toEqual(['SURVEY','TRAINING'])
  expect((await service.approveStandardTriplet(system.id,input)).latestTrial).toBe(online.latestTrial)
  await expect(service.approveStandardTriplet(system.id,{...input,allowedProducts:['SURVEY']})).rejects.toMatchObject({statusCode:409})
 },120000)
})
