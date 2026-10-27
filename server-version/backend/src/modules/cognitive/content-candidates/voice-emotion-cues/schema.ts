import { z } from 'zod'
import { EMOTIONS, assertConfig, type VoiceConfig, type Raw } from './protocol'
export const configSchema = z.custom<VoiceConfig>(v => { try { assertConfig(v); return true } catch { return false } })
const time = z.number().finite().nonnegative(), input = z.enum(['touch', 'mouse', 'pen', 'keyboard', 'assistive'])
const choice = z.enum([...EMOTIONS, 'none']), token = z.string().min(1).max(80)
const event = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('play'), at: time }).strict(), z.object({ kind: z.literal('ended'), at: time }).strict(),
  z.object({ kind: z.enum(['down', 'up', 'cancel']), at: time, token, choice, input }).strict(),
  z.object({ kind: z.literal('activate'), at: time, choice, input: z.literal('assistive') }).strict(),
  z.object({ kind: z.literal('skip'), at: time }).strict(),
  z.object({ kind: z.literal('interrupt'), at: time, reason: z.enum(['participant-ended', 'hidden', 'pagehide', 'disposed', 'media-error', 'media-paused', 'media-seek', 'media-rate', 'event-budget']) }).strict(),
])
export const rawSchema = z.object({
  plan: z.object({ index: z.number().int().min(0).max(95), phase: z.enum(['practice', 'test']), round: z.number().int().min(0).max(1), block: z.number().int().min(0).max(3), assetId: token, emotion: z.enum(EMOTIONS), intensity: z.enum(['normal', 'strong']), statement: z.union([z.literal(1), z.literal(2)]), actor: z.number().int().min(1).max(6), condition: z.string().min(1).max(60) }).strict(),
  startedAtPerfMs: time, endedAtPerfMs: time, events: z.array(event).min(1).max(65),
}).strict() as z.ZodType<Raw>
