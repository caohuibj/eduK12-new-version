import {describe,it,expect,afterAll} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {listScaleInstrumentSources} from '../../modules/scale/onboarding/instrument-registry'
import {sourceParts,registeredParts,composeTriplet,type Axis,type Part} from '../../modules/survey/standard-triplet.model'
import {computeStandardTrial} from '../../modules/survey/standard-triplet.service'
const ready=listScaleInstrumentSources().filter(s=>s.executable)
const parts=(key:string,version:string)=>Object.fromEntries(sourceParts(key,version).map(p=>[p.axis,p])) as Record<Axis,Part>
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await (await import('../../config/database')).prisma.$disconnect()})
describe('three independent versions and real synthetic scoring/report computation',()=>{
 it('keeps directory-only sources unavailable',()=>{const s=listScaleInstrumentSources().find(s=>!s.executable)!;expect(sourceParts(s.identity.instrumentKey,s.identity.instrumentVersion)).toEqual([])})
 it.each(ready.map(s=>[s.identity.instrumentKey,s.identity.instrumentVersion]))('composes %s at %s without legacy deployment/rights gates',(key,version)=>{const p=parts(key,version),t=composeTriplet(key,p);expect(t.blockers).toEqual([]);expect(t.reference.metadata.content).toBeTruthy()})
 it('retains chemistry R1.1.0 unchanged while the new R matches the same four-band parameters',()=>{
  const key='teacher_subject_liking_chemistry_zh_cn',p=parts(key,'1.0.0')
  const reports=registeredParts(key).filter(part=>part.axis==='REPORT'&&part.payload!==null)
  expect(reports.map(report=>report.version).sort()).toEqual(['1.1.0','1.1.1'])
  const previous=reports.find(report=>report.version==='1.1.0')!,original=canonicalHash(previous.payload)
  expect(p.REPORT.version).toBe('1.1.1')
  const report=p.REPORT.payload as any,oldReport=previous.payload as any
  expect(report.interpretations[0].bands.map((band:any)=>band.key)).toEqual(['very_low','low','high','very_high'])
  expect(oldReport.interpretations[0].bands.map((band:any)=>band.key)).toEqual(['very_low','low','middle','high','very_high'])
  expect(oldReport.interpretations[0].bands[0].summary).toContain('相对偏高也未必偏向同意')
  expect(report.interpretations[0].bands.every((band:any)=>!band.summary.includes('相对偏高也未必偏向同意'))).toBe(true)
  const current=composeTriplet(key,p),historical=composeTriplet(key,{...p,REPORT:previous})
  expect(current.blockers).toEqual([])
  expect(historical.blockers).toEqual(['报告所需分档缺少选定参数支持：teacher_subject_liking/middle'])
  expect(current.parts.CONTENT).toEqual(historical.parts.CONTENT);expect(current.parts.PARAMETERS).toEqual(historical.parts.PARAMETERS)
  expect(current.combinationHash).not.toBe(historical.combinationHash)
  expect(canonicalHash(previous.payload)).toBe(original)
 })
 it('a report-only change leaves content and parameters fixed, but creates a new combination',()=>{const s=ready[0],p=parts(s.identity.instrumentKey,s.identity.instrumentVersion),old=composeTriplet(s.identity.instrumentKey,p);const report=structuredClone(p.REPORT.payload) as any;report.reportVersion='new-report';report.interpretations[0].summary='Brief useful explanation.';p.REPORT={...p.REPORT,version:'new-report',payload:report,hash:canonicalHash(report)};const next=composeTriplet(s.identity.instrumentKey,p);expect(next.parts.CONTENT.hash).toBe(old.parts.CONTENT.hash);expect(next.parts.PARAMETERS.hash).toBe(old.parts.PARAMETERS.hash);expect(next.combinationHash).not.toBe(old.combinationHash);expect(next.blockers).toEqual([])})
 it('permits explicit empty parameters and no report while still scoring',()=>{const source=ready[0],p=parts(source.identity.instrumentKey,source.identity.instrumentVersion),empty=registeredParts(source.identity.instrumentKey).filter(p=>p.payload===null);p.PARAMETERS=empty.find(p=>p.axis==='PARAMETERS')!;p.REPORT=empty.find(p=>p.axis==='REPORT')!;const t=composeTriplet(source.identity.instrumentKey,p);expect(t.blockers).toEqual([]);expect(t.template).toBeNull();expect(t.references).toEqual([]);expect(computeStandardTrial(t,'no-report').every(c=>c.report===null&&c.scores.units.length===1)).toBe(true)})
 it('rejects altered hashes and mismatched parameters instead of silently authorizing',()=>{const s=ready[0],p=parts(s.identity.instrumentKey,s.identity.instrumentVersion);p.CONTENT.hash='0'.repeat(64);expect(composeTriplet(s.identity.instrumentKey,p).blockers.join()).toContain('摘要不匹配');const q=parts(s.identity.instrumentKey,s.identity.instrumentVersion);const data=q.PARAMETERS.payload as any;data.references[0].entries[0].scoringVersion='wrong';q.PARAMETERS.hash=canonicalHash(data);expect(composeTriplet(s.identity.instrumentKey,q).blockers.join()).toContain('评分版本')})
 it('runs native scoring and generates distinct score/report cases',()=>{const s=ready[0],t=composeTriplet(s.identity.instrumentKey,parts(s.identity.instrumentKey,s.identity.instrumentVersion)),cases=computeStandardTrial(t,'synthetic-release');expect(cases).toHaveLength(3);for(const c of cases){expect(c.report!.blocks.some(b=>b.type==='METRIC')).toBe(true);expect(c.recordHash).toBe(canonicalHash({caseIndex:c.caseIndex,answers:c.answers,scores:c.scores,report:c.report}))}expect(cases[0].scores).not.toEqual(cases[2].scores)})
})
