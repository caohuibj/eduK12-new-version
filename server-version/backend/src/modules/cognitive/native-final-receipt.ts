/** The existing FINAL has already authorized and committed this identity. This mapper never scores or archives. */
export function withNativeCoreReceipt(data:Record<string,any>, context:{nativeTask?:boolean;attemptEpoch:number;compositeAttemptId:string|null},
  identity:{sessionId:string;submissionId:string;definitionHash:string}):Record<string,any>{
  // Parent/unit privacy projection keeps its established contract; the first archive journey is standalone only.
  if(!context.nativeTask||context.compositeAttemptId)return data
  const response=data.response??data
  if(response?.status!=='COMPLETED'||response.sessionId!==identity.sessionId
    ||data.submissionId!==identity.submissionId||!Number.isSafeInteger(context.attemptEpoch)||context.attemptEpoch<1
    ||!/^([a-f0-9]{64})$/.test(identity.definitionHash)||typeof data.payloadHash!=='string'||!/^([a-f0-9]{64})$/.test(data.payloadHash))
    throw new Error('Committed native FINAL receipt does not match its authorized identity')
  return {...data,coreSaved:true,sessionId:identity.sessionId,attemptEpoch:context.attemptEpoch,
    submissionId:data.submissionId,definitionHash:identity.definitionHash}
}

/** Only the explicitly implemented logged-in standalone/course journey is admitted by this native rollout. */
export const nativeFinalActorMatches=(child:{userId:string|null;compositeAttemptId:string|null;compositeItemId:string|null},userId?:string|null):boolean=>
  Boolean(userId&&child.userId===userId&&!child.compositeAttemptId&&!child.compositeItemId)
