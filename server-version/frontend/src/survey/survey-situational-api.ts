export type SurveySituationalReference={protocol:'SITUATIONAL_NATIVE_V1';attemptId:string;submissionId:string;payloadHash:string}
export const isSurveySituationalReference=(value:unknown):value is SurveySituationalReference=>{
  const v=value as SurveySituationalReference|undefined
  return !!v&&v.protocol==='SITUATIONAL_NATIVE_V1'&&typeof v.attemptId==='string'
    &&/^[a-f0-9-]{36}$/i.test(v.attemptId)&&typeof v.submissionId==='string'
    &&/^[a-f0-9-]{36}$/i.test(v.submissionId)&&/^[a-f0-9]{64}$/.test(v.payloadHash)
}
