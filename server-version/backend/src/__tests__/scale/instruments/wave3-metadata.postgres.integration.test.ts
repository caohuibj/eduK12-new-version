import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { requireDisposableBatchUrl, assertNonOwner, materializeBatchEntry, sha256 } from '../../../../scripts/scale-content-batch'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SCALE_INSTRUMENT_SOURCE as cfsr } from '../../../modules/scale/instruments/cfsr12_zh_cn_research/1.0.1/instrument'
import { SCALE_INSTRUMENT_SOURCE as ebq } from '../../../modules/scale/instruments/ebq16_zh_cn_research/1.0.1/instrument'
import { SCALE_INSTRUMENT_SOURCE as mpmi } from '../../../modules/scale/instruments/mpmi_s22_zh_cn_research/1.0.0/instrument'
import { buildScaleResult } from '../../../modules/scale/scale-result'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { materializeScaleInstrumentContent } from '../../../modules/scale/onboarding/materialize'

const url=process.env.SCALE_BATCH_DATABASE_URL
const suite=url?describe:describe.skip
suite('Wave3 restored synthetic snapshots and metadata/report increments',{timeout:30_000},()=>{
 const db=new PrismaClient({datasources:{db:{url:requireDisposableBatchUrl(url)}}})
 let actorUserId:string
 const previous=new Map<string,{id:string;hash:string;report:string;axis:string;sourceHash:string;source:unknown}>()
 beforeAll(async()=>{
  await assertNonOwner(db)
  actorUserId=(await db.user.findUniqueOrThrow({where:{username:'scale-batch-pilot-admin-20261026'}})).id
  for(const source of [cfsr,ebq]){
   const row=await db.scale.findUniqueOrThrow({where:{code:source.identity.instrumentKey}})
   const snaps=await db.$queryRaw<Array<{axis_hash:string;source_hash:string;source_snapshot:unknown}>>`SELECT axis_hash,source_hash,source_snapshot FROM scale_axis_snapshots WHERE scale_id=${row.id}`
   expect(snaps).toHaveLength(1)
   previous.set(source.identity.instrumentKey,{id:row.id,hash:row.definitionHash!,report:(row.definition as any).report.reportVersion,axis:snaps[0].axis_hash,sourceHash:snaps[0].source_hash,source:snaps[0].source_snapshot})
  }
 })
 afterAll(()=>db.$disconnect())
 it('starts from the actual prior two-tool synthetic dump under a non-owner role',async()=>{
  expect(await db.scale.count()).toBe(2)
  expect((await assertNonOwner(db)).role).toBe('scale_app')
  expect(previous.get(cfsr.identity.instrumentKey)!.report).toBe('1.0.1')
  expect(previous.get(ebq.identity.instrumentKey)!.report).toBe('1.0.2')
 })
 for(const source of [cfsr,ebq]){
  const key=source.identity.instrumentKey
  it(key+' updates only catalog/report axes and preserves the old snapshot',async()=>{
   const old=previous.get(key)!
   const raw=readFileSync(resolve('src/modules/scale/instruments',key,source.identity.instrumentVersion,'source.json'))
   const entry={...source.identity,sourceSha256:sha256(raw)}
   const first=await materializeBatchEntry(db,process.cwd(),entry,actorUserId)
   expect(first.created).toBe(false)
   const row=await db.scale.findUniqueOrThrow({where:{code:key}})
   expect(row.definitionHash).toBe(old.hash)
   expect(hashScaleDefinition(source.executable!.definition)).toBe(old.hash)
   const snaps=await db.$queryRaw<Array<{axis_hash:string;source_hash:string;source_snapshot:any;axes:any}>>`SELECT axis_hash,source_hash,source_snapshot,axes FROM scale_axis_snapshots WHERE scale_id=${old.id}`
   expect(snaps).toHaveLength(2)
   const retained=snaps.find(s=>s.axis_hash===old.axis)!
   expect(retained.source_hash).toBe(old.sourceHash)
   expect(retained.source_snapshot).toEqual(old.source)
   const current=snaps.find(s=>s.axis_hash!==old.axis)!
   expect(current.axes.reportVersion).toBe(source.executable!.definition.report.reportVersion)
   expect(current.axes.catalogManifestVersion).toBe(2)
   expect(current.source_snapshot.catalog.construct.constructOverlapTags).toEqual(source.catalog.construct.constructOverlapTags)
   expect(current.source_snapshot.catalog.construct.constructOverlapTags).toHaveLength(49)
   expect(row.status).toBe('DRAFT');expect(row.visibility).toBe('HIDDEN')
   await materializeBatchEntry(db,process.cwd(),entry,actorUserId)
   expect((await db.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM scale_axis_snapshots WHERE scale_id=${old.id}`)[0].n).toBe(2n)
  })
  it(key+' rebuilds readable report from the persisted definition with its new report version',async()=>{
   const row=await db.scale.findUniqueOrThrow({where:{code:key}})
   const fixture=source.executable!.goldenCases.find(f=>f.name.startsWith('mixed'))!
   const r=buildScaleResult({scaleId:row.id,instrumentKey:key,instrumentVersion:row.instrumentVersion,name:row.name,definition:row.definition as never,answers:fixture.answers})
   expect(r.method.reportVersion).toBe(source.executable!.definition.report.reportVersion)
   expect(Object.fromEntries(r.scores.map(s=>[s.key,s.value]))).toEqual(fixture.expected.scores)
   expect(r.interpretations.every(i=>!(/CFA|ReferenceSet|canonical|百分位|标准差|\d/.test(i.interpretation)))).toBe(true)
  })
 }
 it('rolls back a new MPMI scale and snapshot on failure',async()=>{
  expect(await db.scale.findUnique({where:{code:mpmi.identity.instrumentKey}})).toBeNull()
  await expect(db.$transaction(async tx=>{
   await materializeScaleInstrumentContent(tx,{...mpmi.identity,actorUserId})
   throw new Error('SYNTHETIC_WAVE3_ROLLBACK')
  })).rejects.toThrow('SYNTHETIC_WAVE3_ROLLBACK')
  expect(await db.scale.findUnique({where:{code:mpmi.identity.instrumentKey}})).toBeNull()
 })
 it('materializes MPMI-s22 idempotently with complete tags and no activation',async()=>{
  const key=mpmi.identity.instrumentKey,raw=readFileSync(resolve('src/modules/scale/instruments',key,'1.0.0/source.json'))
  const entry={...mpmi.identity,sourceSha256:sha256(raw)}
  expect((await materializeBatchEntry(db,process.cwd(),entry,actorUserId)).created).toBe(true)
  expect((await materializeBatchEntry(db,process.cwd(),entry,actorUserId)).created).toBe(false)
  const row=await db.scale.findUniqueOrThrow({where:{code:key}})
  const snaps=await db.$queryRaw<Array<{source_snapshot:any}>>`SELECT source_snapshot FROM scale_axis_snapshots WHERE scale_id=${row.id}`
  expect(snaps).toHaveLength(1)
  expect(snaps[0].source_snapshot.catalog.construct.constructOverlapTags).toHaveLength(53)
  expect(row.status).toBe('DRAFT');expect(row.visibility).toBe('HIDDEN')
  const f=mpmi.executable!.goldenCases.find(g=>g.name==='one_missing_each')!
  const r=buildScaleResult({scaleId:row.id,instrumentKey:key,instrumentVersion:row.instrumentVersion,name:row.name,definition:row.definition as never,answers:f.answers})
  expect(r.quality.status).toBe('limited')
  expect(r.scores.map(s=>s.value)).toEqual([3,3,3])
  expect(await db.assessmentReferenceSet.count()).toBe(0)
  expect(await db.scaleDeploymentPolicy.count()).toBe(0)
  expect(await db.scale.count()).toBe(3)
  expect((await db.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM scale_axis_snapshots`)[0].n).toBe(5n)
 })
})
