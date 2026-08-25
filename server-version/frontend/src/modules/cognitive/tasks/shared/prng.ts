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

export const digitBackwardSequence = (seed: string, trialIndex: number, spanLength: number): number[] => {
  const digits = Array.from({ length: 10 }, (_, index) => index)
  shuffleInPlace(digits, seededRandom(seed, `digitbackward:${trialIndex}:${spanLength}`))
  const sequence = digits.slice(0, spanLength)
  const ascending = sequence.every((value, index) => index === 0 || value === sequence[index - 1] + 1)
  const descending = sequence.every((value, index) => index === 0 || value === sequence[index - 1] - 1)
  if ((ascending || descending) && sequence.length > 2) {
    const last = sequence.pop() as number
    sequence.splice(1, 0, last)
  }
  return sequence
}

const PICTURE_STORY_BANKS = [
  Array.from({ length: 15 }, (_, index) => `scene-${String(index + 1).padStart(2, '0')}`),
  Array.from({ length: 15 }, (_, index) => `scene-${String(index + 16).padStart(2, '0')}`),
  Array.from({ length: 15 }, (_, index) => `scene-${String(index + 31).padStart(2, '0')}`),
]

export const pictureSequenceItems = (seed: string, itemCount: number): string[] => {
  const random = seededRandom(seed, 'picturesequence-story')
  const bank = PICTURE_STORY_BANKS[Math.floor(random() * PICTURE_STORY_BANKS.length)]
  return bank.slice(0, itemCount)
}

export type PairedAssociateSpec = { itemId: string; targetPosition: number }

export const pairedAssociateSet = (seed: string, pairCount: number): PairedAssociateSpec[] => {
  const ids = Array.from({ length: pairCount }, (_, index) => `pair-${String(index + 1).padStart(2, '0')}`)
  const positions = shuffleInPlace(
    Array.from({ length: pairCount }, (_, index) => index),
    seededRandom(seed, 'pairedassociate-positions'),
  )
  return ids.map((itemId, index) => ({ itemId, targetPosition: positions[index] }))
}

