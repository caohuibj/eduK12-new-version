import {antGuidedNativeRecord} from '../ant/native-adapter'
import {contentDefinition,type NativeDefinitionRecord} from './content-contract'
import {BLINK_IDENTITY,blinkPlan} from '../attentional-blink/protocol'
import {projectBlinkReport,isBlinkReport} from '../attentional-blink/report'
import {blinkEnvelope} from '../attentional-blink/scorer'
import {EFFORT_IDENTITY,EFFORT_QUIZ,effortPlan} from '../balloon-effort/protocol'
import {projectEffortReport,isEffortReport} from '../balloon-effort/report'
import {effortEnvelope} from '../balloon-effort/scorer'
import {DUAL_IDENTITY,dualPlan} from '../dual-arrow/protocol'
import {projectDualReport,isDualReport} from '../dual-arrow/report'
import {dualEnvelope} from '../dual-arrow/scorer'
import {GRAD_IDENTITY,gradPlan,gradPracticePlans} from '../gradcpt/protocol'
import {projectGradReport,isGradReport} from '../gradcpt/report'
import {gradEnvelope} from '../gradcpt/scorer'
import {HF_IDENTITY,hfPlan} from '../hearts-flowers/protocol'
import {projectHFReport,isHFReport} from '../hearts-flowers/report'
import {hfEnvelope} from '../hearts-flowers/scorer'
import {HORIZON_IDENTITY,horizonPlan} from '../horizon-exploration/protocol'
import {projectHorizonReport,isHorizonReport} from '../horizon-exploration/report'
import {horizonEnvelope} from '../horizon-exploration/scorer'
import {SPATIAL_IDENTITY,spatialPlan} from '../precision-working-memory/protocol'
import {projectSpatialReport,isSpatialReport} from '../precision-working-memory/report'
import {spatialEnvelope} from '../precision-working-memory/scorer'
import {SEARCH_IDENTITY,searchPlan} from '../visual-search/protocol'
import {projectSearchReport,isSearchReport} from '../visual-search/report'
import {searchEnvelope} from '../visual-search/scorer'
import {blinkDefinition} from '../attentional-blink/package'
import {balloonEffortDefinition} from '../balloon-effort/package'
import {dualDefinition} from '../dual-arrow/package'
import {gradDefinition} from '../gradcpt/package'
import {hfDefinition} from '../hearts-flowers/package'
import {horizonDefinition} from '../horizon-exploration/package'
import {spatialMemoryDefinition} from '../precision-working-memory/package'
import {searchDefinition} from '../visual-search/package'
import type { TaskDefinition } from '../../v2/types'
import { motDefinition } from '../mot/package'
import { enumerationDefinition, enumerationRecipeDefinition } from '../enumeration/package'
import { recognitionDefinition,guidedRecognitionDefinition } from '../continuous-recognition/package'
import { antDefinition,antGuidedDefinition } from '../ant/package'

/** Explicit native implementations, not RegistryEntry adapters or publication/lifecycle authority. */
const nativeDefinitions:readonly NativeDefinitionRecord[]=[
  contentDefinition(blinkDefinition,BLINK_IDENTITY.configVersion,(c,s)=>({formal:blinkPlan(c,s),practice:[0,1,2].map(round=>blinkPlan(c,s,'practice',round))}),blinkEnvelope,projectBlinkReport,isBlinkReport),
  contentDefinition(balloonEffortDefinition,EFFORT_IDENTITY.configVersion,(c,s)=>({formal:effortPlan(c,s),practice:[0,1,2].map(round=>effortPlan(c,s,'practice',round)),quiz:EFFORT_QUIZ}),effortEnvelope,projectEffortReport,isEffortReport),
  contentDefinition(dualDefinition,DUAL_IDENTITY.configVersion,(c,s)=>({formal:dualPlan(c,s),practice:[0,1,2].map(round=>dualPlan(c,s,'practice',round))}),dualEnvelope,projectDualReport,isDualReport),
  contentDefinition(gradDefinition,GRAD_IDENTITY.configVersion,(c,s)=>({formal:gradPlan(c,s),practice:[0,1,2].map(round=>gradPracticePlans(c,s,round))}),gradEnvelope,projectGradReport,isGradReport),
  contentDefinition(hfDefinition,HF_IDENTITY.configVersion,(c,s)=>({formal:hfPlan(c,s),practice:[0,1,2].map(round=>hfPlan(c,s,'practice',round))}),hfEnvelope,projectHFReport,isHFReport,'all'),
  contentDefinition(horizonDefinition,HORIZON_IDENTITY.configVersion,(c,s)=>({formal:horizonPlan(c,s),practice:[0,1,2].map(round=>horizonPlan(c,s,'practice',round))}),horizonEnvelope,projectHorizonReport,isHorizonReport),
  contentDefinition(spatialMemoryDefinition,SPATIAL_IDENTITY.configVersion,(c,s)=>[...spatialPlan(c,s),...[0,1,2].flatMap(round=>spatialPlan(c,s,'practice',round))],spatialEnvelope,projectSpatialReport,isSpatialReport),
  contentDefinition(searchDefinition,SEARCH_IDENTITY.configVersion,(c,s)=>({formal:searchPlan(c,s),practice:[0,1,2].map(round=>searchPlan(c,s,'practice',round))}),searchEnvelope,projectSearchReport,isSearchReport),
  antGuidedNativeRecord,
  ...[motDefinition,enumerationDefinition,enumerationRecipeDefinition,recognitionDefinition,guidedRecognitionDefinition,antDefinition].map(definition=>({definition} as NativeDefinitionRecord)),
]

export const listNativeCognitiveTaskDefinitions=():TaskDefinition<unknown,unknown>[]=>nativeDefinitions.map(entry=>entry.definition)

/** Exact tuple only. Never substitute another version or select a latest definition. */
export const getNativeCognitiveTaskDefinition=(testType:string,engineVersion:string,scoringVersion:string):TaskDefinition<unknown,unknown>|undefined=>
  nativeDefinitions.find(({definition})=>definition.testType===testType&&definition.engineVersion===engineVersion
    &&definition.scoringVersion===scoringVersion)?.definition

/** Task-owned adapters attached to the same exact definition record, never a second registration authority. */
export const getNativeContentDefinition=(testType:string,engineVersion:string,scoringVersion:string)=>nativeDefinitions.find(({definition})=>definition.testType===testType&&definition.engineVersion===engineVersion&&definition.scoringVersion===scoringVersion)?.content
