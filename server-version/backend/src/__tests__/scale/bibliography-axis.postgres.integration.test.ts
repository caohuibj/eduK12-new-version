import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import type {ScaleInstrumentSourceV1} from '../../modules/scale/onboarding/types'
const fixture=vi.hoisted(()=>({source:null as ScaleInstrumentSourceV1|null}))
vi.mock('../../modules/scale/onboarding/instrument-registry',async importOriginal=>{
 const original=await importOriginal<typeof import('../../modules/scale/onboarding/instrument-registry')>()
 return {...original,getScaleInstrumentSource:(key:string,version:string)=>fixture.source?.identity.instrumentKey===key&&fixture.source.identity.instrumentVersion===version?fixture.source:original.getScaleInstrumentSource(key,version)}
})
import {getScaleInstrumentSource} from '../../modules/scale/onboarding/instrument-registry'
import {materializeScaleInstrumentContent} from '../../modules/scale/onboarding/materialize'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {referenceSetHash} from '../../modules/assessment-runtime/reference-binding'
import {validateScaleInstrumentSource} from '../../modules/scale/onboarding/validate-instrument'
const enabled=process.env.PR356_BIBLIOGRAPHY_ISOLATED==='1',suite=enabled?describe:describe.skip
suite('bibliography axis changes on retained synthetic PostgreSQL snapshots',()=>{
 let source:ScaleInstrumentSourceV1,actorId:string,scaleId:string,measurementHash:string,originalSnapshot:any
 const key='academic_self_concept_chemistry_zh_cn',version='1.0.0'
 const rows=()=>db.$queryRaw<Array<{axis_hash:string;source_hash:string;axes:any;source_snapshot:any}>>`SELECT axis_hash,source_hash,axes,source_snapshot FROM scale_axis_snapshots WHERE scale_id=${scaleId} ORDER BY axis_hash`
 const apply=(next:ScaleInstrumentSourceV1)=>{fixture.source=next;return db.$transaction(tx=>materializeScaleInstrumentContent(tx,{instrumentKey:key,instrumentVersion:version,actorUserId:actorId}),{timeout:15000})}
 beforeAll(async()=>{
  const u=new URL(process.env.DATABASE_URL??'invalid:')
  if(process.env.NODE_ENV!=='test'||!enabled||!['127.0.0.1','localhost'].includes(u.hostname)||u.port!=='55439'||!/^\/pr356_bibliography_test_\d{8}_[a-f0-9]{10}$/.test(u.pathname)||u.searchParams.has('host')||u.searchParams.has('schema'))throw new Error('Dedicated schema-only bibliography test database and opt-in required')
  if(await db.user.count()||await db.scale.count())throw new Error('Fresh schema-only fixture required; never reset existing data')
  actorId=(await db.user.create({data:{username:'synthetic-bibliography-'+randomUUID(),passwordHash:'SYNTHETIC TEST ONLY',platformRole:'SYSTEM_ADMIN',accountDomain:'TRAINING'}})).id
  source=structuredClone(getScaleInstrumentSource(key,version)!)
  const independent=structuredClone(source.executable!.references[0]);independent.referenceVersion='independent-literature-v1'
  for(const entry of independent.entries)entry.referenceKind='descriptive_sample'
  source.executable!.references.push(independent)
  if(source.executable!.definition.referencePolicy.type!=='declared')throw new Error('Declared-reference fixture required')
  source.executable!.definition.referencePolicy.selections.push({scoreKey:independent.entries[0].scoreKey,referenceVersion:independent.referenceVersion,referenceKind:'descriptive_sample'})
  expect(validateScaleInstrumentSource(source).issues.filter(i=>i.severity==='error')).toEqual([])
  const created=await apply(source);scaleId=created.scale.id;measurementHash=hashScaleDefinition(source.executable!.definition)
  originalSnapshot=(await rows())[0]
 },60000)
 afterAll(async()=>{await db.$disconnect()})
 it('rejects a catalog citation edit without a catalog version, then appends that axis only',async()=>{
  const next=structuredClone(source);next.catalog.evidence[0].citation+=' [synthetic bibliographic correction]'
  await expect(apply(next)).rejects.toThrow('SCALE_AXIS_VERSION_CONTENT_CONFLICT')
  expect(await rows()).toEqual([originalSnapshot])
  next.catalog.catalogManifestVersion++
  await apply(next);source=next
  const snapshots=await rows();expect(snapshots).toHaveLength(2)
  expect(snapshots.find(s=>s.axis_hash===originalSnapshot.axis_hash)).toEqual(originalSnapshot)
  const revised=snapshots.find(s=>s.axis_hash!==originalSnapshot.axis_hash)!
  expect({...revised.axes,catalogManifestVersion:originalSnapshot.axes.catalogManifestVersion}).toEqual(originalSnapshot.axes)
  expect(revised.source_snapshot.catalog.evidence[0].citation).toContain('synthetic bibliographic correction')
  expect(hashScaleDefinition(source.executable!.definition)).toBe(measurementHash)
 })
 it('versions a report bibliography edit separately while retaining both earlier source snapshots',async()=>{
  const before=await rows(),next=structuredClone(source)
  next.executable!.definition.report.disclaimer+=' Synthetic report bibliography correction.'
  await expect(apply(next)).rejects.toThrow('SCALE_DEFINITION_CONFLICT')
  expect(await rows()).toEqual(before)
  next.executable!.definition.report.reportVersion='1.1.1'
  await apply(next);source=next
  const after=await rows();expect(after).toHaveLength(3)
  for(const old of before)expect(after.find(s=>s.axis_hash===old.axis_hash)).toEqual(old)
  expect(hashScaleDefinition(source.executable!.definition)).toBe(measurementHash)
 })
 it('rejects a reference citation overwrite, then versions only that reference and preserves the independent one',async()=>{
  const before=await rows(),next=structuredClone(source),ref=next.executable!.references[0],priorVersion=ref.referenceVersion
  const oldReference=await db.assessmentReferenceSet.findUniqueOrThrow({where:{instrumentType_instrumentKey_referenceVersion:{instrumentType:'SCALE',instrumentKey:key,referenceVersion:priorVersion}}})
  ref.entries[0].source.citation+=' [synthetic parameter bibliography correction]'
  await expect(apply(next)).rejects.toThrow('ACTIVE_REFERENCE_IMMUTABLE')
  expect(await rows()).toEqual(before)
  ref.referenceVersion=priorVersion+'-bibliography-v2'
  if(next.executable!.definition.referencePolicy.type!=='declared')throw new Error('fixture')
  next.executable!.definition.referencePolicy.selections[0].referenceVersion=ref.referenceVersion
  await apply(next);source=next
  const after=await rows();expect(after).toHaveLength(4)
  for(const old of before)expect(after.find(s=>s.axis_hash===old.axis_hash)).toEqual(old)
  expect(await db.assessmentReferenceSet.findUniqueOrThrow({where:{id:oldReference.id}})).toEqual(oldReference)
  const independent=source.executable!.references[1]
  const stored=await db.assessmentReferenceSet.findUniqueOrThrow({where:{instrumentType_instrumentKey_referenceVersion:{instrumentType:'SCALE',instrumentKey:key,referenceVersion:independent.referenceVersion}}})
  expect(referenceSetHash(stored.definition as any)).toBe(referenceSetHash(independent))
  expect(hashScaleDefinition(source.executable!.definition)).toBe(measurementHash)
 })
 it('protects old snapshots in PostgreSQL without publishing, activating or granting the fixture',async()=>{
  const before=await rows()
  await expect(db.$executeRaw`UPDATE scale_axis_snapshots SET source_hash=${'0'.repeat(64)} WHERE scale_id=${scaleId} AND axis_hash=${originalSnapshot.axis_hash}`).rejects.toThrow('SCALE_AXIS_SNAPSHOT_IMMUTABLE')
  await expect(db.$executeRaw`DELETE FROM scale_axis_snapshots WHERE scale_id=${scaleId} AND axis_hash=${originalSnapshot.axis_hash}`).rejects.toThrow('SCALE_AXIS_SNAPSHOT_IMMUTABLE')
  expect(await rows()).toEqual(before)
  const scale=await db.scale.findUniqueOrThrow({where:{id:scaleId}})
  expect(scale.status).toBe('DRAFT');expect(scale.visibility).toBe('HIDDEN');expect(scale.definitionHash).toBe(measurementHash)
  expect(await db.scaleDeploymentPolicy.count()).toBe(0);expect(await db.materialGrant.count()).toBe(0)
  expect(await db.$queryRaw`SELECT id FROM survey_standard_releases`).toEqual([])
  expect(canonicalHash(before.find(s=>s.axis_hash===originalSnapshot.axis_hash))).toBe(canonicalHash(originalSnapshot))
 })
})
