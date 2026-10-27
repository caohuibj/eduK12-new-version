import type { NativeTrial,NativeConfig,RecognitionConfig,projectNativeRecognitionReport } from '../../../../../../backend/src/modules/cognitive/content-candidates/continuous-recognition/native'
import type { Manifest } from '../../../../../../backend/src/modules/cognitive/content-candidates/continuous-recognition/protocol'
import type { TrialEnvelope } from '../../../../../../backend/src/modules/cognitive/v2/types'
export type { NativeTrial,NativeConfig }
export type Envelope=TrialEnvelope<NativeTrial>
export type NativeReport=ReturnType<typeof projectNativeRecognitionReport>
export interface Asset {assetId:string;sha256:string;url:string;width:number;height:number}
/** Host-produced, already verified platform freeze/asset binding. No independent client generator or publication authority. */
export interface RecognitionContext {contextKey:string;configHash:string;protocolSignature:string;randomSeed:string;
  manifestHash:string;config:RecognitionConfig;manifest:Manifest;
  presentationApproval:'recognition-300-css-single-seen-20261026';
  assetManifest:{status:'authorized'|'synthetic-review-only'|'pending';manifestHash:string;evidenceRef:string;assets:Asset[]}}
export interface CapturedRecord {contextKey:string;recordKey:string;binding:{configHash:string;protocolSignature:string;manifestHash:string;assetManifestHash:string;randomSeed:string};phase:'practice'|'formal';envelope:Envelope;
  note:{practice?:{policyVersion:'recognition-guided-practice-v1';round:number;imageMs:1200;isiMs:800};stopReason:string|null;synthetic:boolean;unassignedBoundaryEvents:NativeTrial['events'];allEvents:NativeTrial['events'];
    actualExposure:{imageOnsetMs:number;imageOffsetMs:number|null;windowEndMs:number|null};realm:{timeOriginMs:number;pageInstanceId:string}}}
export interface SealedRecord extends CapturedRecord {recordDigest:string}
export interface LocalReceipt {contextKey:string;recordKey:string;recordDigest:string;retained:true}
export interface FinalClaim {contextKey:string;manifestHash:string;formalCount:number;practiceCount:number;termination:'completed'|'aborted';recordDigests:string[];finalPayloadDigest:string}
export interface FinalReceipt {contextKey:string;manifestHash:string;finalPayloadDigest:string;formalCount:number;practiceCount:number;finalSaved:true;receiptId:string;report:NativeReport}
export interface RecognitionPorts {
  /** Local durable open-attempt marker. A resumed/previously exposed attempt MUST NOT return fresh. */
  prepareLocalAttempt(context:RecognitionContext):Promise<{contextKey:string;bindingDigest:string;fresh:true}>
  /** Local durable draft only, no per-image HTTP/COS. A rejection retains the exact record for retry. */
  persistLocalDraft(record:SealedRecord):Promise<LocalReceipt>
  /** Only after local drafts drain; real host server/archive receipt, never callback resolve=durability. */
  finalize(input:FinalClaim):Promise<FinalReceipt>
}
export const clone=<T,>(value:T):T=>structuredClone(value)
