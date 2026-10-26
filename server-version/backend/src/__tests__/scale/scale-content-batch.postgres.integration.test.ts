import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { assertNonOwner, batchManifestSchema, materializeBatchEntry, requireDisposableBatchUrl, validateBatchEntry } from '../../../scripts/scale-content-batch'
import { freezeScaleAxisSnapshot } from '../../modules/scale/onboarding/axis-snapshots'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { materializeScaleInstrumentContent } from '../../modules/scale/onboarding/materialize'
import { installScaleInstrument } from '../../modules/scale/onboarding/install'
import { buildScaleResult } from '../../modules/scale/scale-result'

const selected = process.env.SCALE_BATCH_DATABASE_URL
const suite = selected ? describe : describe.skip
suite('explicit batch in disposable non-owner PostgreSQL', {timeout:30_000}, () => {
  const db = new PrismaClient({datasources:{db:{url:requireDisposableBatchUrl(selected)}}})
  const manifestPath=resolve('../../docs/scale-instruments/batches/20261026-pilot/manifest.json')
  const manifest=batchManifestSchema.parse(JSON.parse(readFileSync(manifestPath,'utf8')))
  let actorUserId:string
  beforeAll(async()=>{
    await assertNonOwner(db)
    const actor=await db.user.upsert({where:{username:'scale-batch-pilot-admin-20261026'},create:{username:'scale-batch-pilot-admin-20261026',passwordHash:'synthetic-no-login',role:'ADMIN',platformRole:'SYSTEM_ADMIN'},update:{}})
    actorUserId=actor.id
  })
  afterAll(()=>db.$disconnect())
  it('uses a role with no ownership, superuser, role creation or RLS bypass',async()=>{
    expect(await assertNonOwner(db)).toEqual({role:'scale_app',superuser:false,database_owner:false,table_owner:false,schema_owner:false,bypass_rls:false,create_db:false,create_role:false})
  })
  for(const entry of manifest.sources){
    const key=entry.instrumentKey
    it(key+' rolls back a new scale and snapshot together on failure',async()=>{
      expect(await db.scale.findUnique({where:{code:key}})).toBeNull()
      await expect(db.$transaction(async tx=>{
        const result=await materializeScaleInstrumentContent(tx,{...entry,actorUserId})
        expect((await tx.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM scale_axis_snapshots WHERE scale_id=${result.scale.id}`)[0].n).toBe(1n)
        throw new Error('SYNTHETIC_BATCH_ROLLBACK')
      })).rejects.toThrow('SYNTHETIC_BATCH_ROLLBACK')
      expect(await db.scale.findUnique({where:{code:key}})).toBeNull()
    })
    it(key+' materializes once, remains DRAFT/HIDDEN and reuses the same snapshot',async()=>{
      const first=await materializeBatchEntry(db,process.cwd(),entry,actorUserId)
      const second=await materializeBatchEntry(db,process.cwd(),entry,actorUserId)
      expect(first.created).toBe(true);expect(second.created).toBe(false)
      expect(second.scaleId).toBe(first.scaleId)
      expect(second.status).toBe('DRAFT');expect(second.visibility).toBe('HIDDEN')
      const snapshots=await db.$queryRaw<Array<{axes:{instrumentVersion:string;reportVersion:string;localizationVersion:string};source_snapshot:unknown}>>`SELECT axes,source_snapshot FROM scale_axis_snapshots WHERE scale_id=${first.scaleId}`
      expect(snapshots).toHaveLength(1)
      expect(snapshots[0].axes.instrumentVersion).toBe(entry.instrumentVersion)
      expect(snapshots[0].axes.localizationVersion).toBe('1.0.1')
      const row=await db.scale.findUniqueOrThrow({where:{code:key}})
      const source=getScaleInstrumentSource(key,entry.instrumentVersion)!
      const fixture=source.executable!.goldenCases.find(f=>f.name==='maximum')!
      const result=buildScaleResult({scaleId:row.id,instrumentKey:key,instrumentVersion:row.instrumentVersion,name:row.name,definition:row.definition as never,answers:fixture.answers})
      expect(result.method.reportVersion).toBe(source.executable!.definition.report.reportVersion)
      expect(result.interpretations.length).toBe(source.executable!.definition.scoring.scores.length)
      expect(Object.fromEntries(result.scores.map(s=>[s.key,s.value]))).toEqual(fixture.expected.scores)
      expect(await db.assessmentReferenceSet.count({where:{instrumentKey:key}})).toBe(0)
    })
    it(key+' refuses mutation or deletion of a frozen snapshot',async()=>{
      const row=await db.scale.findUniqueOrThrow({where:{code:key}})
      await expect(db.$executeRaw`UPDATE scale_axis_snapshots SET source_hash=${'f'.repeat(64)} WHERE scale_id=${row.id}`).rejects.toThrow()
      await expect(db.$executeRaw`DELETE FROM scale_axis_snapshots WHERE scale_id=${row.id}`).rejects.toThrow()
      expect((await db.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM scale_axis_snapshots WHERE scale_id=${row.id}`)[0].n).toBe(1n)
    })
    it(key+' refuses content conflicts without rewriting its existing row',async()=>{
      const original=await db.scale.findUniqueOrThrow({where:{code:key}})
      await expect(db.$transaction(async tx=>{
        await tx.scale.update({where:{id:original.id},data:{definitionHash:'f'.repeat(64)}})
        await materializeScaleInstrumentContent(tx,{...entry,actorUserId})
      })).rejects.toThrow('SCALE_DEFINITION_CONFLICT')
      expect((await db.scale.findUniqueOrThrow({where:{code:key}})).definitionHash).toBe(original.definitionHash)
      const source=structuredClone(getScaleInstrumentSource(key,entry.instrumentVersion)!)
      source.catalog.identity.canonicalName+=' changed without advancing axes'
      await expect(db.$transaction(tx=>freezeScaleAxisSnapshot(tx,original.id,source))).rejects.toThrow('SCALE_AXIS_VERSION_CONTENT_CONFLICT')
    })
    it(key+' does not activate an unapproved draft',async()=>{
      const source=getScaleInstrumentSource(key,entry.instrumentVersion)!
      await expect(installScaleInstrument(db,{
        ...entry,actorUserId,deploymentPolicy:{
          schemaVersion:1,revision:1,locale:'zh-CN',territory:'CN',commercialNature:'NON_COMMERCIAL',
          deploymentModes:['STANDALONE'],requiredRightsActions:['electronicAdministration','scoring','display'],
          authorizationRefs:['synthetic-no-grant'],runtimePolicyHash:'a'.repeat(64),
          localizationVersion:source.localization!.localizationVersion,inFlightCompletion:'FROZEN_DEADLINE',
        },
      })).rejects.toThrow('EXECUTABLE_NOT_PUBLISHED')
      expect(await db.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM scale_deployment_policies WHERE scale_id=(SELECT id FROM scales WHERE code=${key})`).toEqual([{n:0n}])
    })
  }
  it('continues the next independent entry after a pinned-source failure and preserves a receipt',()=>{
    const out=mkdtempSync(join(tmpdir(),'scale-batch-pilot-'))
    try{
      const input={...manifest,sources:manifest.sources.map((s,i)=>i===0?{...s,sourceSha256:'0'.repeat(64)}:s)}
      const file=join(out,'manifest.json');writeFileSync(file,JSON.stringify(input))
      const r=spawnSync(process.execPath,[resolve('node_modules/tsx/dist/cli.mjs'),resolve('scripts/scale-content-batch.ts'),'--manifest',file,'--out',out,'--apply','--actor-user-id',actorUserId],{env:process.env,encoding:'utf8'})
      expect(r.status,r.stderr).toBe(1)
      const receipt=JSON.parse(readFileSync(join(out,'receipt.json'),'utf8'))
      expect(receipt.entries.map((e:{status:string})=>e.status)).toEqual(['FAIL','PASS'])
      expect(receipt.entries[0].errorCode).toBe('SOURCE_HASH_MISMATCH')
      expect(receipt.entries[1].materialization.created).toBe(false)
      expect(JSON.stringify(receipt)).not.toContain(new URL(selected!).password)
    } finally {rmSync(out,{recursive:true,force:true})}
  })
})
