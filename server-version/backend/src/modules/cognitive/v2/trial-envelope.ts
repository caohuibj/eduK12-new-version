import { z } from 'zod'
import {
  COGNITIVE_V2_TRIAL_ENVELOPE_VERSION,
  type CognitivePhase,
  type TrialEnvelope,
  type TrialQualityEvent,
} from './types'

const phaseSchema = z.enum(['test', 'learning', 'delayed'])
const qualityEventSchema = z.enum(['visibility_lost', 'window_blur', 'resume', 'runner_restart'])

export const trialEnvelopeSchema = z.object({
  schemaVersion: z.literal(COGNITIVE_V2_TRIAL_ENVELOPE_VERSION),
  trialIndex: z.number().int().min(0),
  phase: phaseSchema,
  condition: z.string().min(1).max(120).optional(),
  startedAtPerfMs: z.number().finite().min(0),
  endedAtPerfMs: z.number().finite().min(0),
  durationMs: z.number().finite().min(0),
  flags: z.object({
    timeout: z.boolean(),
    premature: z.boolean(),
  }).strict(),
  qualityEvents: z.array(qualityEventSchema).max(20),
  payload: z.unknown(),
}).strict().superRefine((value, context) => {
  if (value.endedAtPerfMs < value.startedAtPerfMs) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['endedAtPerfMs'], message: 'endedAtPerfMs must be >= startedAtPerfMs' })
  }
  const measuredDuration = value.endedAtPerfMs - value.startedAtPerfMs
  if (Math.abs(measuredDuration - value.durationMs) > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['durationMs'], message: 'durationMs must match the performance clock interval' })
  }
})

export type ParsedTrialEnvelope = z.infer<typeof trialEnvelopeSchema>

export const parseTrialEnvelope = <TPayload>(value: unknown): TrialEnvelope<TPayload> => {
  const parsed = trialEnvelopeSchema.parse(value)
  return parsed as TrialEnvelope<TPayload>
}

export const safeParseTrialEnvelope = <TPayload>(value: unknown) =>
  trialEnvelopeSchema.safeParse(value) as ReturnType<typeof trialEnvelopeSchema.safeParse> & {
    data?: TrialEnvelope<TPayload>
  }

export const createTrialEnvelope = <TPayload>(input: {
  trialIndex: number
  phase: CognitivePhase
  payload: TPayload
  startedAtPerfMs: number
  endedAtPerfMs: number
  condition?: string
  timeout?: boolean
  premature?: boolean
  qualityEvents?: TrialQualityEvent[]
}): TrialEnvelope<TPayload> => {
  const envelope: TrialEnvelope<TPayload> = {
    schemaVersion: COGNITIVE_V2_TRIAL_ENVELOPE_VERSION,
    trialIndex: input.trialIndex,
    phase: input.phase,
    ...(input.condition ? { condition: input.condition } : {}),
    startedAtPerfMs: input.startedAtPerfMs,
    endedAtPerfMs: input.endedAtPerfMs,
    durationMs: input.endedAtPerfMs - input.startedAtPerfMs,
    flags: {
      timeout: input.timeout ?? false,
      premature: input.premature ?? false,
    },
    qualityEvents: input.qualityEvents ?? [],
    payload: input.payload,
  }
  return parseTrialEnvelope<TPayload>(envelope)
}
