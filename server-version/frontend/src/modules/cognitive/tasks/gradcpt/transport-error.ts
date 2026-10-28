export type GradTransportFailure='COMPRESSION_UNAVAILABLE'|'DECODED_LIMIT'|'PACKED_LIMIT'
export const isGradTransportFailure=(value:unknown):value is GradTransportFailure=>value==='COMPRESSION_UNAVAILABLE'||value==='DECODED_LIMIT'||value==='PACKED_LIMIT'
const reasons:Record<GradTransportFailure,{zh:string;en:string}>={
 COMPRESSION_UNAVAILABLE:{zh:'此浏览器暂不支持完整记录的无损压缩。',en:'This browser does not support lossless compression of the full record.'},
 DECODED_LIMIT:{zh:'这份完整记录暂时超过当前可保存的大小。',en:'This complete record is larger than the current saving limit.'},
 PACKED_LIMIT:{zh:'完整记录压缩后仍超过当前保存范围。',en:'The compressed record still exceeds the current saving limit.'},
}
export function gradTransportFailureMessage(code:GradTransportFailure,language:'zh'|'en'){
 return reasons[code][language]+(language==='en'?' The original record remains on this device. Keep this page open and contact the organiser; you do not need to repeat the task.':'原件仍保留在本机，请保留页面并联系组织者，不需要重新作答。')
}
/** Only this task-owned, fixed-message error may become a participant-facing reason. */
export class GradTransportError extends Error {
 constructor(readonly code:GradTransportFailure){super(gradTransportFailureMessage(code,'zh'));this.name='GradTransportError'}
}
