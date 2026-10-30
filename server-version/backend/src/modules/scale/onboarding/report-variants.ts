import {z} from 'zod'
import {canonicalHash} from '../../assessment-runtime/canonical'
import {scaleReportDefinitionSchema} from '../scale-definition'
import type {ScaleInstrumentSourceV1} from './types'
import {scaleSourceAxisPayloads} from './source-snapshot'
import cfq from '../instruments/cfq7_zh_cn_research/1.0.1/report-variants.json'
import efficacy from '../instruments/ipip_neo_c1_self_efficacy10_zh_cn_research/1.0.0/report-variants.json'
import procrastination from '../instruments/bps9_zh_cn_research/1.0.0/report-variants.json'

// Explicit reviewed material intake, not a directory scan or a mutable version
// store. The ordinary source stays the default and owns the only C/scorer/P.
const materials=[cfq,efficacy,procrastination]
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
 const raw=materials.find(m=>m.instrumentKey===source.identity.instrumentKey&&m.instrumentVersion===source.identity.instrumentVersion)
 if(!raw)return []
 const material=readScaleReportVariantMaterial(source,raw)
 return material.variants.map(variant=>({...variant,baseContentHash:material.baseContentHash,baseParametersHash:material.baseParametersHash,
  materialHash:canonicalHash(material),origin:{commit:'6fa885ec74ca01350db25c44bd61c700648b05d1',path:`docs/scale-intake/materials-three-20261029/${material.instrumentKey}/report-variants.json`}}))
}
