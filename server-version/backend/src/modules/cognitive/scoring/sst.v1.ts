import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { sstSequence } from '../randomization'
import { SstConfig } from '../schemas/sst.config'
import { SstTrial } from '../schemas/sst.trial'
import { median, mean } from './signal-detection'

const nextSsd = (current: number, success: boolean, config: SstConfig): number => {
  const stepped = success ? current + config.ssdStepMs : current - config.ssdStepMs
  return Math.min(config.ssdMaxMs, Math.max(config.ssdMinMs, stepped))
}

export const scoreSstV1 = (input: {
  config: SstConfig
  trials: ScoringTrial<SstTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  const { config, trials } = input
  if (!input.randomSeed) {
    throw new CognitiveScoringInputError('sst v1 requires session randomSeed')
  }
  const expected = sstSequence(input.randomSeed, config.totalTrials, config.stopRatio)
  const sorted = [...trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(`sst v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`)
  }
  let ssd = config.ssdStartMs
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(`sst v1 requires contiguous trialIndex 0..${config.totalTrials - 1}`)
    }
    const want = expected[index]
    if (trial.payload.trialType !== want.trialType || trial.payload.goStimulus !== want.goStimulus) {
      throw new CognitiveScoringInputError(`sst v1 trial ${index} does not match the frozen seed sequence`)
    }
    if (trial.payload.trialType === 'go') {
      if (trial.payload.ssdMs != null || trial.payload.stopSignalPresented) {
        throw new CognitiveScoringInputError(`sst v1 trial ${index} go trial must not present a stop signal`)
      }
      return
    }
    if (trial.payload.ssdMs !== ssd || !trial.payload.stopSignalPresented) {
      throw new CognitiveScoringInputError(`sst v1 trial ${index} SSD does not match the reconstructed staircase`)
    }
    ssd = nextSsd(ssd, trial.payload.response == null, config)
  })

  const go = sorted.filter((trial) => trial.payload.trialType === 'go')
  const stop = sorted.filter((trial) => trial.payload.trialType === 'stop')
  const expectedStop = Math.round(config.totalTrials * config.stopRatio)
  if (stop.length !== expectedStop) {
    throw new CognitiveScoringInputError(`sst v1 expects ${expectedStop} stop trials`)
  }
  const goCorrect = go.filter((trial) => trial.payload.response === trial.payload.goStimulus && (trial.payload.rtMs ?? 0) >= config.validRtFloorMs)
  const goOmissions = go.filter((trial) => trial.payload.response == null).length
  const goChoiceErrors = go.filter((trial) => trial.payload.response != null && trial.payload.response !== trial.payload.goStimulus).length
  const unsuccessful = stop.filter((trial) => trial.payload.response != null)
  const pRespondStop = stop.length ? unsuccessful.length / stop.length : 0
  const goMedianRtMs = median(goCorrect.map((trial) => trial.payload.rtMs as number))
  const unsuccessfulStopRtMs = median(
    unsuccessful
      .map((trial) => trial.payload.rtMs)
      .filter((rt): rt is number => rt != null && rt >= config.validRtFloorMs),
  )
  const meanSsdMs = stop.length ? Math.round(mean(stop.map((trial) => trial.payload.ssdMs as number))) : null
  const rankedGo = go
    .map((trial) => (trial.payload.rtMs != null && trial.payload.response === trial.payload.goStimulus ? trial.payload.rtMs : Number.POSITIVE_INFINITY))
    .sort((a, b) => a - b)
  const nthIndex = Math.max(0, Math.min(rankedGo.length - 1, Math.round(pRespondStop * rankedGo.length) - 1))
  const nthRt = rankedGo.length ? rankedGo[nthIndex] : Number.POSITIVE_INFINITY
  const ssrtMs = Number.isFinite(nthRt) && meanSsdMs != null ? Math.round(nthRt - meanSsdMs) : null

  const goOmissionRate = go.length ? goOmissions / go.length : 0
  const goChoiceErrorRate = go.length ? goChoiceErrors / go.length : 0
  const insufficientStopTrials = stop.length < Math.max(6, Math.round(expectedStop * 0.5))
  const pRespondStopOutOfRange = pRespondStop < 0.25 || pRespondStop > 0.75
  const highGoOmission = goOmissionRate >= 0.2
  const strategicSlowingSuspected =
    goMedianRtMs != null && unsuccessfulStopRtMs != null && unsuccessfulStopRtMs >= goMedianRtMs
  const interrupted = sorted.some((trial) => trial.payload.interrupted)
  const interpretable = !insufficientStopTrials && !pRespondStopOutOfRange && !highGoOmission && ssrtMs != null && ssrtMs > 0

  const boundedSsrt = ssrtMs == null ? 0 : Math.max(0, Math.min(400, ssrtMs))
  return {
    score: Math.max(0, Math.min(100, Math.round((1 - boundedSsrt / 400) * 70 + (1 - Math.abs(pRespondStop - 0.5)) * 30))),
    metrics: {
      ssrtMs,
      pRespondStop,
      goMedianRtMs,
      goOmissionRate,
      goChoiceErrorRate,
      meanSsdMs,
      unsuccessfulStopRtMs,
    },
    qualityFlags: {
      interpretable,
      insufficientStopTrials,
      pRespondStopOutOfRange,
      highGoOmission,
      strategicSlowingSuspected,
      interrupted,
    },
  }
}
