import type { AuthoritativeScorerInput, CognitiveScoreResult } from '../../v2/types'
import { MOT_IDENTITY, motHitIds, motTrialPlan, motGeometry, type MotConfig, type MotTrial } from './protocol'
import { parseMotConfig, parseMotTrial } from './schema'

export function scoreMot(input: AuthoritativeScorerInput<MotConfig,MotTrial>): CognitiveScoreResult {
  if (input.session.testType !== MOT_IDENTITY.testType || input.session.engineVersion !== MOT_IDENTITY.engineVersion
    || input.session.scoringVersion !== MOT_IDENTITY.scoringVersion || input.session.configVersion !== MOT_IDENTITY.configVersion
    || input.session.protocol.key !== 'mot/1.1.0/1.1.0')
    throw new Error('Unsupported frozen MOT identity')
  const config = parseMotConfig(input.config)
  if (input.trials.length > config.totalTrials) throw new Error('MOT trial budget exceeded')
  const conditions = new Map([1,4,8].map(speed => [speed, { valid: 0, hits: 0, total: 0 }]))
  const excluded: number[] = []
  const exclusionReasons:Record<string,string[]>={}
  for (let index = 0; index < input.trials.length; index++) {
    const envelope = input.trials[index]
    const trial = parseMotTrial(envelope.payload)
    const plan = motTrialPlan(config,input.randomSeed,index)
    if (envelope.trialIndex !== index || trial.trialIndex !== index || envelope.phase !== 'test')
      throw new Error('MOT trials must be contiguous formal records')
    if (trial.speed !== plan.speed || trial.blockIndex !== plan.blockIndex
      || JSON.stringify(trial.targetIds) !== JSON.stringify(plan.targetIds)
      || trial.initialObjects.some((object,i)=>object.id!==plan.objects[i].id
        ||(['x','y','vx','vy'] as const).some(key=>Math.abs(object[key]-plan.objects[i][key])>1e-12)))
      throw new Error('MOT stimulus truth does not match the frozen seed and sequence')
    if (Math.abs(envelope.startedAtPerfMs-trial.startedAtPerfMs)>0.001
      ||Math.abs(envelope.endedAtPerfMs-trial.endedAtPerfMs)>0.001
      ||Math.abs(envelope.durationMs-trial.completionTimeMs)>0.001)
      throw new Error('MOT envelope does not preserve actual task clock')
    if (trial.endedAtPerfMs < trial.startedAtPerfMs
      || Math.abs(trial.completionTimeMs-(trial.endedAtPerfMs-trial.startedAtPerfMs)) > 0.001)
      throw new Error('MOT trial clock is inconsistent')
    for(let event=0;event<trial.interactionEvents.length;event++){
      const at=trial.interactionEvents[event].atPerfMs
      if(at<trial.startedAtPerfMs||at>trial.endedAtPerfMs
        ||(event>0&&at<trial.interactionEvents[event-1].atPerfMs))throw new Error('MOT interaction clock is inconsistent')
    }
    const selected: number[] = []
    let previous = trial.responseStartedAtPerfMs
    for (const response of trial.responses) {
      if (previous === null || response.atPerfMs < previous || response.atPerfMs > trial.endedAtPerfMs)
        throw new Error('MOT response clock is out of order')
      if (selected.includes(response.objectId)) throw new Error('MOT response repeats an object')
      const hits = motHitIds(plan,response,config,selected)
      if (!hits.includes(response.objectId) || (response.input !== 'keyboard' && hits.length !== 1))
        throw new Error('MOT response does not identify the rendered object')
      selected.push(response.objectId)
      previous = response.atPerfMs
    }
    const frame = trial.frameTiming
    if (!frame.strictlyIncreasing) throw new Error('MOT frame times must increase')
    const geometry = motGeometry(trial.calibration,trial.calibration.viewportWidthCssPx-28,
      trial.calibration.viewportHeightCssPx-242)
    if (!geometry.fits) throw new Error('MOT calibrated field does not fit the recorded viewport')
    const motionDuration = trial.motionStartedAtPerfMs === null || trial.motionEndedAtPerfMs === null
      ? null : trial.motionEndedAtPerfMs-trial.motionStartedAtPerfMs
    const stages = [trial.startedAtPerfMs,trial.cueStartedAtPerfMs,trial.motionStartedAtPerfMs,
      trial.motionEndedAtPerfMs,trial.responseStartedAtPerfMs,trial.endedAtPerfMs]
    const stageMissing = stages.some(t => t === null)
    const knownStages=stages.filter((t):t is number=>t!==null)
    const stageOrder=knownStages.slice(1).some((t,i)=>t<knownStages[i])
    if (stageOrder) throw new Error('MOT phase clock is out of order')
    const durationBad = stageMissing || motionDuration === null
      || Math.abs(motionDuration-config.motionMs) > config.durationToleranceMs
      || Math.abs(trial.cueStartedAtPerfMs!-trial.startedAtPerfMs-config.fixationMs) > config.durationToleranceMs
      || Math.abs(trial.motionStartedAtPerfMs!-trial.cueStartedAtPerfMs!-config.cueMs) > config.durationToleranceMs
      || Math.abs(trial.responseStartedAtPerfMs!-trial.motionEndedAtPerfMs!-config.postMotionMs) > config.durationToleranceMs
    const invalid = trial.recordOrigin!=='live' || trial.interactionOverflow || durationBad || frame.overflow || frame.frameCount < config.minimumMotionFrames
      || frame.firstMs === null || frame.firstMs > config.maxFrameGapMs
      || frame.lastMs === null || Math.abs(frame.lastMs-config.motionMs) > config.durationToleranceMs
      || frame.maxGapMs === null || frame.maxGapMs > config.maxFrameGapMs
      || trial.interruptions.length > 0 || envelope.qualityEvents.length > 0
      || envelope.flags.timeout || envelope.flags.premature || trial.prematureInputs > 0
      || trial.timedOut || trial.responses.length !== 5
    const condition = conditions.get(plan.speed)!
    condition.total++
    if (invalid) {
      excluded.push(index)
      exclusionReasons[index]=[
        ...(trial.recordOrigin!=='live'?['recovered_exposure_without_timing']:[]),
        ...(durationBad?['phase_duration_or_missing']:[]),
        ...(frame.overflow||trial.interactionOverflow?['telemetry_overflow']:[]),
        ...(frame.frameCount<config.minimumMotionFrames?['insufficient_frames']:[]),
        ...(frame.maxGapMs===null||frame.maxGapMs>config.maxFrameGapMs?['frame_gap']:[]),
        ...(frame.firstMs===null||frame.firstMs>config.maxFrameGapMs||frame.lastMs===null||Math.abs(frame.lastMs-config.motionMs)>config.durationToleranceMs?['frame_coverage']:[]),
        ...(trial.interruptions.length||envelope.qualityEvents.length?['interruption']:[]),
        ...(envelope.flags.premature||trial.prematureInputs?['premature_input']:[]),
        ...(trial.timedOut||envelope.flags.timeout?['timeout']:[]),
        ...(trial.responses.length!==5?['incomplete_selection']:[]),
      ]
      continue
    }
    condition.valid++
    condition.hits += selected.filter(id => plan.targetIds.includes(id)).length
  }
  const expectedPerSpeed = config.totalTrials/3
  const flags: Record<string,boolean> = { incompleteRecords: input.trials.length !== config.totalTrials }
  const metrics: Record<string,unknown> = { expectedTrialCount:config.totalTrials,
    receivedTrialCount:input.trials.length,validTrialCount:input.trials.length-excluded.length,
    excludedTrialCount:excluded.length,excludedTrialIndices:excluded,excludedTrialReasons:exclusionReasons }
  let eligible = 0, allHits = 0, allValid = 0
  for (const [speed,c] of conditions) {
    const unreliable = c.total !== expectedPerSpeed || c.valid !== expectedPerSpeed
    flags['unreliableSpeed'+speed] = unreliable
    metrics['meanTargetsSpeed'+speed] = c.valid ? c.hits/c.valid : null
    metrics['accuracySpeed'+speed] = c.valid ? c.hits/(c.valid*5) : null
    metrics['validTrialsSpeed'+speed] = c.valid
    metrics['totalTrialsSpeed'+speed] = expectedPerSpeed
    metrics['observedTrialsSpeed'+speed] = c.total
    if (!unreliable) eligible++
    allHits += c.hits; allValid += c.valid
  }
  metrics.meanTrackedTargets = allValid ? allHits/allValid : null
  metrics.trackingAccuracy = allValid ? allHits/(allValid*5) : null
  flags.noInterpretableCondition = eligible === 0
  const state = eligible === 0 ? 'invalid' : eligible < 3 ? 'limited' : 'interpretable'
  const reasons = state === 'interpretable' ? [] : [state === 'invalid'
    ? '各速度的完整有效记录尚不足，本次不提供表现结论。'
    : '部分速度记录不完整或受中断/画面质量影响，相关指标暂不展示。']
  return { metrics, quality:{state,flags,reasons},
    audit:{trialCount:input.trials.length,scorerVersion:MOT_IDENTITY.scoringVersion} }
}
