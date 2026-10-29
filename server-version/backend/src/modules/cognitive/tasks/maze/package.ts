import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { mazeConfigSchema } from '../../schemas/maze.config'
import { mazeTrialSchema } from '../../schemas/maze.trial'
import { scoreMazeV1 } from '../../scoring/maze.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { mazeRegistryMeta } from './definitions'

const mazeFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'maze',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: mazeConfigSchema,
    trialSchema: mazeTrialSchema,
    finalSubmission: mazeFinalSubmission,
    score: scoreMazeV1,
    ...mazeRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
