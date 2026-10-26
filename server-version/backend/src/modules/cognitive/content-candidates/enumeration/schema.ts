import { z } from 'zod'
import { ENUMERATION_IDENTITY, type EnumerationConfig, type EnumerationTrial } from './protocol'
const finiteTime = z.number().finite().nonnegative()
const integerResponse = z.number().int().min(1).max(15)
const input = z.enum(['touch', 'pointer', 'keyboard'])
export const enumerationConfigSchema = z.object({
  status: z.literal('DESIGN_PROPOSAL'), profile: z.enum(['research', 'experience']),
  sequenceKey: z.enum(['research100', 'experience25']), totalTrials: z.union([z.literal(100), z.literal(25)]),
  blocks: z.union([z.literal(4), z.literal(1)]), repetitionsPerQuantityPerBlock: z.literal(5),
  responseMin: z.literal(1), responseMax: z.literal(15), interpretationPolicy: z.literal('research_provisional'),
  minimumValidPerCondition: z.null(), timingToleranceMs: z.null(), stimulusRecipe: z.null(),
}).strict().superRefine((config, context) => {
  const research = config.profile === 'research'
  if (config.totalTrials !== (research ? 100 : 25) || config.blocks !== (research ? 4 : 1)
    || config.sequenceKey !== (research ? 'research100' : 'experience25'))
    context.addIssue({ code: 'custom', message: 'Profile and count tuple must match exactly' })
})
export const enumerationTrialSchema = z.object({
  phase: z.literal('test'),
  plan: z.object({ phase: z.literal('test'), trialIndex: z.number().int().min(0).max(99),
    blockIndex: z.number().int().min(0).max(3), positionInBlock: z.number().int().min(0).max(24),
    targetValue: z.number().int().min(5).max(9), sliderInitialValue: integerResponse,
    sequenceSeed: z.string().min(1).max(256),
    randomizationAlgorithmVersion: z.literal(ENUMERATION_IDENTITY.randomizationAlgorithmVersion),
  }).strict(),
  recordOrigin: z.enum(['live', 'recovered_without_timing']), startedAtPerfMs: finiteTime,
  stimulusOnsetPerfMs: finiteTime.nullable(), maskOnsetPerfMs: finiteTime.nullable(),
  responseStartedAtPerfMs: finiteTime.nullable(), confirmedAtPerfMs: finiteTime.nullable(), endedAtPerfMs: finiteTime,
  responseValue: integerResponse.nullable(), responseInput: input.nullable(),
  sliderChanges: z.array(z.object({ value: integerResponse, atPerfMs: finiteTime, input }).strict()).max(512),
  prematureInputs: z.number().int().nonnegative().max(10000), timedOut: z.boolean(),
  interruptions: z.array(z.enum(['visibility_lost', 'window_blur', 'viewport_changed', 'runner_restart'])).max(20),
  timingFacts: z.object({ source: z.literal('client_reported'),
    stimulusFrameCount: z.number().int().nonnegative().max(100000).nullable(),
    maskFrameCount: z.number().int().nonnegative().max(100000).nullable(),
    stimulusMaxFrameGapMs: finiteTime.nullable(), maskMaxFrameGapMs: finiteTime.nullable(),
    incomplete: z.boolean(), overflow: z.boolean(),
  }).strict(),
  calibrationReference: z.string().min(1).max(256).nullable(),
  renderedStimulusReference: z.string().min(1).max(256).nullable(),
}).strict().superRefine((trial, context) => {
  const stages = [trial.startedAtPerfMs, trial.stimulusOnsetPerfMs, trial.maskOnsetPerfMs,
    trial.responseStartedAtPerfMs, trial.confirmedAtPerfMs, trial.endedAtPerfMs].filter((v): v is number => v !== null)
  if (stages.some((value, index) => index > 0 && value < stages[index - 1]))
    context.addIssue({ code: 'custom', message: 'Phase clocks must be ordered' })
  const hasResponse = trial.responseValue !== null
  if (hasResponse !== (trial.confirmedAtPerfMs !== null) || hasResponse !== (trial.responseInput !== null)
    || (hasResponse && trial.responseStartedAtPerfMs === null))
    context.addIssue({ code: 'custom', message: 'Response value, input and confirmation must agree' })
  let last = trial.responseStartedAtPerfMs
  for (const change of trial.sliderChanges) {
    if (last === null || change.atPerfMs < last || change.atPerfMs > (trial.confirmedAtPerfMs ?? trial.endedAtPerfMs))
      context.addIssue({ code: 'custom', message: 'Slider changes must stay in response clock order' })
    last = change.atPerfMs
  }
  if (trial.responseValue !== null && trial.responseValue !== (trial.sliderChanges.at(-1)?.value ?? trial.plan.sliderInitialValue))
    context.addIssue({ code: 'custom', message: 'Confirmed answer must equal the current slider value' })
})
export const parseEnumerationConfig = (value: unknown): EnumerationConfig => enumerationConfigSchema.parse(value)
export const parseEnumerationTrial = (value: unknown): EnumerationTrial => enumerationTrialSchema.parse(value)
