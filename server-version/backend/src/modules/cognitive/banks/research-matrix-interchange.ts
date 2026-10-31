/** Off-line, single-form IRT interchange. No data loading or statistical fitting happens in API requests. */
import type { ResearchTrialDataset, ResearchTrialRow } from '../research-trial-dataset'
import {
  ICARMATRIX_V2_BANK, ICARMATRIX_V2_STIMULUS_SET_VERSION,
  generateIcarmatrixV2Plan, icarmatrixV2OptionOrder,
} from '../tasks/icarmatrix/generator-v2'

export interface MatrixResponseInterchange {
  schemaVersion: 1
  dataOrigin: 'real'
  testType: 'icarmatrix'
  engineVersion: '2.0.0'
  scoringVersion: '1.0.0'
  configVersion: string
  stimulusSetVersion: string
  matrixType: '2x2' | '3x3'
  sampleDescription: string
  personIds: string[]
  itemIds: string[]
  responses: Array<Array<0 | 1 | null>>
  exclusions: Record<'timeout' | 'rapid_guess' | 'interrupted', number>
}

export const buildMatrixResponseInterchange = (
  dataset: ResearchTrialDataset,
  options: {
    configVersion: string
    matrixType: '2x2' | '3x3'
    sampleDescription: string
    timeoutPolicy?: 'missing' | 'incorrect'
  },
): MatrixResponseInterchange => {
  if (dataset.schemaVersion !== 1 || dataset.dataOrigin !== 'real' || dataset.rowCount !== dataset.rows.length) {
    throw new Error('Expected an intact real-origin trial dataset (not simulated data)')
  }
  if (!options.configVersion || !options.sampleDescription.trim()) throw new Error('Specify a frozen config version and sample description')
  const selected = dataset.rows.filter((row) =>
    row.testType === 'icarmatrix' && row.engineVersion === '2.0.0'
    && row.scoringVersion === '1.0.0' && row.configVersion === options.configVersion,
  )
  if (selected.length === 0) throw new Error('No matching icarmatrix v2 data for this exact config version')
  const itemPool = ICARMATRIX_V2_BANK.filter((item) => item.matrixType === options.matrixType)
  const itemIds = itemPool.map((item) => item.itemId)
  const itemMap = new Map(itemPool.map((item) => [item.itemId, item]))
  const itemOffset = new Map(itemIds.map((id, index) => [id, index]))
  const sessions = new Map<string, ResearchTrialRow[]>()
  for (const row of selected) {
    if (row.stimulusSetVersion !== ICARMATRIX_V2_STIMULUS_SET_VERSION || row.matrixType !== options.matrixType) {
      throw new Error('Cannot mix frozen bank versions or age-specific matrix types')
    }
    const rows = sessions.get(row.sessionId) ?? []
    rows.push(row)
    sessions.set(row.sessionId, rows)
  }

  const personIds: string[] = []
  const responses: MatrixResponseInterchange['responses'] = []
  const participants = new Set<string>()
  const exclusions = { timeout: 0, rapid_guess: 0, interrupted: 0 }
  for (const [sessionId, trialRows] of [...sessions.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ordered = [...trialRows].sort((a, b) => a.trialIndex - b.trialIndex)
    const first = ordered[0]
    if (!first.randomSeed || !first.participantId) throw new Error(`Missing frozen seed or participant identity for ${sessionId}`)
    if (!Number.isInteger(first.plannedTotalTrials) || first.plannedTotalTrials === null ||
        first.plannedTotalTrials < 1 || ordered.length !== first.plannedTotalTrials) {
      throw new Error(`Incomplete frozen trial count for ${sessionId}: planned ${first.plannedTotalTrials}, exported ${ordered.length}`)
    }
    if (participants.has(first.participantId)) throw new Error('Repeated participant across sessions: select one assessment/wave before IRT fitting')
    participants.add(first.participantId)
    if (ordered.some((row, index) =>
      row.trialIndex !== index || row.randomSeed !== first.randomSeed ||
      row.participantId !== first.participantId || row.attemptNo !== first.attemptNo ||
      row.plannedTotalTrials !== first.plannedTotalTrials
    )) throw new Error(`Incomplete, duplicate or inconsistent trial history for ${sessionId}`)
    const plan = generateIcarmatrixV2Plan(first.randomSeed, ordered.length, options.matrixType)
    const answers: Array<0 | 1 | null> = Array(itemIds.length).fill(null)
    ordered.forEach((row, trialIndex) => {
      const bankItem = ICARMATRIX_V2_BANK[plan[trialIndex]]
      const payload = row.payload
      if (!bankItem || payload.bankItemId !== bankItem.itemId) {
        throw new Error(`Frozen seed/item mismatch in session ${sessionId}, trial ${trialIndex}`)
      }
      const offset = itemOffset.get(bankItem.itemId)
      if (offset === undefined || !itemMap.has(bankItem.itemId)) throw new Error('Unexpected item family')
      const selectedOption = payload.responseIndex
      if (selectedOption !== null && (!Number.isInteger(selectedOption) ||
          typeof selectedOption !== 'number' || selectedOption < 0 || selectedOption >= 6)) {
        throw new Error(`Invalid response index in session ${sessionId}`)
      }
      if (!['complete', 'timeout', 'rapid_guess', 'interrupted'].includes(row.trialQuality)) {
        throw new Error(`Unknown trial quality classification in session ${sessionId}`)
      }
      if (row.trialQuality !== 'complete') {
        exclusions[row.trialQuality] += 1
        if (row.trialQuality === 'timeout' && options.timeoutPolicy === 'incorrect') answers[offset] = 0
      } else {
        if (selectedOption === null) throw new Error('Complete trial cannot have a null response')
        const order = icarmatrixV2OptionOrder(first.randomSeed, trialIndex, bankItem.responses.length)
        answers[offset] = order[selectedOption as number] === bankItem.correctResponseIndex ? 1 : 0
      }
    })
    personIds.push(first.participantId)
    responses.push(answers)
  }
  return {
    schemaVersion: 1, dataOrigin: 'real', testType: 'icarmatrix',
    engineVersion: '2.0.0', scoringVersion: '1.0.0',
    configVersion: options.configVersion,
    stimulusSetVersion: ICARMATRIX_V2_STIMULUS_SET_VERSION,
    matrixType: options.matrixType,
    sampleDescription: options.sampleDescription.trim(), personIds, itemIds, responses, exclusions,
  }
}
