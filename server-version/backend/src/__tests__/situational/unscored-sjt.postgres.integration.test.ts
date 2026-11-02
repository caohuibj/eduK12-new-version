import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import sd from '../../modules/situational/instruments/u4-cjx01-sd/0.3.0/instrument.json'
import wd from '../../modules/situational/instruments/u4-cjx01-wd/0.3.0/instrument.json'
import scientific from '../../modules/situational/instruments/u4-cjx01-sd/0.3.0/scientific.json'
import {instrumentSourceSchema,projectSituationPackage} from '../../modules/situational/onboarding/schema'
import {decryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {createSjtNativeStagedFinalFixture} from '../fixtures/sjt-native-staged.fixture'
import {hashSituationRuntimeDefinition} from '../../modules/situational/situation-runtime-definition'
import {compositeItemSlotKey} from '../../modules/assessment-runtime/slot-set'
const url=integrationDatabaseUrl('U4_SJT_INTEGRATION_DATABASE_URL','SITUATIONAL_BUNDLE_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
// Registry publication is injected only inside this isolated test. Committed content remains DRAFT.
const packages=[sd,wd].map(content=>({...projectSituationPackage(instrumentSourceSchema.parse({content,publication:{releaseStatus:'DRAFT'},scientific})),releaseStatus:'PUBLISHED' as const}))
suite('unscored CJX01 actual PostgreSQL frozen FINAL',()=>{
 let db:PrismaClient,runtime:typeof import('../../modules/situational/situational-runtime.service'),final:typeof import('../../modules/situational/situational-final-submit.service'),composite:typeof import('../../modules/composite/composite.service')
 const users:string[]=[],attempts:string[]=[],parents:string[]=[],courses:string[]=[]
 beforeAll(async()=>{
  process.env.DATABASE_URL=url!;requireIsolatedReleaseDatabase(url!);process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  vi.doMock('../../config/database',()=>({prisma:db}))
  vi.doMock('../../modules/situational/situation-package.registry',async()=>{
   const actual=await vi.importActual<typeof import('../../modules/situational/situation-package.registry')>('../../modules/situational/situation-package.registry')
   return {...actual,listSituationPackages:()=>[...actual.listSituationPackages().filter(p=>!packages.some(f=>f.key===p.key)),...packages],getSituationPackage:(key:string,version:string)=>packages.find(p=>p.key===key&&p.instrumentVersion===version)??actual.getSituationPackage(key,version)}
  })
  runtime=await import('../../modules/situational/situational-runtime.service');final=await import('../../modules/situational/situational-final-submit.service');composite=await import('../../modules/composite/composite.service')
 },120000)
 afterAll(async()=>{if(db){await db.situationalAttempt.deleteMany({where:{id:{in:attempts}}});await db.compositeAssessment.deleteMany({where:{id:{in:parents}}});await db.course.deleteMany({where:{id:{in:courses}}});await db.user.deleteMany({where:{id:{in:users}}});await db.$disconnect()}},60000)
 async function user(){const id=randomUUID();await db.user.create({data:{id,username:'synthetic-u4-sjt-'+id,passwordHash:'synthetic-only',role:'TEACHER',teacherApproved:true}});users.push(id);return id}
 it.each(packages)('persists $key complete, U and N paths, resumes exact facts, and rejects cross-owner/replay changes',async pkg=>{
  const userId=await user(),other=await user()
  for(const kind of ['COMPLETE','U','N']){
   const g=pkg.goldenCases.find(g=>kind==='COMPLETE'?g.expected.unscored!.responseStatus==='COMPLETE':g.responses.at(-1)!.responseValue===kind)!
   const started=await runtime.startSituationalAttempt(userId,{instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion});attempts.push(started.attemptId)
   const capture=createSjtNativeStagedFinalFixture(started.attemptId,g.name,{package:pkg,definitionHash:hashSituationRuntimeDefinition(pkg.definition)} as never)
   const payload={...capture.finalInput,attemptId:started.attemptId,userId,submissionId:randomUUID()}
   await expect(final.submitSituationalAttemptFinal({...payload,userId:other})).rejects.toThrow()
   const results=await Promise.all([final.submitSituationalAttemptFinal(payload),final.submitSituationalAttemptFinal(payload)])
   expect(results.map(r=>r.replayed).sort()).toEqual([false,true])
   expect(results[0].result).toMatchObject({mode:'UNSCORED',metrics:[],quality:{status:'unscored'},responseStatus:g.expected.unscored!.responseStatus})
   expect(results[0].result!.narrative!.paragraphs).toEqual(g.expected.unscored!.paragraphs)
   const row=await db.situationalAttempt.findUniqueOrThrow({where:{id:started.attemptId},include:{rawSubmission:true}})
   expect(row.status).toBe('COMPLETED');expect(row.scorerKey).toBe('situational.unscored')
   expect(await db.situationalRawSubmission.count({where:{attemptId:row.id}})).toBe(1)
   expect(decryptUnifiedRuntimePayload<any>(row.rawSubmission!.payloadEncrypted).responses).toEqual(capture.responses)
   const resumed=await runtime.resumeSituationalAttempt(row.id,userId)
   expect(resumed.result).toEqual(results[0].result);expect(resumed.canonicalResult!.core.metrics).toEqual([])
   expect(resumed.attempt.taskSatisfaction).toBe(kind==='COMPLETE'?'SATISFIED':'NOT_SATISFIED')
   await expect(final.submitSituationalAttemptFinal({...payload,responses:[]})).rejects.toThrow()
  }
 },60000)
 it('rejects incomplete and off-path payloads before durable writes',async()=>{
  const pkg=packages[0],userId=await user(),g=pkg.goldenCases.find(g=>g.expected.unscored!.responseStatus==='COMPLETE')!
  const started=await runtime.startSituationalAttempt(userId,{instrumentKey:pkg.key});attempts.push(started.attemptId)
  const payload={attemptId:started.attemptId,userId,submissionId:randomUUID(),attemptEpoch:1,definitionHash:started.instrument.definitionHash,responses:g.responses.slice(0,1)}
  await expect(final.submitSituationalAttemptFinal(payload)).rejects.toThrow()
  await expect(final.submitSituationalAttemptFinal({...payload,responses:[{...g.responses[0],responseValue:'U'},...g.responses.slice(1)]})).rejects.toThrow()
  expect(await db.situationalRawSubmission.count({where:{attemptId:started.attemptId}})).toBe(0)
 })
})
