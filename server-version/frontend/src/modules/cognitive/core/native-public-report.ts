import type {NativePublicReportSnapshot} from '../types'
const hex=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
/** Structural binding only. The task-owned public guard remains mandatory before rendering its values. */
export function isNativePublicReportSnapshot(value:unknown):value is NativePublicReportSnapshot{
 if(!value||typeof value!=='object')return false
 const s=value as NativePublicReportSnapshot,r=s.report as Record<string,unknown>|null
 if(!r||typeof r!=='object'||Array.isArray(r))return false
 const spatial=s.testType==='precision-working-memory'&&s.engineVersion==='0.1.0'&&s.scoringVersion==='0.1.0'&&s.configVersion==='0.1.0'
 const legacySpatial=s.participantPresentationVersion===undefined&&spatial&&s.presentationVersion==='0.1.1'&&r.presentationVersion==='0.1.0'
 const legacyAnt=s.participantPresentationVersion===undefined&&s.testType==='ant'&&s.engineVersion==='1.1.0'&&s.scoringVersion==='1.1.0'&&s.configVersion==='1.1.0'&&s.presentationVersion==='1.0.0'&&r.presentationVersion===undefined
 const nativeBound=s.presentationVersion===r.presentationVersion||legacySpatial||legacyAnt
 const participantBound=s.participantPresentationVersion===undefined||s.participantPresentationVersion===s.presentationVersion||(spatial&&s.participantPresentationVersion==='0.1.1'&&s.presentationVersion==='0.1.0')
 return nativeBound&&participantBound&&s.schemaVersion===1&&['testType','engineVersion','scoringVersion','configVersion','reportDefinitionVersion','presentationVersion'].every(k=>typeof (s as unknown as Record<string,unknown>)[k]==='string'&&Boolean((s as unknown as Record<string,unknown>)[k]))
  &&hex(s.configHash)&&hex(s.protocolSignature)&&['experience','research'].includes(s.profile)&&['interpretable','limited','invalid'].includes(s.state)
  &&!!r&&typeof r==='object'&&!Array.isArray(r)&&['testType','engineVersion','scoringVersion','configHash','protocolSignature','reportDefinitionVersion','profile','state'].every(k=>r[k]===(s as unknown as Record<string,unknown>)[k])
}
