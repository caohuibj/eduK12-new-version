import {afterAll,describe,expect,it} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {getScaleInstrumentSource,listScaleInstrumentSources} from '../../modules/scale/onboarding/instrument-registry'
import {snapshotScaleInstrumentSource} from '../../modules/scale/onboarding/source-snapshot'
import {standardPolicyIdentity} from '../../modules/survey/tool-policy'
const source=getScaleInstrumentSource('sdq_teacher_zh_cn','1.0.0')!
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await (await import('../../config/database')).prisma.$disconnect()})
describe('standard source uses the existing versioned scorer snapshot contract',()=>{
 it('keeps the canonical encoder strict while SDQ directory/approval share a serializable identity',()=>{
  expect(typeof source.executable!.scorerPlugins![0].scorer).toBe('function')
  expect(()=>canonicalHash(source)).toThrow()
  const projected=snapshotScaleInstrumentSource(source)
  expect(projected.executable!.scorerPlugins![0]).not.toHaveProperty('scorer')
  expect(standardPolicyIdentity(source.identity.instrumentKey,source.identity.instrumentVersion).fingerprint).toBe(canonicalHash(projected))
 })
 it('preserves fingerprints for every existing function-free standard source',()=>{
  for(const s of listScaleInstrumentSources().filter(s=>!s.executable?.scorerPlugins?.length))expect(standardPolicyIdentity(s.identity.instrumentKey,s.identity.instrumentVersion).fingerprint).toBe(canonicalHash(s))
 })
 it('preserves the existing axis snapshot bytes for every installed executable source',()=>{
  for(const s of listScaleInstrumentSources().filter(s=>s.executable)){
   const e=s.executable!,previous={...s,executable:{...e,scorerPlugins:(e.scorerPlugins??[]).map(p=>({key:p.key,version:p.version}))}}
   expect(canonicalHash(snapshotScaleInstrumentSource({...s,executable:{...e,scorerPlugins:e.scorerPlugins??[]}}))).toBe(canonicalHash(previous))
  }
 })
 it.each(['plugin-version','scoring-version','report-version','rights','item','reference'] as const)('binds %s changes in the strict source closure',field=>{
  const changed=structuredClone(snapshotScaleInstrumentSource(source)) as any
  if(field==='plugin-version')changed.executable.scorerPlugins[0].version+='-revision'
  if(field==='scoring-version')changed.executable.definition.scoring.scoringVersion+='-revision'
  if(field==='report-version')changed.executable.definition.report.reportVersion+='-revision'
  if(field==='rights')changed.executable.definition.license.redistribution=!changed.executable.definition.license.redistribution
  if(field==='item')changed.executable.definition.items[0].prompt+=' changed'
  if(field==='reference')changed.executable.references=[...changed.executable.references,{syntheticChangedReference:'v2'}]
  expect(canonicalHash(changed)).not.toBe(canonicalHash(snapshotScaleInstrumentSource(source)))
 })
 it('does not discard other executable metadata/functions or silently accept unversioned plugins',()=>{
  expect(()=>canonicalHash(snapshotScaleInstrumentSource({...source,catalog:{...source.catalog,unexpectedFunction:()=>0}} as typeof source))).toThrow()
  expect(()=>snapshotScaleInstrumentSource({...source,executable:{...source.executable!,scorerPlugins:[{...source.executable!.scorerPlugins![0],version:''}]}})).toThrow('Versioned scorer')
 })
})
