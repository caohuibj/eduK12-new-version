import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest'
import {PrismaClient} from '@prisma/client'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {storeSharedCognitiveRuntime,loadSharedCognitiveRuntime} from '../../modules/assessment-runtime/shared-cognitive-runtime'
import {decryptControlReference} from '../../modules/assessment-runtime/control-reference-codec'
import {encryptCognitivePayload,encryptCompactCognitivePayload,decryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
import {parseCognitiveResultSnapshot} from '../../modules/cognitive/v2/result-snapshot'
const url=integrationDatabaseUrl('REPORT_OUTBOX_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,sample:any
suite('shared Cognitive scientific runtime and compatible result',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED','true');vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED','true');db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect();sample=JSON.parse(readFileSync(resolve(__dirname,'../fixtures/cognitive-storage.synthetic.json'),'utf8'))})
 afterAll(async()=>{await db?.$disconnect();vi.unstubAllEnvs()})
 it('shares a complete verified version, preserves per-attempt freeze time and reads the old format',async()=>{
  const first=await storeSharedCognitiveRuntime(sample.runtime),secondSnapshot={...sample.runtime,frozenAt:'2026-10-17T00:00:00.000Z'},second=await storeSharedCognitiveRuntime(secondSnapshot)
  expect(first.length).toBeLessThan(180);const a=decryptControlReference(first)as any,b=decryptControlReference(second)as any;expect(a.artifactHash).toBe(b.artifactHash)
  const rows=await db.$queryRaw<any[]>`SELECT count(*)::int AS n FROM assessment_runtime_artifacts WHERE artifact_hash=${a.artifactHash}`;expect(rows).toEqual([{n:1}])
  const decoded=await loadSharedCognitiveRuntime(first),again=await loadSharedCognitiveRuntime(second)
  expect(JSON.parse(JSON.stringify(decoded.snapshot))).toEqual(sample.runtime);expect(JSON.parse(JSON.stringify(again.snapshot))).toEqual(secondSnapshot)
  expect(JSON.parse(JSON.stringify((await loadSharedCognitiveRuntime(encryptCognitivePayload(sample.runtime))).snapshot))).toEqual(sample.runtime)
  ;(decoded.config as any).totalTrials=999999;expect((await loadSharedCognitiveRuntime(first)).config).toEqual(sample.runtime.config)
  vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED','false');expect((await loadSharedCognitiveRuntime(first)).snapshot?.frozenAt).toBe(sample.runtime.frozenAt);vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED','true')
 })
 it('does not publish an existence cache hit from a rolled-back scientific append',async()=>{
  let encrypted='';await expect(db.$transaction(async tx=>{encrypted=await storeSharedCognitiveRuntime({...sample.runtime,configVersion:'rollback-'+randomUUID()},tx);throw new Error('SYNTHETIC_ROLLBACK')})).rejects.toThrow('SYNTHETIC_ROLLBACK')
  await expect(loadSharedCognitiveRuntime(encrypted)).rejects.toThrow('missing')
 })
 it('compresses one authoritative Cognitive result without changing any report field',()=>{
  const compact=encryptCompactCognitivePayload(sample.result),legacy=encryptCognitivePayload(sample.result)
  expect(parseCognitiveResultSnapshot(decryptCognitivePayload(compact))).toEqual(sample.result)
  expect(parseCognitiveResultSnapshot(decryptCognitivePayload(legacy))).toEqual(sample.result)
  expect(compact.length).toBeLessThan(legacy.length/2)
 })
})
