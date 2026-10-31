import {z} from 'zod'
import {canonicalHash} from '../../assessment-runtime/canonical'
import {scaleReportDefinitionSchema} from '../scale-definition'
import type {ScaleInstrumentSourceV1} from './types'
import {scaleSourceAxisPayloads} from './source-snapshot'
import cfq from '../instruments/cfq7_zh_cn_research/1.0.1/report-variants.json'
import efficacy from '../instruments/ipip_neo_c1_self_efficacy10_zh_cn_research/1.0.0/report-variants.json'
import procrastination from '../instruments/bps9_zh_cn_research/1.0.0/report-variants.json'
import reviewed0 from '../instruments/bat23_2020_en/1.0.0/report-variants.json'
import reviewed1 from '../instruments/cbi_zh_cn/1.0.1/report-variants.json'
import reviewed2 from '../instruments/ccfq18_zh_cn/1.0.0/report-variants.json'
import reviewed3 from '../instruments/cesd10_zh_cn_research/1.0.0/report-variants.json'
import reviewed4 from '../instruments/chime_s24_zh_cn_research/1.0.1/report-variants.json'
import reviewed5 from '../instruments/csacs9_zh_cn/1.0.1/report-variants.json'
import reviewed6 from '../instruments/ctas2_cognitive_en/1.0.1/report-variants.json'
import reviewed7 from '../instruments/curiosity_5dcr24_zh_cn_research/1.0.0/report-variants.json'
import reviewed8 from '../instruments/djgls6_zh_cn_research/1.0.1/report-variants.json'
import reviewed9 from '../instruments/ebq16_zh_cn_research/1.0.2/report-variants.json'
import reviewed10 from '../instruments/erss19_zh_cn_research/1.0.0/report-variants.json'
import reviewed11 from '../instruments/ffmq15_zh_cn_research/1.0.1/report-variants.json'
import reviewed12 from '../instruments/gad7_zh_cn_research/1.1.0/report-variants.json'
import reviewed13 from '../instruments/hse_msit_zh_cn/1.0.1/report-variants.json'
import reviewed14 from '../instruments/k6_zh_cn_research/1.1.0/report-variants.json'
import reviewed15 from '../instruments/l1_zh_cn_research/1.0.0/report-variants.json'
import reviewed16 from '../instruments/maia2_37_zh_cn_research/1.0.1/report-variants.json'
import reviewed17 from '../instruments/mpmi_s22_zh_cn_research/1.0.0/report-variants.json'
import reviewed18 from '../instruments/orvis92_zh_cn_research/1.0.1/report-variants.json'
import reviewed19 from '../instruments/phq4_zh_cn_research/1.0.0/report-variants.json'
import reviewed20 from '../instruments/sas_sv10_zh_cn_research/1.0.0/report-variants.json'
import reviewed21 from '../instruments/socs_s20_2023_zh_cn/1.0.1/report-variants.json'
import reviewed22 from '../instruments/srq63_brown_miller_zh_cn_research/1.0.1/report-variants.json'
import reviewed23 from '../instruments/ars30_2016_zh_cn_research/1.0.0/report-variants.json'
import reviewed24 from '../instruments/bpses5_zh_cn_research/1.0.0/report-variants.json'
import reviewed25 from '../instruments/brcs4_zh_cn_research/1.0.0/report-variants.json'
import reviewed26 from '../instruments/cfsr12_zh_cn_research/1.0.1/report-variants.json'
import reviewed27 from '../instruments/gse3_asku_zh_cn_research/1.0.0/report-variants.json'
import reviewed28 from '../instruments/ie4_zh_cn_research/1.2.0/report-variants.json'
import reviewed29 from '../instruments/ipip50_zh_cn_research/1.1.0/report-variants.json'
import reviewed30 from '../instruments/ipip_attending_emotions10_zh_cn_research/1.0.0/report-variants.json'
import reviewed31 from '../instruments/ipip_emotion_based_decision9_zh_cn_research/1.0.1/report-variants.json'
import reviewed32 from '../instruments/ipip_empathic_concern10_zh_cn_research/1.0.1/report-variants.json'
import reviewed33 from '../instruments/ipip_negative_expressivity10_zh_cn_research/1.0.1/report-variants.json'
import reviewed34 from '../instruments/ipip_neo_c5_self_discipline10_zh_cn_research/1.0.0/report-variants.json'
import reviewed35 from '../instruments/ipip_nfc10_zh_cn_research/1.0.0/report-variants.json'
import reviewed36 from '../instruments/ipip_opt10_zh_cn_research/1.0.0/report-variants.json'
import reviewed37 from '../instruments/ipip_positive_expressivity9_zh_cn_research/1.0.1/report-variants.json'
import reviewed38 from '../instruments/ipip_responsive_distress10_zh_cn_research/1.0.1/report-variants.json'
import reviewed39 from '../instruments/ipip_responsive_joy10_zh_cn_research/1.0.0/report-variants.json'
import reviewed40 from '../instruments/ips9_2021_zh_cn/1.0.0/report-variants.json'
import reviewed41 from '../instruments/jss8_zh_cn_research/1.0.1/report-variants.json'
import reviewed42 from '../instruments/kseg6_zh_cn_research/1.0.1/report-variants.json'
import reviewed43 from '../instruments/kusiv3_zh_cn_research/1.0.0/report-variants.json'
import reviewed44 from '../instruments/mslq_critical_thinking5_zh_cn_research/1.0.1/report-variants.json'
import reviewed45 from '../instruments/mwq5_zh_cn_research/1.0.1/report-variants.json'
import reviewed46 from '../instruments/ofs10_zh_cn_research/1.0.0/report-variants.json'
import reviewed47 from '../instruments/pba23_2018_zh_cn/1.0.1/report-variants.json'
import reviewed48 from '../instruments/res9_zh_cn/1.0.0/report-variants.json'
import reviewed49 from '../instruments/rses10_zh_cn_research/1.0.0/report-variants.json'
import reviewed50 from '../instruments/sci8_zh_cn_research/1.0.0/report-variants.json'
import reviewed51 from '../instruments/sop2_zh_cn_research/1.0.0/report-variants.json'
import reviewed52 from '../instruments/sswq16_zh_cn_research/1.0.1/report-variants.json'
import reviewed53 from '../instruments/tswq_zh_cn/1.0.1/report-variants.json'
import reviewed54 from '../instruments/wibps7_adolescent_zh_cn_research/1.0.0/report-variants.json'