export type MatrixRuleFamily = 'progression' | 'alternation' | 'combination'
export type MatrixItemSpec = { itemId: string; ruleFamily: MatrixRuleFamily; difficulty: 1 | 2 | 3; panels: number[]; options: number[]; correctOption: number; stimulusSetVersion: 'matrix-generator-v1.0.0' }
const wrapSymbol = (value: number) => ((value - 1) % 8 + 8) % 8 + 1
const matrixApplicableRules = (rows: number[][]): MatrixRuleFamily[] => {
  const progressionStep = wrapSymbol(rows[0][1] - rows[0][0])
  const progression = rows.every((row) => wrapSymbol(row[1] - row[0]) === progressionStep && row[2] === wrapSymbol(row[1] + progressionStep))
  const alternation = rows.every((row) => row[0] === row[2])
  const combination = rows.every((row) => row[2] === wrapSymbol(row[0] + row[1]))
  return [progression && 'progression', alternation && 'alternation', combination && 'combination'].filter(Boolean) as MatrixRuleFamily[]
}
const buildMatrixPanels = (ruleFamily: MatrixRuleFamily, difficulty: 1 | 2 | 3, itemIndex: number): { panels: number[]; correct: number } => {
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const starts = [wrapSymbol(itemIndex + attempt + 1), wrapSymbol(itemIndex * 2 + attempt * 2 + 3), wrapSymbol(itemIndex * 3 + attempt * 3 + 5)]
    if (new Set(starts).size < 3) continue
    const seconds = starts.map((start, row) => ruleFamily === 'progression' ? wrapSymbol(start + difficulty) : wrapSymbol(start + difficulty + row + 1 + attempt))
    const thirds = starts.slice(0, 2).map((start, row) => ruleFamily === 'progression' ? wrapSymbol(seconds[row] + difficulty) : ruleFamily === 'alternation' ? start : wrapSymbol(start + seconds[row]))
    const exampleRows = [[starts[0], seconds[0], thirds[0]], [starts[1], seconds[1], thirds[1]]]
    if (matrixApplicableRules(exampleRows).length === 1 && matrixApplicableRules(exampleRows)[0] === ruleFamily) {
      const correct = ruleFamily === 'progression' ? wrapSymbol(seconds[2] + difficulty) : ruleFamily === 'alternation' ? starts[2] : wrapSymbol(starts[2] + seconds[2])
      return { panels: [...exampleRows.flat(), starts[2], seconds[2]], correct }
    }
  }
  throw new Error(`Unable to generate unique matrix item ${itemIndex}`)
}
const MATRIX_BANK: MatrixItemSpec[] = Array.from({ length: 24 }, (_, index) => {
  const difficulty = (Math.floor(index / 8) + 1) as 1 | 2 | 3
  const ruleFamily = ['progression', 'alternation', 'combination'][index % 3] as MatrixRuleFamily
  const { panels, correct } = buildMatrixPanels(ruleFamily, difficulty, index)
  const optionValues = [correct]
  for (let offset = 1; optionValues.length < 4; offset += 1) { const candidate = wrapSymbol(correct + offset + (offset % 2 === 0 ? difficulty : 0)); if (!optionValues.includes(candidate)) optionValues.push(candidate) }
  const itemId = `matrix-${String(index + 1).padStart(2, '0')}`
  const correctOption = index % 4
  const options = optionValues.slice(1); options.splice(correctOption, 0, correct)
  return { itemId, ruleFamily, difficulty, panels, options, correctOption, stimulusSetVersion: 'matrix-generator-v1.0.0' }
})
export const matrixSequence = (seed: string, itemCount: number): MatrixItemSpec[] => {
  const groups = ([1, 2, 3] as const).flatMap((difficulty) => (['progression', 'alternation', 'combination'] as const).map((ruleFamily) => shuffleInPlace([...MATRIX_BANK.filter((item) => item.difficulty === difficulty && item.ruleFamily === ruleFamily)], seededRandom(seed, `matrix:${difficulty}:${ruleFamily}`))))
  let selected: MatrixItemSpec[]
  if (itemCount === 6) selected = [groups[0][0], groups[1][0], groups[3][0], groups[5][0], groups[7][0], groups[8][0]]
  else if (itemCount === 16) selected = [...groups.map((group) => group[0]), ...groups.slice(0, 7).map((group) => group[1])]
  else selected = groups.flat()
  const ordered = selected.sort((left, right) => left.difficulty - right.difficulty)
  const correctPositions = shuffleInPlace(ordered.map((_, index) => index % 4), seededRandom(seed, 'matrix-options'))
  return ordered.map((item, index) => {
    const correctValue = item.options[item.correctOption]
    const options = item.options.filter((_, optionIndex) => optionIndex !== item.correctOption)
    const correctOption = correctPositions[index]
    options.splice(correctOption, 0, correctValue)
    return { ...item, options, correctOption }
  })
}

export type RotationItemSpec = { itemId: string; objectFamily: 'elbow' | 'fork' | 'step' | 'zigzag'; angle: 0 | 45 | 90 | 135 | 180; mirrored: boolean; variant: 0 | 1; difficulty: 1 | 2 | 3; correctResponse: 'same' | 'mirror'; stimulusSetVersion: 'rotation-objects-v1.0.0' }
const ROTATION_ANGLES: RotationItemSpec['angle'][] = [0, 45, 90, 135, 180]
const ROTATION_FAMILIES: RotationItemSpec['objectFamily'][] = ['elbow', 'fork', 'step', 'zigzag']
const ROTATION_BANK: RotationItemSpec[] = []
for (const angle of ROTATION_ANGLES) for (const mirrored of [false, true]) for (const objectFamily of ROTATION_FAMILIES) for (let variant = 0; variant < 2; variant += 1) {
  const index = ROTATION_BANK.length + 1
  ROTATION_BANK.push({ itemId: `rotation-${String(index).padStart(3, '0')}`, objectFamily, angle, mirrored, variant: variant as 0 | 1, difficulty: angle <= 45 ? 1 : angle === 90 ? 2 : 3, correctResponse: mirrored ? 'mirror' : 'same', stimulusSetVersion: 'rotation-objects-v1.0.0' })
}
export const mentalRotationSequence = (seed: string, totalTrials: number): RotationItemSpec[] => {
  const categories = ROTATION_ANGLES.flatMap((angle) => [false, true].map((mirrored) => ({ angle, mirrored })))
  const perCategory = Math.floor(totalTrials / categories.length)
  let remainder = totalTrials % categories.length
  const selected = categories.flatMap(({ angle, mirrored }, categoryIndex) => {
    const take = perCategory + (remainder-- > 0 ? 1 : 0)
    return shuffleInPlace([...ROTATION_BANK.filter((item) => item.angle === angle && item.mirrored === mirrored)], seededRandom(seed, `rotation-category:${categoryIndex}`)).slice(0, take)
  })
  return shuffleInPlace(selected, seededRandom(seed, 'rotation-order'))
}

