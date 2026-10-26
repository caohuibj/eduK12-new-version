import { describe,it,expect,beforeAll,afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertNonOwner,batchManifestSchema,requireDisposableBatchUrl,materializeBatchEntry } from '../../../../scripts/scale-content-batch'
import { getScaleInstrumentSource } from '../../../modules/scale/onboarding/instrument-registry'
import { materializeScaleInstrumentContent } from '../../../modules/scale/onboarding/materialize'
import { installScaleInstrument } from '../../../modules/scale/onboarding/install'
import { buildScaleResult } from '../../../modules/scale/scale-result'

const selected=process.env.SCALE_BATCH_DATABASE_URL
const suite=selected?describe:describe.skip
suite('Wave7 two precise-source drafts after coordinator review in restored task-owned PostgreSQL',{timeout:30_000},()=>{
 const db=new PrismaClient({datasources:{db:{url:requireDisposableBatchUrl(selected)}}})
 const manifest=batchManifestSchema.parse(JSON.parse(readFileSync(resolve('../../docs/scale-instruments/batches/20261026-wave7/manifest.json'),'utf8')))
 let actorUserId:string
 let beforeRows:unknown,beforeSnapshots:unknown
 const priorKeys=['cfsr12_zh_cn_research','ebq16_zh_cn_research','mpmi_s22_zh_cn_research','bps9_zh_cn_research','wibps7_adolescent_zh_cn_research','ffmq15_zh_cn_research','erss19_zh_cn_research','brcs4_zh_cn_research','chime_s24_zh_cn_research','ips9_2021_zh_cn']
 const oldRows=()=>db.scale.findMany({where:{code:{in:priorKeys}},orderBy:{code:'asc'},select:{id:true,code:true,instrumentVersion:true,status:true,visibility:true,definitionHash:true,definition:true}})
 const oldSnapshots=()=>db.$queryRaw`SELECT axis_hash,source_hash,axes,source_snapshot FROM scale_axis_snapshots WHERE scale_id IN (SELECT id FROM scales WHERE code IN ('cfsr12_zh_cn_research','ebq16_zh_cn_research','mpmi_s22_zh_cn_research','bps9_zh_cn_research','wibps7_adolescent_zh_cn_research','ffmq15_zh_cn_research','erss19_zh_cn_research','brcs4_zh_cn_research','chime_s24_zh_cn_research','ips9_2021_zh_cn')) ORDER BY axis_hash`
 beforeAll(async()=>{
  await assertNonOwner(db)
  actorUserId=(await db.user.findUniqueOrThrow({where:{username:'scale-batch-pilot-admin-20261026'}})).id
  beforeRows=await oldRows();beforeSnapshots=await oldSnapshots()
 })
 afterAll(()=>db.$disconnect())
 it('starts with the actual prior ten-tool dump and uses a non-owner application identity',async()=>{
  expect(await db.scale.count()).toBe(10)
  expect(beforeRows).toHaveLength(10);expect(beforeSnapshots).toHaveLength(12)
  expect(await assertNonOwner(db)).toEqual({role:'scale_app',superuser:false,database_owner:false,table_owner:false,schema_owner:false,bypass_rls:false,create_db:false,create_role:false})
 })
 for(const entry of manifest.sources){
  const key=entry.instrumentKey
  it(key+' rolls back its new content row and snapshot together',async()=>{
   expect(await db.scale.findUnique({where:{code:key}})).toBeNull()
   await expect(db.$transaction(async tx=>{
    await materializeScaleInstrumentContent(tx,{...entry,actorUserId})
    throw new Error('WAVE7_SYNTHETIC_ROLLBACK')
   })).rejects.toThrow('WAVE7_SYNTHETIC_ROLLBACK')
   expect(await db.scale.findUnique({where:{code:key}})).toBeNull()
  })
  it(key+' materializes exact content and tags once as DRAFT/HIDDEN',async()=>{
   const first=await materializeBatchEntry(db,process.cwd(),entry,actorUserId),second=await materializeBatchEntry(db,process.cwd(),entry,actorUserId)
   expect(first.created).toBe(true);expect(second.created).toBe(false)
   expect(second.scaleId).toBe(first.scaleId)
   expect(second.status).toBe('DRAFT');expect(second.visibility).toBe('HIDDEN')
   const row=await db.scale.findUniqueOrThrow({where:{code:key}}),source=getScaleInstrumentSource(key,entry.instrumentVersion)!
   const snaps=await db.$queryRaw<Array<{axes:any;source_snapshot:any}>>`SELECT axes,source_snapshot FROM scale_axis_snapshots WHERE scale_id=${row.id}`
   expect(snaps).toHaveLength(1)
   expect(snaps[0].axes.reportVersion).toBe('1.0.0')
   expect(snaps[0].axes.catalogManifestVersion).toBe(1)
   expect(snaps[0].source_snapshot.catalog.construct.constructOverlapTags).toEqual(source.catalog.construct.constructOverlapTags)
   expect(row.definition).toEqual(source.executable!.definition)
  })
  it(key+' builds its actual report from persisted definition with exact scoring and no reference',async()=>{
   const row=await db.scale.findUniqueOrThrow({where:{code:key}}),source=getScaleInstrumentSource(key,entry.instrumentVersion)!
   const f=source.executable!.goldenCases.find(x=>x.name.includes('mixed'))!
   const r=buildScaleResult({scaleId:row.id,instrumentKey:key,instrumentVersion:row.instrumentVersion,name:row.name,definition:row.definition as never,answers:f.answers})
   expect(Object.fromEntries(r.scores.map(s=>[s.key,s.value]))).toEqual(f.expected.scores)
   expect(r.method.reportVersion).toBe('1.0.0');expect(r.interpretations).toHaveLength(source.executable!.definition.scoring.scores.length)
   expect(r.interpretations[0].label).toBeNull();expect(r.references).toEqual([])
   expect(r.interpretations[0].interpretation).not.toMatch(/canonical|ReferenceSet|百分位|标准差|\d/)
  })
  it(key+' keeps its frozen source snapshot immutable',async()=>{
   const row=await db.scale.findUniqueOrThrow({where:{code:key}})
   await expect(db.$executeRaw`UPDATE scale_axis_snapshots SET source_hash=${'f'.repeat(64)} WHERE scale_id=${row.id}`).rejects.toThrow()
   await expect(db.$executeRaw`DELETE FROM scale_axis_snapshots WHERE scale_id=${row.id}`).rejects.toThrow()
   expect((await db.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM scale_axis_snapshots WHERE scale_id=${row.id}`)[0].n).toBe(1n)
  })
  it(key+' refuses deployment of its unpublished draft',async()=>{
   await expect(installScaleInstrument(db,{...entry,actorUserId,deploymentPolicy:{schemaVersion:1,revision:1,locale:'zh-CN',territory:'CN',commercialNature:'NON_COMMERCIAL',deploymentModes:['STANDALONE'],requiredRightsActions:['electronicAdministration','scoring','display'],authorizationRefs:['synthetic-no-grant'],runtimePolicyHash:'a'.repeat(64),localizationVersion:'1.0.0',inFlightCompletion:'FROZEN_DEADLINE'}})).rejects.toThrow('EXECUTABLE_NOT_PUBLISHED')
  })
 }
 for(const key of ['ffmq15_zh_cn_research','chime_s24_zh_cn_research']) it(key+' keeps existing 1.0.0 row intact when separate 1.0.1 source is requested',async()=>{
  const source=getScaleInstrumentSource(key,'1.0.1')!;expect(source.identity.instrumentVersion).toBe('1.0.1')
  const before=await db.scale.findUniqueOrThrow({where:{code:key}})
  expect(before.instrumentVersion).toBe('1.0.0')
  await expect(materializeScaleInstrumentContent(db,{instrumentKey:key,instrumentVersion:'1.0.1',actorUserId})).rejects.toThrow('DEPLOYMENT_VERSION_CONFLICT')
  expect(await db.scale.findUniqueOrThrow({where:{code:key}})).toEqual(before)
 })
 it('preserves all ten prior definitions and twelve frozen snapshots while adding only two drafts',async()=>{
  expect(await oldRows()).toEqual(beforeRows);expect(await oldSnapshots()).toEqual(beforeSnapshots)
  expect(await db.scale.count()).toBe(12)
  expect((await db.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM scale_axis_snapshots`)[0].n).toBe(14n)
  expect(await db.assessmentReferenceSet.count()).toBe(0)
  expect(await db.scaleDeploymentPolicy.count()).toBe(0)
 })
})