// Explicit reviewed material intake, not a directory scan or a mutable version
// store. The ordinary source stays the default and owns the only C/scorer/P.
const materials=[
  {material:cfq,origin:{commit:'6fa885ec74ca01350db25c44bd61c700648b05d1',path:'docs/scale-intake/materials-three-20261029/cfq7_zh_cn_research/report-variants.json'}},
  {material:efficacy,origin:{commit:'6fa885ec74ca01350db25c44bd61c700648b05d1',path:'docs/scale-intake/materials-three-20261029/ipip_neo_c1_self_efficacy10_zh_cn_research/report-variants.json'}},
  {material:procrastination,origin:{commit:'6fa885ec74ca01350db25c44bd61c700648b05d1',path:'docs/scale-intake/materials-three-20261029/bps9_zh_cn_research/report-variants.json'}},
  {material:reviewed0,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/bat23_2020_en/report-materials.json'}},
  {material:reviewed1,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/cbi_zh_cn/report-materials.json'}},
  {material:reviewed2,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/ccfq18_zh_cn/report-materials.json'}},
  {material:reviewed3,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/cesd10_zh_cn_research/report-materials.json'}},
  {material:reviewed4,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/chime_s24_zh_cn_research/report-materials.json'}},
  {material:reviewed5,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/csacs9_zh_cn/report-materials.json'}},
  {material:reviewed6,origin:{commit:'472237d8dbf6033f1b6ac5b2d965b3240632c4fd',path:'docs/scale-intake/dual-reports-final-20261029/ctas2_cognitive_en/report-materials.json'}},
  {material:reviewed7,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/curiosity_5dcr24_zh_cn_research/report-materials.json'}},
  {material:reviewed8,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/djgls6_zh_cn_research/report-materials.json'}},
  {material:reviewed9,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/ebq16_zh_cn_research/report-materials.json'}},
  {material:reviewed10,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/erss19_zh_cn_research/report-materials.json'}},
  {material:reviewed11,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/ffmq15_zh_cn_research/report-materials.json'}},
  {material:reviewed12,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/gad7_zh_cn_research/report-materials.json'}},
  {material:reviewed13,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/hse_msit_zh_cn/report-materials.json'}},
  {material:reviewed14,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/k6_zh_cn_research/report-materials.json'}},
  {material:reviewed15,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/l1_zh_cn_research/report-materials.json'}},
  {material:reviewed16,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/maia2_37_zh_cn_research/report-materials.json'}},
  {material:reviewed17,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/mpmi_s22_zh_cn_research/report-materials.json'}},
  {material:reviewed18,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/orvis92_zh_cn_research/report-materials.json'}},
  {material:reviewed19,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/phq4_zh_cn_research/report-materials.json'}},
  {material:reviewed20,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/sas_sv10_zh_cn_research/report-materials.json'}},
  {material:reviewed21,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/socs_s20_2023_zh_cn/report-materials.json'}},
  {material:reviewed22,origin:{commit:'ea5fc03cda7f4d78907a1755041113f725580b23',path:'docs/scale-intake/dual-reports-final-20261029/srq63_brown_miller_zh_cn_research/report-materials.json'}},
  {material:reviewed23,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/ars30_2016_zh_cn_research/report-materials.json'}},
  {material:reviewed24,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/bpses5_zh_cn_research/report-materials.json'}},
  {material:reviewed25,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/brcs4_zh_cn_research/report-materials.json'}},
  {material:reviewed26,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/cfsr12_zh_cn_research/report-materials.json'}},
  {material:reviewed27,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/gse3_asku_zh_cn_research/report-materials.json'}},
  {material:reviewed28,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/ie4_zh_cn_research/report-materials.json'}},
  {material:reviewed29,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/ipip50_zh_cn_research/report-materials.json'}},
  {material:reviewed30,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/ipip_attending_emotions10_zh_cn_research/report-materials.json'}},
  {material:reviewed31,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/ipip_emotion_based_decision9_zh_cn_research/report-materials.json'}},
  {material:reviewed32,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/ipip_empathic_concern10_zh_cn_research/report-materials.json'}},
  {material:reviewed33,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/ipip_negative_expressivity10_zh_cn_research/report-materials.json'}},
  {material:reviewed34,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/ipip_neo_c5_self_discipline10_zh_cn_research/report-materials.json'}},
  {material:reviewed35,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/ipip_nfc10_zh_cn_research/report-materials.json'}},
  {material:reviewed36,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/ipip_opt10_zh_cn_research/report-materials.json'}},
  {material:reviewed37,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/ipip_positive_expressivity9_zh_cn_research/report-materials.json'}},
  {material:reviewed38,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/ipip_responsive_distress10_zh_cn_research/report-materials.json'}},
  {material:reviewed39,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/ipip_responsive_joy10_zh_cn_research/report-materials.json'}},
  {material:reviewed40,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/ips9_2021_zh_cn/report-materials.json'}},
  {material:reviewed41,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/jss8_zh_cn_research/report-materials.json'}},
  {material:reviewed42,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/kseg6_zh_cn_research/report-materials.json'}},
  {material:reviewed43,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/kusiv3_zh_cn_research/report-materials.json'}},
  {material:reviewed44,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/mslq_critical_thinking5_zh_cn_research/report-materials.json'}},
  {material:reviewed45,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/mwq5_zh_cn_research/report-materials.json'}},
  {material:reviewed46,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/ofs10_zh_cn_research/report-materials.json'}},
  {material:reviewed47,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/pba23_2018_zh_cn/report-materials.json'}},
  {material:reviewed48,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/res9_zh_cn/report-materials.json'}},
  {material:reviewed49,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/rses10_zh_cn_research/report-materials.json'}},
  {material:reviewed50,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/sci8_zh_cn_research/report-materials.json'}},
  {material:reviewed51,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/sop2_zh_cn_research/report-materials.json'}},
  {material:reviewed52,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/sswq16_zh_cn_research/report-materials.json'}},
  {material:reviewed53,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/tswq_zh_cn/report-materials.json'}},
  {material:reviewed54,origin:{commit:'68d4b8398d2d2971470581218613266f6bc86974',path:'docs/scale-intake/dual-reports-next-20261029/wibps7_adolescent_zh_cn_research/report-materials.json'}}
]
const hash=z.string().regex(/^[a-f0-9]{64}$/)
const schema=z.object({schemaVersion:z.literal(1),instrumentKey:z.string().min(1),instrumentVersion:z.string().min(1),baseContentHash:hash,baseParametersHash:hash,
 variants:z.array(z.object({key:z.string().regex(/^[a-z][a-z0-9_-]*$/),title:z.string().trim().min(1).max(120),report:scaleReportDefinitionSchema}).strict()).min(1).max(8)}).strict()
export function readScaleReportVariantMaterial(source:ScaleInstrumentSourceV1,raw:unknown){
 const material=schema.parse(raw),parts=scaleSourceAxisPayloads(source)
 if(material.instrumentKey!==source.identity.instrumentKey||material.instrumentVersion!==source.identity.instrumentVersion
  ||material.baseContentHash!==canonicalHash(parts.content)||material.baseParametersHash!==canonicalHash(parts.parameters))throw new Error('SCALE_REPORT_VARIANT_SOURCE_MISMATCH')
 const versions=[parts.report.reportVersion,...material.variants.map(v=>v.report.reportVersion)]
 if(new Set(versions).size!==versions.length||new Set(material.variants.map(v=>v.key)).size!==material.variants.length)throw new Error('SCALE_REPORT_VARIANT_VERSION_CONFLICT')
 for(const variant of material.variants)if(!variant.report.interpretations.length)throw new Error('SCALE_REPORT_VARIANT_EMPTY')
 return material
}
export function listScaleReportVariants(source:ScaleInstrumentSourceV1){
 const selected=materials.find(({material})=>material.instrumentKey===source.identity.instrumentKey&&material.instrumentVersion===source.identity.instrumentVersion)
 if(!selected)return []
 const material=readScaleReportVariantMaterial(source,selected.material)
 return material.variants.map(variant=>({...variant,baseContentHash:material.baseContentHash,baseParametersHash:material.baseParametersHash,
  materialHash:canonicalHash(material),origin:selected.origin}))
}
