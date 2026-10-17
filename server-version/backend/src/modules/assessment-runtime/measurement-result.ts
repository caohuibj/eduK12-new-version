import { canonicalHash } from './canonical'

/** Shared versioned projection, not an additional scoring engine. Adapters feed
 * the exact stored output of existing Scale/SJT/Cognitive kernels. Reports and
 * exports consume this projection; they must never call a scorer on read. */
export interface MeasurementIdentityV1 {
  schemaVersion:1
  kind:'FORM'|'SCALE'|'SJT'|'COGNITIVE'
  sourceDigest:string
  scoringDigest:string|null
  engineVersion:string
  scoringVersion:string
  protocolDigest:string|null
}
export interface MeasurementMetricV1 {
  key:string
  value:number|null
  unit:string|null
  status:'OK'|'NOT_CALCULABLE'
}
export interface MeasurementResultV1 {
  schemaVersion:1
  measurementDigest:string
  identity:MeasurementIdentityV1
  metrics:MeasurementMetricV1[]
  quality:{status:string;flags:Record<string,boolean>}
}
export interface MeasurementReportV1 {
  schemaVersion:1
  measurementDigest:string
  audience:'RESEARCHER'|'PARTICIPANT'
  metrics:MeasurementMetricV1[]
  quality:string
}
export const measurementIdentityDigest=(identity:MeasurementIdentityV1)=>canonicalHash(identity)
export function projectStoredMeasurement(input:{identity:MeasurementIdentityV1;
  measurementDigest?:string;storedResult:unknown;metricUnits?:Readonly<Record<string,string>>}):MeasurementResultV1 {
  const result=(input.storedResult??{}) as {scores?:unknown;metrics?:unknown;
    quality?:{status?:string;state?:string;flags?:Record<string,boolean>|string[]};qualityFlags?:Record<string,boolean>}
  const source=result.scores??result.metrics??[]
  const records=Array.isArray(source)?source:Object.entries(source as Record<string,unknown>)
    .map(([key,value])=>({key,value}))
  const metrics:MeasurementMetricV1[]=records.map((item:any)=>({
    key:String(item.key),value:typeof item.value==='number'&&Number.isFinite(item.value)?item.value:null,
    unit:input.metricUnits?.[item.key]??null,
    status:typeof item.value==='number'&&Number.isFinite(item.value)?'OK':'NOT_CALCULABLE',
  }))
  const storedFlags=result.qualityFlags??result.quality?.flags??{}
  const flags=Array.isArray(storedFlags)
    ?Object.fromEntries(storedFlags.filter((flag):flag is string=>typeof flag==='string').map(flag=>[flag,true]))
    :Object.fromEntries(Object.entries(storedFlags).filter(([,v])=>typeof v==='boolean'))
  return {schemaVersion:1,measurementDigest:input.measurementDigest??measurementIdentityDigest(input.identity),
    identity:input.identity,metrics,quality:{status:result.quality?.status??result.quality?.state??
      (flags.interpretable===false?'NOT_INTERPRETABLE':'RECORDED'),flags}}
}
/** Disclosure is an independent allowlist projection, never object spreading
 * of a private result. The caller must authorize the source and release time. */
export function projectMeasurementReport(result:MeasurementResultV1,
  audience:MeasurementReportV1['audience'],allowedMetricKeys:readonly string[]):MeasurementReportV1 {
  const allowed=new Set(allowedMetricKeys)
  return {schemaVersion:1,measurementDigest:result.measurementDigest,audience,
    metrics:result.metrics.filter(m=>allowed.has(m.key)).map(m=>({key:m.key,value:m.value,
      unit:m.unit,status:m.status})),quality:result.quality.status}
}
/** Stable derived-artifact identity. Publication policy and renderer versions
 * participate so a changed disclosure policy cannot reuse an older artifact. */
export const measurementReportKey=(input:{resultHash:string;audience:string;
  policyDigest:string;rendererVersion:string})=>canonicalHash(input)
