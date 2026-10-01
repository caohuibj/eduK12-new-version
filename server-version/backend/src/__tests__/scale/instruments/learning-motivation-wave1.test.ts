import { describe,it,expect } from 'vitest'
import { listScaleInstrumentSources } from '../../../modules/scale/onboarding/instrument-registry'
import { validateScaleInstrumentSource } from '../../../modules/scale/onboarding/validate-instrument'
import { evaluateScaleSourceScientificQualification } from '../../../modules/scale/library/scientific-qualification'
import { validateScalePackage } from '../../../modules/scale/scale-package.registry'
import { projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { buildScaleResult } from '../../../modules/scale/scale-result'
import { compileScaleRuntime } from '../../../modules/assessment-runtime/compiler'
import { projectScaleCanonicalUnitResult } from '../../../modules/assessment-runtime/unit-result'
import { referenceSetHash } from '../../../modules/assessment-runtime/reference-binding'
import data from '../../../modules/scale/instruments/learning-motivation-wave1-data.json'
const sources=listScaleInstrumentSources().filter(s=>s.executable?.definition.versionAxes)
const result=(source:typeof sources[number],value:number,grade?:string)=>buildScaleResult({scaleId:'test',instrumentKey:source.identity.instrumentKey,name:source.catalog.identity.canonicalName,instrumentVersion:source.identity.instrumentVersion,definition:source.executable!.definition,answers:source.executable!.definition.items.map(i=>({itemCode:i.itemCode,responseValue:String(value)})),referenceSets:source.executable!.references,participantContext:grade?{gradeLevel:grade}:undefined})
describe('learning motivation first wave',()=>{
 it('registers all 36 exact packages with independent evidence and all golden cases',()=>{
  expect(sources).toHaveLength(36);expect(sources.filter(s=>s.catalog.scientificMaturity==='RESEARCH_READY')).toHaveLength(10)
  for(const s of sources){expect(validateScaleInstrumentSource(s).issues).toEqual([]);expect(validateScalePackage(projectScalePackage(s)!).issues.filter(i=>i.severity==='error')).toEqual([]);expect(evaluateScaleSourceScientificQualification(s).maxEligibleMaturity).toBe(s.catalog.scientificMaturity)}
  expect(Object.keys(data.references)).toHaveLength(24)
 })
 it('includes subject learning situations, distinct actions and explicit source limitations',()=>{
  const markers:Record<string,string>={mathematics:'函数',chemistry:'反应式',physics:'电路',biology:'生命过程',english:'单词',chinese:'原文'}
  for(const s of sources){for(const i of s.executable!.definition.report.interpretations){expect(i.summary).toContain(markers[s.executable!.definition.versionAxes!.subjectKey]);expect(new Set(i.bands.map(b=>JSON.stringify(b.guidance))).size).toBe(5)}}
  const math=sources.find(s=>s.identity.instrumentKey==='value_cost_mathematics_zh_cn')!;expect(math.catalog.evidence.filter(e=>e.evidenceId.startsWith('cost')).every(e=>e.notes?.includes('cross-loading'))).toBe(true)
  const tutor=sources.find(s=>s.identity.instrumentKey==='tutoring_necessity_chemistry_zh_cn')!;expect(tutor.executable!.definition.source.title).toContain('self-developed')
 })
 it('matches exact subject × stage; fallback has no made-up percentile',()=>{
  for(const s of sources){for(const grade of ['8','11']){const r=result(s,3,grade);expect(r.references.every(x=>x.status==='available')).toBe(true);expect(r.references.every(x=>x.bandProvenance?.schoolStage===(grade==='8'?'junior_secondary':'upper_secondary'))).toBe(true);expect(r.interpretations.every(i=>i.referenceVersion && i.interpretation.length>=100 && i.guidance.length>=2)).toBe(true)
   if(s.catalog.scientificMaturity==='PILOT')expect(r.references.every(x=>x.percentile===null && x.z===null && x.meanDifference===null)).toBe(true)
  }expect(result(s,3).references.every(x=>x.status==='unavailable')).toBe(true);expect(result(s,3,'6').references.every(x=>x.status==='unavailable')).toBe(true)}
 })
 it('preserves canonical item anchors, original directions and missing-item rules',()=>{
  const sc=sources.find(s=>s.identity.instrumentKey==='academic_self_concept_chemistry_zh_cn')!;expect(sc.executable!.definition.responseSets[0].options[2].label).toBe('中性');expect(sc.executable!.definition.items[0].content).toBe('我的化学成绩很好');expect(sc.executable!.definition.items).toHaveLength(4)
  const efficacy=sources.find(s=>s.identity.instrumentKey==='academic_self_efficacy_chemistry_zh_cn')!;expect(efficacy.executable!.definition.responseSets[0].options[2].label).toBe('一般');expect(efficacy.executable!.definition.items[0].content).toContain('下学期')
  const tutor=sources.find(s=>s.identity.instrumentKey==='tutoring_necessity_mathematics_zh_cn')!;expect(tutor.executable!.definition.items[2].content).toBe('补习是数学取得好成绩的基础')
  expect(data.references['tutoring_necessity/mathematics/tutoring_necessity/junior_secondary'].columns['3'][2]).toBe('d3_mshaedu13')
  for(const s of sources){expect(s.executable!.definition.scoring.itemRules.every(r=>r.transform.type==='identity')).toBe(true);expect(s.executable!.definition.scoring.scores.every(x=>x.direction==='higher_is_more')).toBe(true)}
 })
 it('Value and Cost never collapse into an EVC total',()=>{
  for(const s of sources.filter(s=>s.identity.instrumentKey.startsWith('value_cost_'))){const r=result(s,3,'8');expect(r.scores.map(s=>s.key)).toEqual(['value','cost']);expect(r.scores.every(s=>s.type==='dimension')).toBe(true)}
 })
 it('freezes original reference identity in canonical metrics without raw response facts',()=>{
  const s=sources[0],e=s.executable!,r=result(s,3,'8'),runtime=compileScaleRuntime({instrumentKey:s.identity.instrumentKey,instrumentVersion:'1.0.0',definition:e.definition,sourceDefinitionHash:hashScaleDefinition(e.definition)})
  const core=projectScaleCanonicalUnitResult({result:r,runtime,contextHash:null,referenceBindings:e.references.map(ref=>({referenceKey:ref.instrumentKey,referenceVersion:ref.referenceVersion,referenceHash:referenceSetHash(ref)}))})
  expect(core.metrics[0].scaleReference).toMatchObject({subjectKey:e.definition.versionAxes!.subjectKey,schoolStage:'junior_secondary',originalReferenceVersion:'wave1-20261001-v1',originalReferenceHash:referenceSetHash(e.references[0])});expect(JSON.stringify(core)).not.toContain('responseValue')
 })
 it('rejects cross-subject references, empirical fiction and absent report QC',()=>{
  const s=sources.find(s=>s.catalog.scientificMaturity==='PILOT')!,pkg=structuredClone(projectScalePackage(s)!)
  pkg.references[0].entries[0].governance!.subjectKey='foreign-subject';expect(validateScalePackage(pkg).issues.some(i=>i.message==='REFERENCE_MEASUREMENT_AXES_MISMATCH')).toBe(true)
  const next=structuredClone(projectScalePackage(s)!);next.references[0].entries[0].statistics={mean:3};expect(validateScalePackage(next).issues.some(i=>i.message==='THEORETICAL_EMPIRICAL_CLAIM_FORBIDDEN')).toBe(true)
  delete next.definition.report.audienceContract;expect(validateScalePackage(next).issues.some(i=>i.message==='AUDIENCE_LANGUAGE_QC_REQUIRED')).toBe(true)
  next.definition.report.interpretations[0].bands[0].guidance=[];expect(validateScalePackage(next).issues.some(i=>i.message==='REPORT_REFLECTION_ACTION_REQUIRED')).toBe(true)
 })
})
