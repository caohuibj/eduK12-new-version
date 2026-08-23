export const RANDOMIZATION_ALGORITHM_VERSION = 'seq-v1.0.0'

function xmur3(value: string): () => number {
  let hash = 1779033703 ^ value.length
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353)
    hash = (hash << 13) | (hash >>> 19)
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507)
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909)
    hash ^= hash >>> 16
    return hash >>> 0
  }
}

function mulberry32(seed: number): () => number {
  let value = seed | 0
  return () => {
    value = (value + 0x6d2b79f5) | 0
    let t = Math.imul(value ^ (value >>> 15), 1 | value)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const seededRandom = (seed: string, lane: string): (() => number) =>
  mulberry32(xmur3(`${seed}:${lane}`)())

export const shuffleInPlace = <T,>(items: T[], random: () => number): T[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const tmp = items[i]
    items[i] = items[j]
    items[j] = tmp
  }
  return items
}

export const gonogoSequence = (seed: string, totalTrials: number, nogoRatio: number): Array<'go' | 'nogo'> => {
  const nogo = Math.round(totalTrials * nogoRatio)
  const sequence: Array<'go' | 'nogo'> = Array.from({ length: totalTrials }, (_, index) => (index < nogo ? 'nogo' : 'go'))
  return shuffleInPlace(sequence, seededRandom(seed, 'gonogo'))
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'H', 'K', 'N', 'P', 'S', 'U', 'X']

export const cptSequence = (seed: string, totalTrials: number, targetRatio: number, blockCount: number) => {
  const targetCount = Math.max(1, Math.round(totalTrials * targetRatio))
  const flags = Array.from({ length: totalTrials }, (_, index) => index < targetCount)
  shuffleInPlace(flags, seededRandom(seed, 'cpt-targets'))
  const letterRng = seededRandom(seed, 'cpt-letters')
  const perBlock = totalTrials / blockCount
  return flags.map((isTarget, index) => ({
    blockIndex: Math.floor(index / perBlock),
    isTarget,
    stimulus: isTarget ? 'X' : LETTERS[Math.floor(letterRng() * (LETTERS.length - 1))],
  }))
}

const NBACK_LETTERS = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'M', 'P', 'Q', 'R', 'S', 'T', 'V', 'X']

export type NbackTrialSpec = {
  nLevel: 1 | 2 | 3
  blockIndex: number
  stimulus: string
  target: boolean
}

export const nbackSequence = (
  seed: string,
  nLevels: Array<1 | 2 | 3>,
  trialCountByN: number[],
  blockCountByN: number[],
  targetRatio: number,
): NbackTrialSpec[] => {
  const trials: NbackTrialSpec[] = []
  let globalBlockIndex = 0
  nLevels.forEach((nLevel, levelIndex) => {
    const trialCount = trialCountByN[levelIndex]
    const blockCount = blockCountByN[levelIndex]
    const perBlock = trialCount / blockCount
    for (let blockWithinLevel = 0; blockWithinLevel < blockCount; blockWithinLevel += 1) {
      const eligible = Math.max(0, perBlock - nLevel)
      const targetCount = Math.min(eligible, Math.max(1, Math.round(eligible * targetRatio)))
      const eligibleFlags = Array.from({ length: eligible }, (_, index) => index < targetCount)
      shuffleInPlace(eligibleFlags, seededRandom(seed, `nback-targets:${nLevel}:${blockWithinLevel}`))
      const isTarget = [...Array.from({ length: nLevel }, () => false), ...eligibleFlags]
      const letterRng = seededRandom(seed, `nback-letters:${nLevel}:${blockWithinLevel}`)
      const stimuli: string[] = []
      for (let index = 0; index < perBlock; index += 1) {
        if (isTarget[index]) {
          stimuli.push(stimuli[index - nLevel])
          continue
        }
        let letter = NBACK_LETTERS[Math.floor(letterRng() * NBACK_LETTERS.length)]
        if (index >= nLevel) {
          let guard = 0
          while (letter === stimuli[index - nLevel] && guard < 16) {
            letter = NBACK_LETTERS[Math.floor(letterRng() * NBACK_LETTERS.length)]
            guard += 1
          }
        }
        stimuli.push(letter)
      }
      stimuli.forEach((stimulus, index) => {
        trials.push({
          nLevel,
          blockIndex: globalBlockIndex,
          stimulus,
          target: Boolean(isTarget[index]),
        })
      })
      globalBlockIndex += 1
    }
  })
  return trials
}

export const corsiSequence = (seed: string, trialIndex: number, spanLength: number, boardSize = 9): number[] => {
  const blocks = Array.from({ length: boardSize }, (_, index) => index)
  shuffleInPlace(blocks, seededRandom(seed, `corsi:${trialIndex}:${spanLength}`))
  return blocks.slice(0, spanLength)
}

