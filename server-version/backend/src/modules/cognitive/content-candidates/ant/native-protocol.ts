import {antTrialEnvelope,type AntTrial,type AntConfig,antPlan} from './protocol'
/** User-confirmed on 2026-10-28, b50959839 proposal. A separate frozen presentation identity. */
export const ANT_NATIVE_GEOMETRY_VERSION='ant-calibrated-geometry-v1'
export interface AntViewport {width:number;height:number;devicePixelRatio:number;visualScale:number}
export interface AntFrozenDisplay {
 schemaVersion:1;calibrationId:string;geometryVersion:string;geometryHash:string;configHash:string;protocolSignature:string;
 origin:'host_physical_calibration'|'synthetic_fixture';referenceMm:number;referenceCssPx:number;viewingDistanceMm:number;viewport:AntViewport;
 geometry:{fieldWidthCssPx:number;fieldHeightCssPx:number;eccentricityCssPx:number;arrowWidthCssPx:number;arrowHeightCssPx:number;arrowSpacingCssPx:number;
 cueDiameterCssPx:number;strokeCssPx:number;responseWidthCssPx:number;responseHeightCssPx:number;responseGapCssPx:number};inputMap:{leftKey:string;rightKey:string}
}
export interface AntNativeRawRecord {
 schemaVersion:1;contextId:string;phase:'practice'|'test';key:string;core:Omit<AntTrial,'phase'>&{phase:'practice'|'test'};
 raw:{display:AntFrozenDisplay;frameTimesPerfMs:number[];frameOverflow:boolean;diagnostics:{kind:string;observedAtPerfMs:number;markerAtPerfMs:number}[];fixture:boolean;
 practice?:{policyVersion:string;round:number;timing:{cueMs:number;postCueMs:number;responseWindowMs:number;trialIntervalMs:number}}}
}
export function antNativeGeometry(referenceCssPx:number,viewingDistanceMm:number):AntFrozenDisplay['geometry']{
 if(!Number.isFinite(referenceCssPx)||referenceCssPx<50||referenceCssPx>360||!Number.isFinite(viewingDistanceMm)||viewingDistanceMm<100||viewingDistanceMm>2000)throw Error('Invalid measured ANT calibration')
 const px=(deg:number)=>2*viewingDistanceMm*Math.tan(deg*Math.PI/360)*referenceCssPx/50
 return {fieldWidthCssPx:px(8),fieldHeightCssPx:px(6),eccentricityCssPx:px(1.5),arrowWidthCssPx:px(1),arrowHeightCssPx:px(.5),arrowSpacingCssPx:px(1.25),
 cueDiameterCssPx:px(.6),strokeCssPx:px(.06),responseWidthCssPx:130,responseHeightCssPx:78,responseGapCssPx:18}
}
export const antNativeManifest=(config:AntConfig,seed:string)=>({formal:antPlan(config,seed),practice:[0,1,2].map(round=>antPlan(config,seed,'practice',round))})
/** The presentation binding enters the authoritative core hash; it never substitutes or corrects a captured clock. */
export function antNativeEnvelope(record:AntNativeRawRecord,displayHash:string){
 if(record.phase!=='test'||record.core.phase!=='test')throw Error('Practice cannot enter ANT formal core')
 return antTrialEnvelope({...record.core,phase:'test',presentationBinding:{schemaVersion:1,geometryVersion:record.raw.display.geometryVersion,geometryHash:record.raw.display.geometryHash,displayHash}} as AntTrial)
}
export const antNativePlanFromRecord=(r:AntNativeRawRecord)=>{
 const {phase,trialIndex,blockIndex,cue,location,direction,flanker,neutralVariant,plannedPreCueMs}=r.core
 return {phase,trialIndex,blockIndex,cue,location,direction,flanker,neutralVariant,plannedPreCueMs}
}
