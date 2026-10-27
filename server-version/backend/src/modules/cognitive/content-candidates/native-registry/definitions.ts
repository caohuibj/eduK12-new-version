import type { TaskDefinition } from '../../v2/types'
import { motDefinition } from '../mot/package'
import { enumerationDefinition, enumerationRecipeDefinition } from '../enumeration/package'
import { recognitionDefinition } from '../continuous-recognition/package'
import { antDefinition,antGuidedDefinition } from '../ant/package'

/** Explicit native implementations, not RegistryEntry adapters or publication/lifecycle authority. */
const nativeDefinitions:readonly TaskDefinition<unknown,unknown>[]=[
  motDefinition,enumerationDefinition,enumerationRecipeDefinition,recognitionDefinition,antDefinition,antGuidedDefinition,
] as unknown as readonly TaskDefinition<unknown,unknown>[]

export const listNativeCognitiveTaskDefinitions=():TaskDefinition<unknown,unknown>[]=>[...nativeDefinitions]

/** Exact tuple only. Never substitute another version or select a latest definition. */
export const getNativeCognitiveTaskDefinition=(testType:string,engineVersion:string,scoringVersion:string):TaskDefinition<unknown,unknown>|undefined=>
  nativeDefinitions.find(definition=>definition.testType===testType&&definition.engineVersion===engineVersion
    &&definition.scoringVersion===scoringVersion)
