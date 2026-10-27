// Exact pure content projection. Backend SHA256: c94aff14594f7c53d7cd0bde356e18bf273ce47ae1414a6cdac3c6a2c345cef4
import {SPATIAL_IDENTITY,type Profile,type Input} from './protocol'
export interface SpatialReport {testType:'precision-working-memory';engineVersion:'0.1.0';scoringVersion:'0.1.0';reportDefinitionVersion:'0.1.0';presentationVersion:'0.1.0';
  configHash:string;protocolSignature:string;profile:Profile;state:'interpretable'|'limited'|'invalid';planned:number;received:number;excluded:number;lateResponses:number;inputs:Input[];
  conditions:Array<{setSize:1|5;valid:number;planned:number;meanAbsoluteErrorDeg:number|null;medianAbsoluteErrorDeg:number|null}>}
export function isSpatialReport(v:unknown,expected?:{configHash:string;protocolSignature:string;profile:Profile;received?:number}):v is SpatialReport{
  if(!v||typeof v!=='object')return false
  const r=v as SpatialReport,integer=(n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=0,
    hex=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s),error=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=180
  if(r.testType!==SPATIAL_IDENTITY.testType||r.engineVersion!==SPATIAL_IDENTITY.engineVersion||r.scoringVersion!==SPATIAL_IDENTITY.scoringVersion
    ||r.reportDefinitionVersion!=='0.1.0'||r.presentationVersion!=='0.1.0'||!hex(r.configHash)||!hex(r.protocolSignature)||!['research','experience'].includes(r.profile)
    ||!['interpretable','limited','invalid'].includes(r.state)||r.planned!==(r.profile==='research'?400:40)||!integer(r.received)||r.received>r.planned||!integer(r.excluded)||r.excluded>r.received
    ||!integer(r.lateResponses)||!Array.isArray(r.inputs)||r.inputs.some(i=>!['touch','mouse','pen','keyboard'].includes(i))||new Set(r.inputs).size!==r.inputs.length
    ||!Array.isArray(r.conditions)||r.conditions.length!==2)return false
  if(expected&&(expected.configHash!==r.configHash||expected.protocolSignature!==r.protocolSignature||expected.profile!==r.profile||(expected.received!==undefined&&expected.received!==r.received)))return false
  let valid=0
  for(const [i,c] of r.conditions.entries()){
    if(!c||c.setSize!==(i===0?1:5)||c.planned!==r.planned/2||!integer(c.valid)||c.valid>c.planned)return false
    if(c.valid===0?(c.meanAbsoluteErrorDeg!==null||c.medianAbsoluteErrorDeg!==null):(!error(c.meanAbsoluteErrorDeg)||!error(c.medianAbsoluteErrorDeg)))return false
    valid+=c.valid
  }
  if(valid+r.excluded!==r.received||r.lateResponses>valid)return false
  return r.state==='invalid'?valid===0:r.state==='interpretable'?valid===r.planned&&r.excluded===0:valid>0&&valid<r.planned
}
/** The sole public report projection: actual counts/natural units, no fitted capacity, norms or hidden-score bypass. */
export function projectSpatialReport(score:{metrics:Record<string,unknown>;quality:{state:string};audit:{scorerVersion:string}}):SpatialReport{
  const m=score.metrics,b=m.reportBinding as Record<string,unknown>|undefined
  if(!b||b.testType!==SPATIAL_IDENTITY.testType||b.engineVersion!==SPATIAL_IDENTITY.engineVersion||b.scoringVersion!==SPATIAL_IDENTITY.scoringVersion
    ||b.reportDefinitionVersion!=='0.1.0'||score.audit.scorerVersion!==SPATIAL_IDENTITY.scoringVersion)throw Error('Unknown spatial report binding')
  const degrees=(value:unknown)=>{if(value===null)return null;const v=value as {value?:unknown;unit?:unknown};if(!v||v.unit!=='deg'||typeof v.value!=='number')throw Error('Expected angular metric in degrees');return v.value}
  const result:unknown={...SPATIAL_IDENTITY,reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0',configHash:b.configHash,protocolSignature:b.protocolSignature,profile:b.profile,state:score.quality.state,
    planned:m.expectedTrialCount,received:m.receivedTrialCount,excluded:m.excludedTrialCount,lateResponses:m.lateResponseCount,inputs:m.inputSourcesObserved,
    conditions:([1,5] as const).map(setSize=>({setSize,valid:m['set'+setSize+'ValidCount'],planned:m['set'+setSize+'ExpectedCount'],meanAbsoluteErrorDeg:degrees(m['set'+setSize+'MeanAbsoluteErrorDeg']),medianAbsoluteErrorDeg:degrees(m['set'+setSize+'MedianAbsoluteErrorDeg'])}))}
  if(!isSpatialReport(result))throw Error('Inconsistent spatial report data')
  return result
}
export const SPATIAL_REPORT_COPY={
  zh:{title:'这次，你把位置记在了哪里？',explanation:'角度越小，表示本次落点更接近目标；记1个和5个位置分别呈现，不合成记忆容量分。',
    tip:'日常需要记住物品位置时，可以尝试固定摆放或增加文字提示。这是一般方法，不是本次测验验证的训练效果。',
    limit:'颜色辨认、屏幕和输入操作都可能影响结果；年龄、人群和中文适用性未核，没有同龄排名或诊断结论。'},
  en:{title:'Where did you remember the positions this time?',explanation:'A smaller angle means your selection was closer to the target in this run. One- and five-item records stay separate, without a memory-capacity score.',
    tip:'For everyday locations, you could try fixed places or written cues. This is a general suggestion, not a training effect established by this test.',
    limit:'Colour perception, the display and input controls may affect the record. Age, population and Chinese-language suitability remain unverified; no age ranking or diagnosis is provided.'}}
