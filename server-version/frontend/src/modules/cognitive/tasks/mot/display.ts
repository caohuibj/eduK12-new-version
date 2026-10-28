import type { MotCalibration } from './generated/protocol'

export function readMotDisplay(language:'zh'|'en',referenceCssPx:number,viewingDistanceMm:number):MotCalibration {
  return {version:1,method:'ruler_and_distance_self_reported',referenceMm:50,referenceCssPx,viewingDistanceMm,
    viewportWidthCssPx:window.innerWidth,viewportHeightCssPx:window.innerHeight,
    devicePixelRatio:window.devicePixelRatio||1,visualViewportScale:window.visualViewport?.scale??1,language}
}
