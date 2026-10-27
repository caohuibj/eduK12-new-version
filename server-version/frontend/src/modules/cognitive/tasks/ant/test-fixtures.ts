import { antConfig,ANT_PROTOCOL } from './generated/protocol'
import type { AntFrozenDisplay,AntViewport } from './display'
/** Test/review fixture ONLY. The synthetic origin cannot start a non-fixture Task. */
export const ANT_FIXTURE_HASH='a'.repeat(64),ANT_FIXTURE_SIGNATURE='b'.repeat(64)
export const antFixtureDisplay=(viewport:AntViewport={width:390,height:844,devicePixelRatio:1,visualScale:1}):AntFrozenDisplay=>({
  schemaVersion:1,calibrationId:'SYNTHETIC-UNVALIDATED-DISPLAY',geometryVersion:'synthetic-review-only-v1',geometryHash:'c'.repeat(64),
  configHash:ANT_FIXTURE_HASH,protocolSignature:ANT_FIXTURE_SIGNATURE,origin:'synthetic_fixture',
  referenceMm:50,referenceCssPx:180,viewingDistanceMm:400,viewport,
  geometry:{fieldWidthCssPx:280,fieldHeightCssPx:280,eccentricityCssPx:52,arrowWidthCssPx:28,arrowHeightCssPx:18,
    arrowSpacingCssPx:34,cueDiameterCssPx:18,strokeCssPx:2,responseWidthCssPx:130,responseHeightCssPx:78,responseGapCssPx:18},
  inputMap:{leftKey:'ArrowLeft',rightKey:'ArrowRight'},
})
export const antFixtureConfig=()=>antConfig('experience')
export const antFixtureProtocol=ANT_PROTOCOL