export type TowerState = [number, number, number]
export type TowerMove = { disk: number; from: number; to: number; atMs: number }
export type TowerProblemSpec = { problemId: string; initialState: TowerState; targetState: TowerState; minimumMoves: number; difficulty: 1 | 2 | 3; stimulusSetVersion: 'three-peg-tower-v1.0.0' }
const stateKey = (state: TowerState) => state.join('')
const statesEqual = (left: TowerState, right: TowerState) => left.every((value, index) => value === right[index])
const legalTowerMoves = (state: TowerState): Array<{ disk: number; from: number; to: number }> => {
  const moves: Array<{ disk: number; from: number; to: number }> = []
  for (let from = 0; from < 3; from += 1) { const disk = state.findIndex((peg) => peg === from); if (disk < 0) continue; for (let to = 0; to < 3; to += 1) { if (to === from) continue; const destinationTop = state.findIndex((peg) => peg === to); if (destinationTop < 0 || destinationTop > disk) moves.push({ disk, from, to }) } }
  return moves
}
export const applyTowerMove = (state: TowerState, move: Pick<TowerMove, 'disk' | 'from' | 'to'>): { state: TowerState; valid: boolean } => {
  const legal = legalTowerMoves(state).some((candidate) => candidate.disk === move.disk && candidate.from === move.from && candidate.to === move.to)
  if (!legal) return { state: [...state] as TowerState, valid: false }
  const next = [...state] as TowerState; next[move.disk] = move.to; return { state: next, valid: true }
}
const towerDistance = (initial: TowerState, target: TowerState): number => {
  const queue: Array<{ state: TowerState; distance: number }> = [{ state: initial, distance: 0 }]; const visited = new Set([stateKey(initial)])
  while (queue.length) { const current = queue.shift()!; if (statesEqual(current.state, target)) return current.distance; for (const move of legalTowerMoves(current.state)) { const next = applyTowerMove(current.state, move).state; const key = stateKey(next); if (!visited.has(key)) { visited.add(key); queue.push({ state: next, distance: current.distance + 1 }) } } }
  throw new Error('tower state graph is disconnected')
}
const TOWER_BANK: TowerProblemSpec[] = (() => {
  const states = Array.from({ length: 27 }, (_, value) => [value % 3, Math.floor(value / 3) % 3, Math.floor(value / 9) % 3] as TowerState)
  const candidates = states.flatMap((initialState, initialIndex) => states.slice(initialIndex + 1).map((targetState) => ({ initialState, targetState, distance: towerDistance(initialState, targetState) })))
  const bands = [candidates.filter((item) => item.distance >= 2 && item.distance <= 3), candidates.filter((item) => item.distance >= 4 && item.distance <= 5), candidates.filter((item) => item.distance >= 6)]
  return bands.flatMap((band, bandIndex) => band.sort((a, b) => a.distance - b.distance || stateKey(a.initialState).localeCompare(stateKey(b.initialState)) || stateKey(a.targetState).localeCompare(stateKey(b.targetState))).slice(0, 6).map((item, index) => ({ problemId: `tower-${String(bandIndex * 6 + index + 1).padStart(2, '0')}`, initialState: item.initialState, targetState: item.targetState, minimumMoves: item.distance, difficulty: (bandIndex + 1) as 1 | 2 | 3, stimulusSetVersion: 'three-peg-tower-v1.0.0' })))
})()
export const towerSequence = (seed: string, problemCount: number): TowerProblemSpec[] => {
  const quotas = problemCount === 4 ? [2, 2, 0] : problemCount === 10 ? [4, 4, 2] : [6, 6, 6]
  return quotas.flatMap((quota, band) => shuffleInPlace([...TOWER_BANK.filter((problem) => problem.difficulty === band + 1)], seededRandom(seed, `tower-band:${band + 1}`)).slice(0, quota))
}

export const TRAILMAKING_RANDOMIZATION_ALGORITHM_VERSION = 'trailmaking-sequence-v1.0.0'
export const REVERSALLEARNING_RANDOMIZATION_ALGORITHM_VERSION = 'reversallearning-sequence-v1.0.0'
export const BART_RANDOMIZATION_ALGORITHM_VERSION = 'bart-sequence-v1.0.0'

