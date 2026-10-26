import type {NativeReport} from './contracts'
export function isNativeRecognitionProjection(v:NativeReport,expected?:{configHash:string;protocolSignature:string;
  assetManifestHash:string;formalCount:number;assetStatus:string;synthetic:boolean}):boolean {
  if(!v||v.reportVersion!=='0.2.0'||v.scoringVersion!=='0.2.0'||v.qualityRule!=='product-session-descriptive-0.2.0'
    ||v.canGenerateTakeHomeImage!==false||v.interpretationScope!=='this-session-descriptive-only'
    ||!Array.isArray(v.reasons)||!['interpretable','limited','invalid'].includes(v.state))return false
  if(expected&&(v.configHash!==expected.configHash||v.protocolSignature!==expected.protocolSignature
    ||v.assetManifestHash!==expected.assetManifestHash||v.receivedTrialCount!==expected.formalCount))return false
  if(v.state!=='interpretable')return [v.hitRate,v.falseAlarmRate,v.correctedRecognitionRate,v.targetHits,v.targetFalseAlarms,v.denominator].every(n=>n===null)
  const integer=(n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=0
  const n=v.denominator
  const hex=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s)
  return hex(v.configHash)&&hex(v.protocolSignature)&&hex(v.assetManifestHash)&&(!expected||(!expected.synthetic&&expected.assetStatus==='authorized'))&&v.reasons.length===0
    &&(v.profile==='experience'||v.profile==='research')&&integer(n)&&n>0&&n===(v.profile==='experience'?20:60)
    &&v.plannedTargetPairs===n&&v.completeTargetPairs===n&&v.expectedTrialCount===(v.profile==='experience'?100:260)
    &&v.receivedTrialCount===v.expectedTrialCount&&integer(v.targetHits)&&integer(v.targetFalseAlarms)
    &&v.targetHits<=n&&v.targetFalseAlarms<=n&&v.hitRate===v.targetHits/n&&v.falseAlarmRate===v.targetFalseAlarms/n
    &&typeof v.correctedRecognitionRate==='number'&&Number.isFinite(v.correctedRecognitionRate)
    &&v.correctedRecognitionRate===v.hitRate-v.falseAlarmRate
}
