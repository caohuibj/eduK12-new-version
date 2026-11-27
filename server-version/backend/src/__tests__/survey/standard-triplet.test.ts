import {describe,it,expect,afterAll} from 'vitest'
import chineseActionMaterial from '../../modules/scale/instruments/academic_self_concept_chinese_zh_cn/1.0.0/report-actions.json'
import chineseReadingMaterial from '../../modules/scale/instruments/academic_self_concept_chinese_zh_cn/1.0.0/report-variants.json'
import {buildScaleResult} from '../../modules/scale/scale-result'
import {scoreScale} from '../../modules/scale/scale-scoring'
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
 it('registers the Chinese self-concept reading report on its original question and parameter versions',()=>{
  const key = 'academic_self_concept_chinese_zh_cn'
  const original = parts(key, '1.0.0')
  const reports=registeredParts(key).filter(part=>part.axis==='REPORT')
  const previous=reports.find(part=>part.version==='1.2.0'),report=reports.find(part=>part.version==='1.3.0')
  if(!previous||!report)throw new Error('Missing a registered Chinese reading report')
  expect(previous.hash).toBe('3d75845f36466bb0fd8bc85baf342f3d84de44ccc1e26998f492316e711d834b')
  expect(previous.payload).toEqual(chineseReadingMaterial.variants[0].report)
  expect(previous.reference.metadata.reportVariant).toMatchObject({materialHash:'f9c07a0d693bcaef0fc1b3d0f4f4eda6d21f48d7fb5a1210cd7d2ec8d1346841'})
  expect(composeTriplet(key,{...original,REPORT:previous}).template?.illustrationKey).toBe('chinese-self-concept-door-v1')
  const candidate=composeTriplet(key,{...original,REPORT:report})
  expect(report.reference.metadata.reportVariant).toMatchObject({
   materialHash:canonicalHash(chineseActionMaterial),
   origin:{path:'server-version/backend/src/modules/scale/instruments/academic_self_concept_chinese_zh_cn/1.0.0/report-actions.json'},
  })
  expect(report.payload).toEqual(chineseActionMaterial.variants[0].report)
  expect(candidate.template?.illustrationKey).toBe('chinese-self-concept-door-with-actions-v2')
  expect(original.REPORT.version).toBe('1.1.0')
  expect(candidate.blockers).toEqual([])
  expect(candidate.parts.CONTENT).toEqual(original.CONTENT)
  expect(candidate.parts.PARAMETERS).toEqual(original.PARAMETERS)
  const examples = [[3, 4, 3, 4], [5, 2, 5, 2]]
  for (const values of examples) {
   const answers = candidate.definition.items.map((item,index)=>({itemCode:item.itemCode,responseValue:String(values[index])}))
   expect(scoreScale(candidate.definition,answers).scores).toContainEqual(expect.objectContaining({key:'academic_self_concept',value:3.5}))
  }
  const reading = chineseActionMaterial.variants[0].report.interpretations[0]
  const keys=reading.bands.map(band=>band.key)
  expect(keys).toEqual(['very_low','low','middle','high','very_high'])
  expect(new Set(reading.bands.map(band=>band.summary)).size).toBe(keys.length)
  expect(reading.guidance.length).toBeGreaterThan(0)
  const trials = computeStandardTrial(candidate,'chinese-reading-preview')
  expect(trials).toHaveLength(3)
  for (const trial of trials) {
   const blocks = trial.report?.blocks
   for (const text of [reading.headline,reading.summary,...reading.guidance.map(entry=>entry.text)]) {
    expect(blocks).toContainEqual(expect.objectContaining({type:'TEXT',text:expect.stringContaining(text)}))
   }
   expect(blocks).toContainEqual(expect.objectContaining({type:'METRIC',label:reading.scoreLabel}))
  }
 })
 it('retains distinct chemistry school-stage references for the authorized student report',()=>{
  const key='academic_self_concept_chemistry_zh_cn', original=parts(key,'1.0.0')
  const report=registeredParts(key).find(row=>row.axis==='REPORT'&&row.version==='1.2.0')
  if(!report)throw new Error('Missing chemistry report')
  const t=composeTriplet(key,{...original,REPORT:report})
  expect(t.blockers).toEqual([])
  expect(t.parts.CONTENT).toEqual(original.CONTENT)
  expect(t.parts.PARAMETERS).toEqual(original.PARAMETERS)
  expect(original.REPORT.hash).toEqual('dac5137016bbc81f09671fa320d0d53f1b81f9b65f2a5997405afd81573bf9f8')
  expect(t.template?.illustrationKey).toBe('chemistry-self-concept-salt-v1')
  for(const [grade,expected] of [['9',['very_low','low','middle','high','very_high']],['11',['low','middle','high','high','high']]] as const){
   for(const [index,band] of expected.entries()){
    const result=buildScaleResult({scaleId:key,instrumentKey:key,instrumentVersion:'1.0.0',name:t.title,
     definition:t.definition,referenceSets:t.references,participantContext:{gradeLevel:grade},
     answers:t.definition.items.map(item=>({itemCode:item.itemCode,responseValue:String(index+1)}))})
    expect(result.scores[0].value).toBe(index+1)
    expect(result.references[0].criterionBand?.key).toBe(band)
    expect(result.interpretations[0].interpretation).toBe(t.definition.report.interpretations[0].bands.find(x=>x.key===band)?.summary)
   }
  }
  const anonymous=buildScaleResult({scaleId:key,instrumentKey:key,instrumentVersion:'1.0.0',name:t.title,
   definition:t.definition,referenceSets:t.references,answers:t.definition.items.map(item=>({itemCode:item.itemCode,responseValue:'3'}))})
  expect(anonymous.scores[0].value).toBe(3)
  expect(anonymous.references[0].status).toBe('unavailable')
  expect(anonymous.interpretations[0].interpretation).toBe(t.definition.report.interpretations[0].summary)
 })
 it('a report-only change leaves content and parameters fixed, but creates a new combination',()=>{const s=ready[0],p=parts(s.identity.instrumentKey,s.identity.instrumentVersion),old=composeTriplet(s.identity.instrumentKey,p);const report=structuredClone(p.REPORT.payload) as any;report.reportVersion='new-report';report.interpretations[0].summary='Brief useful explanation.';p.REPORT={...p.REPORT,version:'new-report',payload:report,hash:canonicalHash(report)};const next=composeTriplet(s.identity.instrumentKey,p);expect(next.parts.CONTENT.hash).toBe(old.parts.CONTENT.hash);expect(next.parts.PARAMETERS.hash).toBe(old.parts.PARAMETERS.hash);expect(next.combinationHash).not.toBe(old.combinationHash);expect(next.blockers).toEqual([])})
 it('permits explicit empty parameters and no report while still scoring',()=>{const source=ready[0],p=parts(source.identity.instrumentKey,source.identity.instrumentVersion),empty=registeredParts(source.identity.instrumentKey).filter(p=>p.payload===null);p.PARAMETERS=empty.find(p=>p.axis==='PARAMETERS')!;p.REPORT=empty.find(p=>p.axis==='REPORT')!;const t=composeTriplet(source.identity.instrumentKey,p);expect(t.blockers).toEqual([]);expect(t.template).toBeNull();expect(t.references).toEqual([]);expect(computeStandardTrial(t,'no-report').every(c=>c.report===null&&c.scores.units.length===1)).toBe(true)})
 it('rejects altered hashes and mismatched parameters instead of silently authorizing',()=>{const s=ready[0],p=parts(s.identity.instrumentKey,s.identity.instrumentVersion);p.CONTENT.hash='0'.repeat(64);expect(composeTriplet(s.identity.instrumentKey,p).blockers.join()).toContain('摘要不匹配');const q=parts(s.identity.instrumentKey,s.identity.instrumentVersion);const data=q.PARAMETERS.payload as any;data.references[0].entries[0].scoringVersion='wrong';q.PARAMETERS.hash=canonicalHash(data);expect(composeTriplet(s.identity.instrumentKey,q).blockers.join()).toContain('评分版本')})
 it('runs native scoring and generates distinct score/report cases',()=>{const s=ready[0],t=composeTriplet(s.identity.instrumentKey,parts(s.identity.instrumentKey,s.identity.instrumentVersion)),cases=computeStandardTrial(t,'synthetic-release');expect(cases).toHaveLength(3);for(const c of cases){expect(c.report!.blocks.some(b=>b.type==='METRIC')).toBe(true);expect(c.recordHash).toBe(canonicalHash({caseIndex:c.caseIndex,answers:c.answers,scores:c.scores,report:c.report}))}expect(cases[0].scores).not.toEqual(cases[2].scores)})
})