export type TrailmakingPart = 'A' | 'B'
export type TrailmakingItemSpec = { targetId: string; label: string; part: TrailmakingPart; order: number; x: number; y: number; stimulusSetVersion: 'trailmaking-generated-v1.0.0' }
const TRAILMAKING_GRID = Array.from({ length: 48 }, (_, index) => ({ x: index % 8, y: Math.floor(index / 8) }))
const TRAILMAKING_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
const trailmakingLabels = (part: TrailmakingPart, count: number): string[] => part === 'A'
  ? Array.from({ length: count }, (_, index) => String(index + 1))
  : Array.from({ length: count }, (_, index) => index % 2 === 0 ? String(Math.floor(index / 2) + 1) : TRAILMAKING_LETTERS[Math.floor(index / 2)])
const trailmakingPart = (seed: string, part: TrailmakingPart, count: number, offset: number, fixedPositions?: Array<{ x: number; y: number }>): TrailmakingItemSpec[] => {
  const positions = fixedPositions ?? shuffleInPlace([...TRAILMAKING_GRID], seededRandom(seed, `trailmaking:positions:${part}`)).slice(0, count)
  return trailmakingLabels(part, count).map((label, index) => ({ targetId: `${part}-${String(index + 1).padStart(2, '0')}`, label, part, order: offset + index, x: positions[index].x, y: positions[index].y, stimulusSetVersion: 'trailmaking-generated-v1.0.0' }))
}
export const trailmakingSequence = (seed: string, form: 'A' | 'AB', partAItemCount: number, partBItemCount: number): TrailmakingItemSpec[] => {
  const positions = shuffleInPlace([...TRAILMAKING_GRID], seededRandom(seed, 'trailmaking:positions:all'))
  const partA = trailmakingPart(seed, 'A', partAItemCount, 0, positions.slice(0, partAItemCount))
  const partB = form === 'AB' ? trailmakingPart(seed, 'B', partBItemCount, partA.length, positions.slice(partAItemCount, partAItemCount + partBItemCount)) : []
  return [...partA, ...partB]
}

export type ReversallearningSegment = 'acquisition' | 'reversal'
export type ReversallearningTrialSpec = { segment: ReversallearningSegment; leftSymbol: 'A' | 'B'; rightSymbol: 'A' | 'B'; correctSymbol: 'A' | 'B'; correctResponse: 'left' | 'right'; acquisitionResponse: 'left' | 'right'; rewardRoll: number; stimulusSetVersion: 'reversal-symbols-v1.0.0' }
export const reversallearningSequence = (seed: string, totalTrials: number, acquisitionTrials: number, reversalTrials: number, rewardProbability: number): ReversallearningTrialSpec[] => {
  if (acquisitionTrials + reversalTrials !== totalTrials) throw new Error('reversallearning sequence lengths must sum to totalTrials')
  return Array.from({ length: totalTrials }, (_, trialIndex) => {
    const segment: ReversallearningSegment = trialIndex < acquisitionTrials ? 'acquisition' : 'reversal'
    const leftSymbol: 'A' | 'B' = seededRandom(seed, `reversallearning:position:${trialIndex}`)() < 0.5 ? 'A' : 'B'
    const rightSymbol = leftSymbol === 'A' ? 'B' : 'A'
    const correctSymbol: 'A' | 'B' = segment === 'acquisition' ? 'A' : 'B'
    const correctResponse = leftSymbol === correctSymbol ? 'left' : 'right'
    const acquisitionResponse = leftSymbol === 'A' ? 'left' : 'right'
    const rewardRoll = seededRandom(seed, `reversallearning:feedback:${trialIndex}`)()
    // Keep the raw roll in the replay contract; the runner applies the frozen probability locally.
    void rewardProbability
    return { segment, leftSymbol, rightSymbol, correctSymbol, correctResponse, acquisitionResponse, rewardRoll, stimulusSetVersion: 'reversal-symbols-v1.0.0' }
  })
}

export type BartBalloonSpec = { balloonIndex: number; explosionThreshold: number; stimulusSetVersion: 'bart-generated-v1.0.0' }
export const bartSequence = (seed: string, balloonCount: number, maxPumps: number): BartBalloonSpec[] => Array.from({ length: balloonCount }, (_, balloonIndex) => ({ balloonIndex, explosionThreshold: Math.floor(seededRandom(seed, `bart:threshold:${balloonIndex}`)() * maxPumps) + 1, stimulusSetVersion: 'bart-generated-v1.0.0' }))
