import {BLINK_IDENTITY,blinkConfig} from '../attentional-blink/protocol'
import {blinkDefinition} from '../attentional-blink/package'
import {EFFORT_IDENTITY,effortConfig} from '../balloon-effort/protocol'
import {balloonEffortDefinition} from '../balloon-effort/package'
import {DUAL_IDENTITY,dualConfig} from '../dual-arrow/protocol'
import {dualDefinition} from '../dual-arrow/package'
import {GRAD_IDENTITY,gradConfig} from '../gradcpt/protocol'
import {gradDefinition} from '../gradcpt/package'
import {HF_IDENTITY,hfConfig} from '../hearts-flowers/protocol'
import {hfDefinition} from '../hearts-flowers/package'
import {HORIZON_IDENTITY,horizonConfig} from '../horizon-exploration/protocol'
import {horizonDefinition} from '../horizon-exploration/package'
import {SPATIAL_IDENTITY,spatialConfig} from '../precision-working-memory/protocol'
import {spatialMemoryDefinition} from '../precision-working-memory/package'
import {SEARCH_IDENTITY,searchConfig} from '../visual-search/protocol'
import {searchDefinition} from '../visual-search/package'
import {ANT_GUIDED_IDENTITY,antGuidedConfig} from '../ant/protocol'
import {antGuidedDefinition} from '../ant/package'
import { MOT_IDENTITY, motConfig } from '../mot/protocol'
import { ENUMERATION_RECIPE_IDENTITY, enumerationRecipeConfig } from '../enumeration/protocol'
import type { CognitiveSeed } from '../../task-seed.types'

/** One base configuration plus the exact native task's two profile patches, never two duplicate version rows. */
export function nativeMotConfigSeed() {
  return { testType: MOT_IDENTITY.testType, configVersion: MOT_IDENTITY.configVersion,
    name: '多目标追踪', engineVersion: MOT_IDENTITY.engineVersion, scoringVersion: MOT_IDENTITY.scoringVersion,
    config: {...motConfig('experience')}, status: 'DRAFT' as const }
}
export function nativeEnumerationConfigSeed() {
  return { testType: ENUMERATION_RECIPE_IDENTITY.testType, configVersion: ENUMERATION_RECIPE_IDENTITY.configVersion,
    name: '短时点数判断', engineVersion: ENUMERATION_RECIPE_IDENTITY.engineVersion, scoringVersion: ENUMERATION_RECIPE_IDENTITY.scoringVersion,
    config: {...enumerationRecipeConfig('experience')}, status: 'DRAFT' as const }
}

/** Exact existing native configs shared by selected installation and Prisma seeding. */
const candidateSeed=(identity:{testType:string;configVersion:string;engineVersion:string;scoringVersion:string},name:string,config:object):CognitiveSeed=>({
  testType:identity.testType,configVersion:identity.configVersion,engineVersion:identity.engineVersion,scoringVersion:identity.scoringVersion,name,config:{...config},status:'DRAFT',
})

export const nativeCognitiveConfigSeeds: readonly CognitiveSeed[] = [
  nativeMotConfigSeed(), nativeEnumerationConfigSeed(),
  candidateSeed(BLINK_IDENTITY,blinkDefinition.name,blinkConfig('experience')),
  candidateSeed(EFFORT_IDENTITY,balloonEffortDefinition.name,effortConfig('experience')),
  candidateSeed(DUAL_IDENTITY,dualDefinition.name,dualConfig('experience')),
  candidateSeed(GRAD_IDENTITY,gradDefinition.name,gradConfig('experience')),
  candidateSeed(HF_IDENTITY,hfDefinition.name,hfConfig('experience')),
  candidateSeed(HORIZON_IDENTITY,horizonDefinition.name,horizonConfig('experience')),
  candidateSeed(SPATIAL_IDENTITY,spatialMemoryDefinition.name,spatialConfig('experience')),
  candidateSeed(SEARCH_IDENTITY,searchDefinition.name,searchConfig('experience')),
  candidateSeed(ANT_GUIDED_IDENTITY,antGuidedDefinition.name,antGuidedConfig('experience')),
]
