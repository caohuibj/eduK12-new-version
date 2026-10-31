export type EducationPackageRef=
 |{provider:'NATIVE_RELEASE'|'GOVERNED_PACKAGE';versionId:string;contentHash:string}
 |{provider:'CODE_BUNDLE';bundleKey:string;bundleVersion:string;contentHash:string}
export type EducationPackageSummary={sourceRef:EducationPackageRef;catalogKey:string;title:string;kind:'PACKAGE_REFERENCE';sourceProvider:EducationPackageRef['provider'];
 family:'NATIVE_BUNDLE'|'BUNDLE'|'COMBINATION';toolKey:string;contentVersion:string;reportVersion:string|null;memberCount:number;population:unknown;
 allowedActions:string[];unavailableReason?:string;canEditOriginal:false;canSplit:false;canMix:false}
type PreviewBase=EducationPackageSummary&{readOnly:true}
export type EducationPackagePreview=
 |PreviewBase&{protocol:'NATIVE_BUNDLE_V3';description:string;members:Array<{slotKey:string;kind:string;position:number;required:boolean;instrumentKey:string;instrumentVersion:string;respondentType:string}>;
  engine:{key:string;version:string};context:{contextDefinitionVersion:string;fields:Array<{contextKey:string;required:boolean;valueType:string;enumValues?:string[]}>}|null;report:{key:string;version:string;title:string;sections:Record<string,string>};limitations:string[]}
 |PreviewBase&{protocol:'GOVERNED_COMPLETE_ORDERED_V1';members:Array<{slotKey:string;title:string;position:number;kind:string;source:{type:string;id:string;hash:string};sourceVersion:string}>;
  report:{version:string;title:string;introduction:string;blocks:Array<{type:'TEXT';text:string}|{type:'METRIC'|'FORM_FIELD';slotKey:string;label:string}>;disclaimer:string}|null;artifactHash:string}
