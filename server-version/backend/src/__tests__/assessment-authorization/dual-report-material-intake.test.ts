import {describe,it,expect} from 'vitest'
import {registeredParts,sourceParts,composeTriplet,type Part} from '../../modules/survey/standard-triplet.model'
import {getScaleInstrumentSource} from '../../modules/scale/onboarding/instrument-registry'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'

// The two existing reviewed batches, not a filesystem scan or a newly generated
// expectation derived from the registry under test.
const reviewed = [
  ['bat23_2020_en','1.0.0','1.0.1','1.2.0'],
  ['cbi_zh_cn','1.0.1','1.0.0','1.2.0'],
  ['ccfq18_zh_cn','1.0.0','1.0.1','1.2.0'],
  ['cesd10_zh_cn_research','1.0.0','1.0.0','1.2.0'],
  ['chime_s24_zh_cn_research','1.0.1','1.0.1','1.2.0'],
  ['csacs9_zh_cn','1.0.1','1.0.0','1.2.0'],
  ['ctas2_cognitive_en','1.0.1','1.0.0','1.2.0'],
  ['curiosity_5dcr24_zh_cn_research','1.0.0','1.0.1','1.2.0'],
  ['djgls6_zh_cn_research','1.0.1','1.0.1','1.2.0'],
  ['ebq16_zh_cn_research','1.0.2','1.0.4','1.2.0'],
  ['erss19_zh_cn_research','1.0.0','1.0.0','1.2.0'],
  ['ffmq15_zh_cn_research','1.0.1','1.0.0','1.2.0'],
  ['gad7_zh_cn_research','1.1.0','1.0.0','1.2.0'],
  ['hse_msit_zh_cn','1.0.1','1.0.0','1.2.0'],
  ['k6_zh_cn_research','1.1.0','1.0.1','1.2.0'],
  ['l1_zh_cn_research','1.0.0','1.0.0','1.2.0'],
  ['maia2_37_zh_cn_research','1.0.1','1.0.0','1.2.0'],
  ['mpmi_s22_zh_cn_research','1.0.0','1.0.0','1.2.0'],
  ['orvis92_zh_cn_research','1.0.1','1.0.0','1.2.0'],
  ['phq4_zh_cn_research','1.0.0','1.0.1','1.2.0'],
  ['sas_sv10_zh_cn_research','1.0.0','1.0.0','1.2.0'],
  ['socs_s20_2023_zh_cn','1.0.1','1.0.1','1.2.0'],
  ['srq63_brown_miller_zh_cn_research','1.0.1','1.0.0','1.2.0'],
  ['ars30_2016_zh_cn_research','1.0.0','1.0.0','1.2.0'],
  ['bpses5_zh_cn_research','1.0.0','1.0.0','1.2.0'],
  ['brcs4_zh_cn_research','1.0.0','1.0.0','1.2.0'],
  ['cfsr12_zh_cn_research','1.0.1','1.0.2','1.2.0'],
  ['gse3_asku_zh_cn_research','1.0.0','1.0.0','1.2.0'],
  ['ie4_zh_cn_research','1.2.0','1.0.1','1.2.0'],
  ['ipip50_zh_cn_research','1.1.0','1.1.1','1.2.0'],
  ['ipip_attending_emotions10_zh_cn_research','1.0.0','1.0.1','1.2.0'],
  ['ipip_emotion_based_decision9_zh_cn_research','1.0.1','1.0.1','1.2.0'],
  ['ipip_empathic_concern10_zh_cn_research','1.0.1','1.0.2','1.2.0'],
  ['ipip_negative_expressivity10_zh_cn_research','1.0.1','1.0.1','1.2.0'],
  ['ipip_neo_c5_self_discipline10_zh_cn_research','1.0.0','1.0.0','1.2.0'],
  ['ipip_nfc10_zh_cn_research','1.0.0','1.0.1','1.2.0'],
  ['ipip_opt10_zh_cn_research','1.0.0','1.0.1','1.2.0'],
  ['ipip_positive_expressivity9_zh_cn_research','1.0.1','1.0.1','1.2.0'],
  ['ipip_responsive_distress10_zh_cn_research','1.0.1','1.0.1','1.2.0'],
  ['ipip_responsive_joy10_zh_cn_research','1.0.0','1.0.1','1.2.0'],
  ['ips9_2021_zh_cn','1.0.0','1.0.0','1.2.0'],
  ['jss8_zh_cn_research','1.0.1','1.0.0','1.2.0'],
  ['kseg6_zh_cn_research','1.0.1','1.0.1','1.2.0'],
  ['kusiv3_zh_cn_research','1.0.0','1.0.0','1.2.0'],
  ['mslq_critical_thinking5_zh_cn_research','1.0.1','1.0.1','1.2.0'],
  ['mwq5_zh_cn_research','1.0.1','1.0.0','1.2.0'],
  ['ofs10_zh_cn_research','1.0.0','1.0.0','1.2.0'],
  ['pba23_2018_zh_cn','1.0.1','1.0.0','1.2.0'],
  ['res9_zh_cn','1.0.0','1.0.0','1.2.0'],
  ['rses10_zh_cn_research','1.0.0','1.0.1','1.2.0'],
  ['sci8_zh_cn_research','1.0.0','1.0.0','1.2.0'],
  ['sop2_zh_cn_research','1.0.0','1.0.1','1.2.0'],
  ['sswq16_zh_cn_research','1.0.1','1.0.1','1.2.0'],
  ['tswq_zh_cn','1.0.1','1.0.0','1.2.0'],
  ['wibps7_adolescent_zh_cn_research','1.0.0','1.0.0','1.2.0'],
] as const

describe('Existing dual-report materials enter the independent report selector',()=>{
 it.each(reviewed)('%s preserves default, previous and fun R with the original C/P', (key,version,previousVersion,funVersion)=>{
  const source=getScaleInstrumentSource(key,version)!,original=canonicalHash(source)
  const parts=sourceParts(key,version),axes=Object.fromEntries(parts.map(p=>[p.axis,p])) as Record<'CONTENT'|'PARAMETERS'|'REPORT',Part>
  const reports=registeredParts(key).filter(p=>p.axis==='REPORT'&&p.payload!==null)
  expect(reports.map(r=>r.version)).toEqual([source.executable!.definition.report.reportVersion,previousVersion,funVersion])
  expect(reports[0]).toEqual(axes.REPORT)
  expect(new Set(reports.map(r=>r.hash)).size).toBe(3)
  for(const REPORT of reports){
   const combined=composeTriplet(key,{...axes,REPORT})
   expect(combined.blockers).toEqual([])
   expect(combined.parts.CONTENT).toEqual(axes.CONTENT)
   expect(combined.parts.PARAMETERS).toEqual(axes.PARAMETERS)
   expect(combined.definition.scoring).toEqual(source.executable!.definition.scoring)
   expect(hashScaleDefinition(combined.definition)).toBe(hashScaleDefinition(source.executable!.definition))
   expect(combined.template!.blocks.length).toBeGreaterThan(0)
  }
  expect(canonicalHash(source)).toBe(original)
 })
})
