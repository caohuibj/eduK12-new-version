import type {PrivateToolSummary,PrivateToolVersion} from './privateToolClient'
export type CompositionSource={provider:'PRIVATE_VERSION';kind:'SCALE'|'FORM';versionId:string;contentHash:string}
export type CompositionDefinition={schemaVersion:1;adapterVersion:'1.0.0';administration:{population:'TEACHER'|'STUDENT';responseMode:'SELF'};
 instruction:string;blocks:Array<{blockId:string;instruction:string;source:CompositionSource}>}
export type CompositionReference=PrivateToolVersion&{toolId:string;kind:'SCALE'|'FORM'}
export type CompositionSummary=Omit<PrivateToolSummary,'kind'>&{kind:'COMPOSITION'}
export type CompositionTool=CompositionSummary&{definition:CompositionDefinition;references?:CompositionReference[]}
export const compositionTitle=(block:CompositionDefinition['blocks'][number],references:CompositionReference[])=>
 references.find(row=>row.id===block.source.versionId&&row.contentHash===block.source.contentHash&&row.kind===block.source.kind)?.title??'固定'+(block.source.kind==='SCALE'?'量表':'表单')