export type SstTrialSpec = {
  trialType: 'go' | 'stop'
  goStimulus: 'left' | 'right'
}

export const sstSequence = (seed: string, totalTrials: number, stopRatio: number): SstTrialSpec[] => {
  const stopCount = Math.round(totalTrials * stopRatio)
  const types: Array<'go' | 'stop'> = Array.from({ length: totalTrials }, (_, index) => (index < stopCount ? 'stop' : 'go'))
  shuffleInPlace(types, seededRandom(seed, 'sst-types'))
  const sideRng = seededRandom(seed, 'sst-sides')
  return types.map((trialType) => ({
    trialType,
    goStimulus: sideRng() < 0.5 ? 'left' : 'right',
  }))
}

const TASKSWITCH_STIMULI = [1, 2, 3, 4, 6, 7, 8, 9]
type TaskRule = 'parity' | 'magnitude'

export type TaskswitchTrialSpec = {
  blockIndex: number
  taskRule: TaskRule
  previousTaskRule: TaskRule | null
  switchType: 'start' | 'switch' | 'repeat'
  stimulus: number
  correctResponse: 'left' | 'right'
}

export const taskswitchCorrectResponse = (taskRule: TaskRule, stimulus: number): 'left' | 'right' => {
  if (taskRule === 'parity') return stimulus % 2 === 1 ? 'left' : 'right'
  return stimulus < 5 ? 'left' : 'right'
}

export const taskswitchSequence = (
  seed: string,
  totalTrials: number,
  blockCount: number,
  switchRatio: number,
  includePureBlocks: boolean,
): TaskswitchTrialSpec[] => {
  const perBlock = totalTrials / blockCount
  const switchRng = seededRandom(seed, 'taskswitch-switch')
  const startRng = seededRandom(seed, 'taskswitch-start')
  const stimRng = seededRandom(seed, 'taskswitch-stim')
  const trials: TaskswitchTrialSpec[] = []
  for (let block = 0; block < blockCount; block += 1) {
    for (let offset = 0; offset < perBlock; offset += 1) {
      const previous = offset === 0 ? null : trials[trials.length - 1].taskRule
      let taskRule: TaskRule
      let switchType: 'start' | 'switch' | 'repeat'
      if (offset === 0) {
        taskRule = includePureBlocks && block === 1 ? 'magnitude' : includePureBlocks && block === 0 ? 'parity' : (startRng() < 0.5 ? 'parity' : 'magnitude')
        switchType = 'start'
      } else if (includePureBlocks && block < 2) {
        taskRule = previous as TaskRule
        switchType = 'repeat'
      } else {
        const shouldSwitch = switchRng() < switchRatio
        taskRule = shouldSwitch ? (previous === 'parity' ? 'magnitude' : 'parity') : previous as TaskRule
        switchType = shouldSwitch ? 'switch' : 'repeat'
      }
      const stimulus = TASKSWITCH_STIMULI[Math.floor(stimRng() * TASKSWITCH_STIMULI.length)]
      trials.push({
        blockIndex: block,
        taskRule,
        previousTaskRule: previous,
        switchType,
        stimulus,
        correctResponse: taskswitchCorrectResponse(taskRule, stimulus),
      })
    }
  }
  return trials
}

export type PatternStimulus = {
  shape: 'circle' | 'square' | 'triangle'
  fill: 'solid' | 'outline'
  marks: 1 | 2 | 3
  rotation: 0 | 90 | 180 | 270
}

export type PatterncompareTrialSpec = {
  leftPattern: PatternStimulus
  rightPattern: PatternStimulus
  correctResponse: 'same' | 'different'
}

const PATTERN_SHAPES: PatternStimulus['shape'][] = ['circle', 'square', 'triangle']
const PATTERN_FILLS: PatternStimulus['fill'][] = ['solid', 'outline']
const PATTERN_ROTATIONS: PatternStimulus['rotation'][] = [0, 90, 180, 270]

const randomPattern = (random: () => number): PatternStimulus => ({
  shape: PATTERN_SHAPES[Math.floor(random() * PATTERN_SHAPES.length)],
  fill: PATTERN_FILLS[Math.floor(random() * PATTERN_FILLS.length)],
  marks: (Math.floor(random() * 3) + 1) as PatternStimulus['marks'],
  rotation: PATTERN_ROTATIONS[Math.floor(random() * PATTERN_ROTATIONS.length)],
})

