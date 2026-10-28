import {cognitiveRawDigest} from './raw-archive'
export interface NativeCompletion {schemaVersion:1;contextKey:string;configHash:string;protocolSignature:string;manifestHash:string;formalCount:number;practiceCount:number;termination:'completed'|'aborted';terminationReason:string|null;finalPayloadDigest:string}
/** Read only the locally sealed original claim. Never infer termination from the current UI or an archive response. */
export function nativeCompletionFromArchive(value:unknown):NativeCompletion|undefined{
 if(!value||typeof value!=='object'||(value as {kind?:unknown}).kind!=='COGNITIVE_NATIVE_CONTENT_V1')return undefined
 const raw=value as {claim?:Record<string,unknown>},c=raw.claim
 if(!c)throw Error('原件缺少结束声明')
 const {finalPayloadDigest,...body}=c,formalCount=c.formalCount??c.formalCaptureCount
 if(finalPayloadDigest!==cognitiveRawDigest(body)||!['completed','aborted'].includes(String(c.termination))||!Number.isInteger(formalCount)||Number(formalCount)<1
  ||!Number.isInteger(c.practiceCount)||Number(c.practiceCount)<0||!['contextKey','configHash','protocolSignature','manifestHash'].every(k=>typeof c[k]==='string'))throw Error('原件结束声明尚未核对')
 return {schemaVersion:1,contextKey:c.contextKey as string,configHash:c.configHash as string,protocolSignature:c.protocolSignature as string,manifestHash:c.manifestHash as string,
  formalCount:Number(formalCount),practiceCount:Number(c.practiceCount),termination:c.termination as NativeCompletion['termination'],terminationReason:c.terminationReason as string|null,finalPayloadDigest:finalPayloadDigest as string}
}
