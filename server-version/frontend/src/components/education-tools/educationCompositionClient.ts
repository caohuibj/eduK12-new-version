import type {PrivateToolSummary,PrivateToolVersion} from './privateToolClient'
import type {CompositionAdministration} from './educationCompositionAdministration'
export type CompositionSource={provider:'PRIVATE_VERSION';kind:'SCALE'|'FORM';versionId:string;contentHash:string}|
 {provider:'LIBRARY_SCALE';kind:'SCALE';versionId:string;contentHash:string}|
 {provider:'STANDARD_SCALE';kind:'SCALE';versionId:string;contentHash:string}|
 {provider:'PUBLIC_FORM';kind:'FORM';versionId:string;contentHash:string}|
 {provider:'COGNITIVE_CONFIG';kind:'COGNITIVE';versionId:string;contentHash:string;profile:'experience'|'standard'|'research'}|
 {provider:'SJT_RELEASE';kind:'SJT';versionId:string;contentHash:string}
export type CompositionDefinition={schemaVersion:1|2;adapterVersion:'1.0.0'|'2.0.0';administration:CompositionAdministration;
 contextFields?:Array<{contextKey:import('../../modules/assessment-context/options').AssessmentContextKey;formType:'year_month'|'single_choice'|'fill_blank';formLabel:string;formOptions:Array<{value:string;label:string}>}>;
 instruction:string;blocks:Array<{blockId:string;instruction:string;source:CompositionSource}>}
export type CompositionReference=(Pick<PrivateToolVersion,'id'|'title'|'sourceRevision'|'contentHash'>&{toolId:string;kind:'SCALE'|'FORM';sourceProvider:'PRIVATE_VERSION'})|
 {id:string;kind:'FORM'|'SCALE'|'COGNITIVE'|'SJT';sourceProvider:'PUBLIC_FORM'|'STANDARD_SCALE'|'LIBRARY_SCALE'|'COGNITIVE_CONFIG'|'SJT_RELEASE';title:string;contentHash:string;version:string;versions?:{content:string;parameters:string|null;report:string|null};requiredContextKeys?:string[]}
export type CompositionSummary=Omit<PrivateToolSummary,'kind'>&{kind:'COMPOSITION'}
export type CompositionTool=CompositionSummary&{definition:CompositionDefinition;references?:CompositionReference[]}
export const compositionTitle=(block:CompositionDefinition['blocks'][number],references:CompositionReference[])=>
 references.find(row=>row.sourceProvider===block.source.provider&&row.id===block.source.versionId&&row.contentHash===block.source.contentHash&&row.kind===block.source.kind)?.title??'固定'+({SCALE:'量表',FORM:'表单',COGNITIVE:'认知任务',SJT:'情境任务'}[block.source.kind])
