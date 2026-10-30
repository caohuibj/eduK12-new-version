import {describe,it,expect} from 'vitest'
import {registeredParts,sourceParts,composeTriplet,type Part} from '../../modules/survey/standard-triplet.model'
import {getScaleInstrumentSource} from '../../modules/scale/onboarding/instrument-registry'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {readScaleReportVariantMaterial} from '../../modules/scale/onboarding/report-variants'
import cfq from '../../modules/scale/instruments/cfq7_zh_cn_research/1.0.1/report-variants.json'
const materials=[cfq,{instrumentKey:'ipip_neo_c1_self_efficacy10_zh_cn_research',instrumentVersion:'1.0.0'},{instrumentKey:'bps9_zh_cn_research',instrumentVersion:'1.0.0'}]
describe('Reviewed nonempty reports register against the original independent C/P axes',()=>{
 it.each(materials)('$instrumentKey retains its default and composes a distinct real report with the exact same C/P',m=>{
  const parts=sourceParts(m.instrumentKey,m.instrumentVersion),byAxis=Object.fromEntries(parts.map(p=>[p.axis,p])) as Record<'CONTENT'|'PARAMETERS'|'REPORT',Part>
  const reports=registeredParts(m.instrumentKey).filter(p=>p.axis==='REPORT'&&p.payload!==null)
  expect(reports).toHaveLength(2);expect(reports[0].hash).toBe(byAxis.REPORT.hash);expect(reports[1].version).toBe('1.1.0');expect(reports[1].hash).not.toBe(reports[0].hash)
  const [standard,fun]=reports.map(REPORT=>composeTriplet(m.instrumentKey,{...byAxis,REPORT}))
  expect(standard.blockers).toEqual([]);expect(fun.blockers).toEqual([]);expect(fun.template!.blocks.length).toBeGreaterThan(0);expect(standard.template!.blocks.length).toBeGreaterThan(0)
  expect(fun.parts.CONTENT).toEqual(standard.parts.CONTENT);expect(fun.parts.PARAMETERS).toEqual(standard.parts.PARAMETERS)
  expect(fun.definition.scoring).toEqual(standard.definition.scoring);expect(hashScaleDefinition(fun.definition)).toBe(hashScaleDefinition(standard.definition));expect(canonicalHash(fun.template)).not.toBe(canonicalHash(standard.template))
  expect(sourceParts(m.instrumentKey,m.instrumentVersion).find(p=>p.axis==='REPORT')!.hash).toBe(standard.parts.REPORT.hash)
 })
 it('rejects stale C/P bindings, reused R versions and empty report variants without changing the source',()=>{
  const source=getScaleInstrumentSource(cfq.instrumentKey,cfq.instrumentVersion)!,original=canonicalHash(source)
  for(const change of [(v:any)=>{v.baseContentHash='0'.repeat(64)},(v:any)=>{v.baseParametersHash='0'.repeat(64)},(v:any)=>{v.variants[0].report.reportVersion=source.executable!.definition.report.reportVersion},(v:any)=>{v.variants[0].report.interpretations=[]}]){
   const altered=structuredClone(cfq);change(altered);expect(()=>readScaleReportVariantMaterial(source,altered)).toThrow()
  }
  expect(canonicalHash(source)).toBe(original)
 })
})
