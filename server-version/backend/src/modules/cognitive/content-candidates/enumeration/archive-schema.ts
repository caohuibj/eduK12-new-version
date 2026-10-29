import {z} from 'zod'
import {ENUMERATION_RECIPE_IDENTITY} from './protocol'
import {enumerationRecipeConfigSchema,enumerationStimulusRecipeSchema,enumerationTrialSchema} from './schema'
const text=z.string().min(1).max(256),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.number().finite().nonnegative()
const input=z.enum(['touch','pointer','keyboard'])
const practiceCore=z.object({...enumerationTrialSchema.shape,phase:z.literal('practice'),plan:enumerationTrialSchema.shape.plan.extend({
 phase:z.literal('practice'),trialIndex:z.number().int().min(0).max(2),blockIndex:z.literal(0),
 positionInBlock:z.number().int().min(0).max(2),targetValue:z.number().int().min(3).max(5),
})}).strict()
const calibration=z.object({id:text,source:z.literal('self_reported_ruler_and_distance'),referenceMm:z.number().finite().positive(),
 referenceCssPx:z.number().finite().positive(),viewingDistanceMm:z.number().finite().positive(),viewportWidthCssPx:z.number().finite().positive(),
 viewportHeightCssPx:z.number().finite().positive(),devicePixelRatio:z.number().finite().positive(),visualViewportScale:z.number().finite().positive()}).strict()
const artifact=z.object({schemaVersion:z.literal(1),hashScheme:z.literal('candidate-json-stringify-sha256-v1'),artifactHash:hash,
 pageOrigin:z.object({timeOrigin:time,pageInstanceId:text,source:z.literal('performance.timeOrigin-and-crypto.randomUUID')}).strict(),
 context:z.object({contextId:text,attemptId:text,usage:z.literal('AUTHENTICATED_CONTENT_CANDIDATE'),config:enumerationRecipeConfigSchema,
 randomSeed:text,language:z.enum(['zh','en']),calibration:calibration.nullable(),recipe:enumerationStimulusRecipeSchema}).strict(),
 maskBits:z.array(z.union([z.literal(0),z.literal(1)])).length(2304),
}).strict()
const recordFields={schemaVersion:z.literal(1),candidateId:z.literal(ENUMERATION_RECIPE_IDENTITY.candidateId),contextId:text,attemptId:text,
 exposureId:text,exposureOrdinal:z.number().int().min(0).max(11),artifactHash:hash,
 stimulus:z.object({algorithm:z.literal('enumeration-circular-rejection-binary-grid-v1'),seed:z.string().min(1).max(1024),
  dots:z.array(z.object({x:z.number().finite(),y:z.number().finite()}).strict()).max(9),dotDiameter:z.number().finite().positive()}).strict(),
 raw:z.object({clock:z.literal('performance'),onsetMeaning:z.literal('client_reported_raf_draw_command_not_physical_onset'),
  frames:z.array(z.object({stage:z.enum(['fixation','stimulus','mask','response']),atPerfMs:time}).strict()).max(20000),
  prematureEvents:z.array(z.object({atPerfMs:time,input}).strict()).max(256),interactionOverflow:z.boolean(),exposurePainted:z.boolean(),
  completion:z.enum(['confirmed','interrupted','telemetry_overflow'])}).strict(),
}
const formalRecord=z.object({...recordFields,exposureOrdinal:z.literal(0),core:enumerationTrialSchema}).strict()
const practiceRecord=z.object({...recordFields,core:practiceCore}).strict()
/** Validation only. Callers must retain the original objects, not the reordered Zod output. */
export const cognitiveEnumerationArchiveDetailSchema=z.object({schemaVersion:z.literal(1),artifact,
 formal:z.array(z.object({record:formalRecord,recordHash:hash}).strict()).min(1).max(100),
 practice:z.array(z.object({record:practiceRecord,recordHash:hash}).strict()).max(36),
}).strict()
export type CognitiveEnumerationArchiveDetail=z.infer<typeof cognitiveEnumerationArchiveDetailSchema>
