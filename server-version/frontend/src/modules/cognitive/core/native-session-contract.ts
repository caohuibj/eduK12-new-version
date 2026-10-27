import type { CognitiveSession } from '../types'
import type { FinalDraftMeta } from '../../../services/persistence/finalDraftStore'
import type { CognitiveCoreSavedReceipt } from './runner.types'
import { cognitiveRawDigest } from './raw-archive'
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
/** Validate consistency of server-returned facts; this does not authorize a client-created snapshot. */
export function assertNativeSession(session:CognitiveSession){
 const s=session.sessionSnapshot
 if(!session.nativeTask||session.deliveryMode!=='FINAL_ONLY'||!s||s.schemaVersion!==1
  ||!Number.isSafeInteger(session.attemptEpoch)||session.attemptEpoch!<1||session.attemptEpoch!==session.attemptNo
  ||(session.sessionEpoch!==undefined&&session.sessionEpoch!==session.attemptEpoch)
  ||s.testType!==session.testType||s.engineVersion!==session.engineVersion||s.scoringVersion!==session.scoringVersion
  ||s.configVersion!==session.configVersion||!hex(s.configHash)||s.configHash!==session.definitionHash
  ||!hex(s.protocolSignature)||s.protocolSignature!==session.protocolSignature
  ||cognitiveRawDigest(s.config)!==cognitiveRawDigest(session.config)||cognitiveRawDigest(s.protocol)!==cognitiveRawDigest(session.protocol))
  throw Error('测验设置尚未准备好，请联系发布者')
 return s
}
export function nativeCoreReceipt(session:CognitiveSession,meta:FinalDraftMeta,value:unknown):CognitiveCoreSavedReceipt {
 assertNativeSession(session)
 const v=value as Record<string,any>,r=v?.response??v
 if(meta.attemptId!==session.sessionId||meta.attemptEpoch!==session.attemptEpoch||meta.definitionHash!==session.definitionHash
  ||v?.coreSaved!==true||v.sessionId!==session.sessionId||v.attemptEpoch!==session.attemptEpoch
  ||v.submissionId!==meta.submissionId||v.definitionHash!==meta.definitionHash||!hex(v.payloadHash)
  ||r?.status!=='COMPLETED'||r.sessionId!==session.sessionId)throw Error('服务器尚未确认本次提交成功')
 return {coreSaved:true,sessionId:session.sessionId,attemptEpoch:session.attemptEpoch!,submissionId:meta.submissionId,
  definitionHash:meta.definitionHash,payloadHash:v.payloadHash}
}
export function nativeCompletedReceipt(session:CognitiveSession,meta:FinalDraftMeta):CognitiveCoreSavedReceipt {
 assertNativeSession(session)
 if(session.status!=='COMPLETED'||session.sessionId!==meta.attemptId||session.attemptEpoch!==meta.attemptEpoch
  ||session.definitionHash!==meta.definitionHash||session.submissionId!==meta.submissionId||!hex(session.submissionPayloadHash))
  throw Error('服务器尚未确认本次提交成功')
 return {coreSaved:true,sessionId:session.sessionId,attemptEpoch:meta.attemptEpoch,submissionId:meta.submissionId,
  definitionHash:meta.definitionHash,payloadHash:session.submissionPayloadHash}
}
