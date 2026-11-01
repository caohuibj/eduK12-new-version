import { CognitiveScoringInputError, type CognitiveScoreResult, type ScoringTrial } from '../cognitive.types'
import type { ReadingcompConfig } from '../schemas/readingcomp.config'
import type { ReadingcompTrial } from '../schemas/readingcomp.trial'
import { readingcompAuditedConfigSchema } from '../schemas/readingcomp.v1.1.config'
import { READINGCOMP_BANK } from '../tasks/readingcomp/bank'

export function scoreReadingcompV11(input: { config: ReadingcompConfig; trials: ScoringTrial<ReadingcompTrial>[] }): CognitiveScoreResult {
  const parsed = readingcompAuditedConfigSchema.safeParse(input.config)
  if (!parsed.success) throw new CognitiveScoringInputError('readingcomp v1.1 config must match the audited bank/report and finite capacity')
  const config = parsed.data
  const trials = [...input.trials].sort((a, b) => a.trialIndex - b.trialIndex)
  if (trials.length !== config.totalTrials || trials.some((trial, index) => trial.trialIndex !== index)) {
    throw new CognitiveScoringInputError(`readingcomp v1.1 expects exactly ${config.totalTrials} contiguous trials`)
  }
  const seen = new Set<string>()
  let correctCount = 0, answeredCount = 0, timeoutCount = 0
  const validRts: number[] = []
  for (const { payload } of trials) {
    const item = READINGCOMP_BANK.find(candidate => candidate.id === payload.itemId)
    if (!item || seen.has(payload.itemId)) throw new CognitiveScoringInputError('readingcomp v1.1 requires distinct formal-bank items')
    seen.add(payload.itemId)
    const timeout = payload.responseIndex === null
    if (timeout !== (payload.rtMs === null) || (!timeout && (!Number.isInteger(payload.responseIndex) || payload.responseIndex! < 0 || payload.responseIndex! > 3 || !Number.isFinite(payload.rtMs) || payload.rtMs! < 0 || payload.rtMs! > config.timeoutMs))) {
      throw new CognitiveScoringInputError('readingcomp v1.1 invalid response/time pair')
    }
    if (timeout) { timeoutCount++; continue }
    answeredCount++
    if (payload.responseIndex === item.answer) {
      correctCount++
      if (!payload.interrupted && payload.rtMs! >= config.validRtFloorMs) validRts.push(payload.rtMs!)
    }
  }
  validRts.sort((a, b) => a - b)
  const middle = Math.floor(validRts.length / 2)
  const medianRtMs = validRts.length === 0 ? null : validRts.length % 2 ? validRts[middle] : (validRts[middle - 1] + validRts[middle]) / 2
  const accuracy = correctCount / config.totalTrials
  return {
    score: Math.round(accuracy * 100), showProductIndex: false,
    metrics: { accuracy, correctCount, answeredCount, errorCount: answeredCount - correctCount, timeoutCount, medianRtMs, validRtCount: validRts.length },
    qualityFlags: { interpretable: answeredCount > 0, noResponses: answeredCount === 0, insufficientValidRt: validRts.length < 2, lowAccuracy: accuracy < 0.5, interrupted: trials.some(trial => trial.payload.interrupted) },
  }
}
