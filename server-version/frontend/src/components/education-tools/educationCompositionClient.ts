import type {PrivateToolSummary,PrivateToolVersion} from './privateToolClient'
export type CompositionSource={provider:'PRIVATE_VERSION';kind:'SCALE'|'FORM';versionId:string;contentHash:string}|
 {provider:'PUBLIC_FORM';kind:'FORM';versionId:string;contentHash:string}
export type CompositionDefinition={schemaVersion:1;adapterVersion:'1.0.0';administration:{population:'TEACHER'|'STUDENT';responseMode:'SELF'};
 instruction:string;blocks:Array<{blockId:string;instruction:string;source:CompositionSource}>}
export type CompositionReference=(Pick<PrivateToolVersion,'id'|'title'|'sourceRevision'|'contentHash'>&{toolId:string;kind:'SCALE'|'FORM';sourceProvider:'PRIVATE_VERSION'})|
 {id:string;kind:'FORM';sourceProvider:'PUBLIC_FORM';title:string;contentHash:string;version:string}
export type CompositionSummary=Omit<PrivateToolSummary,'kind'>&{kind:'COMPOSITION'}
export type CompositionTool=CompositionSummary&{definition:CompositionDefinition;references?:CompositionReference[]}
export const compositionTitle=(block:CompositionDefinition['blocks'][number],references:CompositionReference[])=>
 references.find(row=>row.sourceProvider===block.source.provider&&row.id===block.source.versionId&&row.contentHash===block.source.contentHash&&row.kind===block.source.kind)?.title??'固定'+(block.source.kind==='SCALE'?'量表':'表单')
