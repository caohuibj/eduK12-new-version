import type { AntConfig,Direction } from './generated/protocol'
import type {AntViewport,AntFrozenDisplay} from './generated/native-protocol'
export type {AntViewport,AntFrozenDisplay} from './generated/native-protocol'
export interface AntDisplayPort { frozen:AntFrozenDisplay;readViewport:()=>AntViewport }
const hash=(v:string)=>/^[a-f0-9]{64}$/.test(v)
export function antDisplayProblem(display:AntFrozenDisplay|null,current:AntViewport,config:AntConfig,configHash:string,protocolSignature:string,fixture=false):string|null{
  if(!display)return 'missing_frozen_geometry'
  if(display.schemaVersion!==1||!display.calibrationId||!display.geometryVersion||!hash(display.geometryHash)
    ||!hash(configHash)||!hash(protocolSignature)||display.configHash!==configHash||display.protocolSignature!==protocolSignature)
    return 'frozen_identity_mismatch'
  if(display.origin!=='host_physical_calibration'&&!(fixture&&display.origin==='synthetic_fixture'))return 'physical_calibration_required'
  if(![display.referenceMm,display.referenceCssPx,display.viewingDistanceMm].every(n=>Number.isFinite(n)&&n>0))return 'invalid_physical_calibration'
  const g=display.geometry,v=display.viewport
  if(!g||!Object.values(g).every(n=>Number.isFinite(n)&&n>0))return 'invalid_geometry'
  if(!Object.values(current).every(n=>Number.isFinite(n)&&n>0)||!Object.values(v).every(n=>Number.isFinite(n)&&n>0))return 'invalid_viewport'
  if((['width','height','devicePixelRatio','visualScale'] as const).some(k=>Math.abs(current[k]-v[k])>0.01))return 'viewport_changed'
  if(g.fieldWidthCssPx>v.width-28||g.fieldHeightCssPx+g.responseHeightCssPx+80>v.height
    ||g.responseWidthCssPx*2+g.responseGapCssPx>v.width-28)return 'frozen_geometry_does_not_fit'
  if(g.arrowSpacingCssPx<g.arrowWidthCssPx||4*g.arrowSpacingCssPx+g.arrowWidthCssPx>g.fieldWidthCssPx
    ||2*g.eccentricityCssPx+Math.max(g.arrowHeightCssPx,g.cueDiameterCssPx)>g.fieldHeightCssPx
    ||g.responseWidthCssPx<44||g.responseHeightCssPx<44)return 'invalid_geometry'
  if(!display.inputMap||!display.inputMap.leftKey||!display.inputMap.rightKey||display.inputMap.leftKey===display.inputMap.rightKey)
    return 'invalid_input_mapping'
  if(config.neutralVariant!=='absent'&&config.neutralVariant!=='dashes')return 'unknown_neutral_variant'
  return null
}
export const antDirectionForKey=(display:AntFrozenDisplay,key:string):Direction|null=>
  key===display.inputMap.leftKey?'left':key===display.inputMap.rightKey?'right':null
export const readAntViewport=():AntViewport=>({width:window.innerWidth,height:window.innerHeight,
  devicePixelRatio:window.devicePixelRatio,visualScale:window.visualViewport?.scale??1})
