import {canonicalHash} from '../assessment-runtime/canonical'
/** Tool provenance, not statistical thresholds/norms. Never discard unknown metadata. */
export interface ToolReference {
 schemaVersion:1;family:'SCALE'|'COGNITIVE'|'SJT'|'FORM'|'COMBINATION'|'BUNDLE';toolKey:string
 metadata:Record<string,unknown>;metadataHash:string
 applications:unknown[];approvals:unknown[]
}
export function toolReference(family:ToolReference['family'],toolKey:string,metadata:Record<string,unknown>,applications:unknown[]=[],approvals:unknown[]=[]):ToolReference{
 const frozen=JSON.parse(JSON.stringify(metadata)) as Record<string,unknown>
 return {schemaVersion:1,family,toolKey,metadata:frozen,metadataHash:canonicalHash(frozen),applications:JSON.parse(JSON.stringify(applications)),approvals:JSON.parse(JSON.stringify(approvals))}
}