export const patterncompareTrial = (seed: string, trialIndex: number): PatterncompareTrialSpec => {
  const labelRandom = seededRandom(seed, `patterncompare-label:${Math.floor(trialIndex / 2)}`)
  const random = seededRandom(seed, `patterncompare-stimulus:${trialIndex}`)
  const firstInPairIsSame = labelRandom() < 0.5
  const same = trialIndex % 2 === 0 ? firstInPairIsSame : !firstInPairIsSame
  const leftPattern = randomPattern(random)
  const rightPattern = { ...leftPattern }
  if (!same) {
    const dimension = Math.floor(random() * 4)
    if (dimension === 0) {
      rightPattern.shape = PATTERN_SHAPES[(PATTERN_SHAPES.indexOf(leftPattern.shape) + 1 + Math.floor(random() * 2)) % 3]
    } else if (dimension === 1) {
      rightPattern.fill = leftPattern.fill === 'solid' ? 'outline' : 'solid'
    } else if (dimension === 2) {
      rightPattern.marks = ((leftPattern.marks % 3) + 1) as PatternStimulus['marks']
    } else {
      rightPattern.rotation = PATTERN_ROTATIONS[(PATTERN_ROTATIONS.indexOf(leftPattern.rotation) + 1 + Math.floor(random() * 3)) % 4]
    }
  }
  return { leftPattern, rightPattern, correctResponse: same ? 'same' : 'different' }
}

export type FlankerTrialSpec = {
  targetDirection: 'left' | 'right'
  flankerDirection: 'left' | 'right'
  correctResponse: 'left' | 'right'
}

export const flankerSequence = (seed: string, totalTrials: number): FlankerTrialSpec[] => {
  const trials: FlankerTrialSpec[] = []
  for (let block = 0; block < totalTrials / 4; block += 1) {
    const blockTrials: FlankerTrialSpec[] = [
      { targetDirection: 'left', flankerDirection: 'left', correctResponse: 'left' },
      { targetDirection: 'right', flankerDirection: 'right', correctResponse: 'right' },
      { targetDirection: 'left', flankerDirection: 'right', correctResponse: 'left' },
      { targetDirection: 'right', flankerDirection: 'left', correctResponse: 'right' },
    ]
    trials.push(...shuffleInPlace(blockTrials, seededRandom(seed, `flanker:${block}`)))
  }
  return trials
}

type CardsortRule = 'color' | 'shape'
type CardsortColor = 'red' | 'blue'
type CardsortShape = 'circle' | 'star'

export type CardsortTrialSpec = {
  blockIndex: number
  ruleCue: CardsortRule
  previousRule: CardsortRule | null
  switchType: 'start' | 'switch' | 'repeat'
  stimulusColor: CardsortColor
  stimulusShape: CardsortShape
  correctResponse: 'left' | 'right'
  previousRuleResponse: 'left' | 'right' | null
}

export const cardsortCorrectResponse = (
  rule: CardsortRule,
  color: CardsortColor,
  shape: CardsortShape,
): 'left' | 'right' => {
  if (rule === 'color') return color === 'red' ? 'left' : 'right'
  return shape === 'circle' ? 'left' : 'right'
}

const CARDSORT_STIMULI: Array<{ color: CardsortColor; shape: CardsortShape }> = [
  { color: 'red', shape: 'circle' },
  { color: 'red', shape: 'star' },
  { color: 'blue', shape: 'circle' },
  { color: 'blue', shape: 'star' },
]

export const cardsortSequence = (
  seed: string,
  totalTrials: number,
  blockCount: number,
  switchRatio: number,
): CardsortTrialSpec[] => {
  const perBlock = totalTrials / blockCount
  const trials: CardsortTrialSpec[] = []
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const switchCount = Math.max(1, Math.round((perBlock - 1) * switchRatio))
    const switches = Array.from({ length: perBlock - 1 }, (_, index) => index < switchCount)
    shuffleInPlace(switches, seededRandom(seed, `cardsort-switches:${blockIndex}`))
    const startRandom = seededRandom(seed, `cardsort-start:${blockIndex}`)
    const stimulusRandom = seededRandom(seed, `cardsort-stimuli:${blockIndex}`)
    let previousRule: CardsortRule | null = null
    for (let offset = 0; offset < perBlock; offset += 1) {
      const shouldSwitch = offset > 0 && switches[offset - 1]
      const ruleCue: CardsortRule = offset === 0
        ? (startRandom() < 0.5 ? 'color' : 'shape')
        : shouldSwitch
          ? (previousRule === 'color' ? 'shape' : 'color')
          : previousRule as CardsortRule
      const switchType = offset === 0 ? 'start' : shouldSwitch ? 'switch' : 'repeat'
      const candidates = shouldSwitch ? CARDSORT_STIMULI.slice(1, 3) : CARDSORT_STIMULI
      const stimulus = candidates[Math.floor(stimulusRandom() * candidates.length)]
      trials.push({
        blockIndex,
        ruleCue,
        previousRule,
        switchType,
        stimulusColor: stimulus.color,
        stimulusShape: stimulus.shape,
        correctResponse: cardsortCorrectResponse(ruleCue, stimulus.color, stimulus.shape),
        previousRuleResponse: previousRule
          ? cardsortCorrectResponse(previousRule, stimulus.color, stimulus.shape)
          : null,
      })
      previousRule = ruleCue
    }
  }
  return trials
}
