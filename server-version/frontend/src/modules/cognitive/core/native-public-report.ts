import type {NativePublicReportSnapshot} from '../types'
const hex=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
/** Structural binding only. The task-owned public guard remains mandatory before rendering its values. */
export function isNativePublicReportSnapshot(value:unknown):value is NativePublicReportSnapshot{
 if(!value||typeof value!=='object')return false
 const s=value as NativePublicReportSnapshot,r=s.report as Record<string,unknown>|null
 return s.schemaVersion===1&&['testType','engineVersion','scoringVersion','configVersion','reportDefinitionVersion','presentationVersion'].every(k=>typeof (s as unknown as Record<string,unknown>)[k]==='string'&&Boolean((s as unknown as Record<string,unknown>)[k]))
  &&hex(s.configHash)&&hex(s.protocolSignature)&&['experience','research'].includes(s.profile)&&['interpretable','limited','invalid'].includes(s.state)
  &&!!r&&typeof r==='object'&&!Array.isArray(r)&&['testType','engineVersion','scoringVersion','configHash','protocolSignature','reportDefinitionVersion','profile','state'].every(k=>r[k]===(s as unknown as Record<string,unknown>)[k])
}
