/**
 * TEXI (Teenage Executive Functioning Inventory) — Parents and Teachers English source.
 *
 * Item text locked from authorized PDF `texi-or-adexi-related.pdf`, cross-checked against
 * official chexi.se parent/teacher PDF where attached OCR mixed self-report bleed (items 9–10).
 *
 * Response options exact (PDF): Definitely not true / Not true / Partially true / True / Definitely true (1–5).
 *
 * Scoring literature: Thorell et al. (2020) Child Neuropsychology, PMID 32090688.
 * Two factors — Working Memory + Inhibition; scores = mean of subscale items (paper reports means).
 * Ages 13–19. Descriptive only — no mainland CN norms.
 *
 * Product keys `texi_parent_zh_cn` / `texi_teacher_zh_cn` share this English source identity.
 * zh-CN translation/back-translation/terminology/mainland language review + signed manifest required
 * before claiming Simplified Chinese content (Commit 10 localization gate).
 */
import type { ScaleDefinitionV2 } from '../scale-definition'
import type { ScaleGoldenCase } from './adexi-v2'

export const TEXI_SOURCE_VERSION_LABEL = 'Thorell et al. 2020 / ages 13-19' as const
export const TEXI_SUBJECT_AGE_MIN = 13
export const TEXI_SUBJECT_AGE_MAX = 19

/** Exact Likert labels from TEXI Parents and Teachers PDF */
const responseOptions = [
  { value: '1', label: 'Definitely not true', score: 1 },
  { value: '2', label: 'Not true', score: 2 },
  { value: '3', label: 'Partially true', score: 3 },
  { value: '4', label: 'True', score: 4 },
  { value: '5', label: 'Definitely true', score: 5 },
] as const

/**
 * Official English parent/teacher items (20).
 * Wording follows attached authorized PDF; items 9–10 cleaned of OCR self-report bleed
 * using chexi.se English parent/teacher report (same instrument).
 */
const itemContents = [
  'Has difficulties remembering lengthy instructions',
  'Sometimes has difficulties remembering what he/she needs to do in the middle of an activity',
  'Has a tendency to do things without first thinking about what could happen',
  'Has difficulties stopping an activity even though he/she is told that it is not allowed',
  'When someone asks him/her to do several things, he/she sometimes cannot remember all of them',
  'Sometimes has difficulties refraining from laughing or smiling in situations where it is inappropriate',
  'Has difficulties coming up with a new way to solve a problem when he/she gets stuck',
  'When asked to get something, he/she sometimes forgets what he/she is supposed to get',
  'Finds it difficult to plan things (e.g., remembering to bring everything necessary for school or when going on a trip)',
  'Has difficulties stopping him-/herself during an activity he/she likes (e.g., sits in front of the computer/mobile device even though it is time to go to bed)',
  'Sometimes has difficulties understanding instructions unless he/she is also shown how to do something',
  'Has difficulties with tasks involving several steps that need to be completed in a certain order',
  'Has difficulties learning from his/her own mistakes (e.g., repeats the same mistake over and over again)',
  'Appears to be livelier/wilder compared to his/her peers',
  'Has difficulties motivating him-/herself to do things that he/she does not like to do',
  'Has difficulties starting a task if distracted by something he/she likes (e.g., fails to start doing homework and instead uses his/her mobile device)',
  'Has difficulties stopping an activity when asked to do so',
  'Often gets more stoked (excited) compared to his/her peers if something special happens (e.g., parties, trips, birthdays, winning a computer game)',
  'Fails to finish things that he/she has started',
  'Puts things off until the last minute',
] as const

/** Working Memory factor items (1-based) — official TEXI subscales PDF: includes item 13 */
export const TEXI_WORKING_MEMORY_ITEMS = [1, 2, 5, 7, 8, 9, 11, 12, 13] as const
/** Inhibition factor: items 3,4,6,10,14–20 (initiation/completion/procrastination) */
export const TEXI_INHIBITION_ITEMS = [3, 4, 6, 10, 14, 15, 16, 17, 18, 19, 20] as const

export const makeTexiItemCode = (index: number): string => `TEXI-${String(index).padStart(2, '0')}`

const itemCodes = itemContents.map((_, index) => makeTexiItemCode(index + 1))
export const TEXI_ITEM_CODES = itemCodes

const meanSource = (numbers: readonly number[]) => ({
  type: 'items' as const,
  items: numbers.map((n) => ({ itemCode: makeTexiItemCode(n), weight: 1 })),
  aggregation: 'mean' as const,
})

const buildDefinition = (respondentType: 'parent_observer' | 'teacher_observer'): ScaleDefinitionV2 => ({
  schemaVersion: 2,
  respondentType,
  source: {
    title: 'Teenage Executive Functioning Inventory (TEXI) — Parents and Teachers (English)',
    citation: 'Thorell LB, et al. Psychometric properties of the Teenage Executive Functioning Inventory (TEXI). Child Neuropsychology. 2020. PMID 32090688. English parent/teacher form; ages 13–19. Free instrument (chexi.se).',
    url: 'https://pubmed.ncbi.nlm.nih.gov/32090688/',
    publicationYear: 2020,
  },
  license: {
    status: 'authorized',
    redistribution: 'restricted',
    note: 'English source locked. zh-CN content requires signed localization manifest (translation/back-translation/terminology/mainland language review). Descriptive only — no mainland norms.',
  },
  display: { randomizeItems: false },
  responseSets: [{ key: 'texi_likert_1_5_en', options: [...responseOptions] }],
  items: itemContents.map((content, index) => ({
    itemCode: makeTexiItemCode(index + 1),
    content,
    type: 'single' as const,
    required: true,
    sortOrder: index,
    responseSetKey: 'texi_likert_1_5_en',
    randomizeOptions: false,
  })),
  scoring: {
    scoringVersion: '1.0.0',
    itemRules: itemCodes.map((itemCode) => ({ itemCode, transform: { type: 'identity' as const } })),
    defaultMissingPolicy: { type: 'complete_required' },
    scores: [
      {
        key: 'working_memory',
        type: 'dimension',
        label: 'Working Memory (mean)',
        description: 'Official TEXI Working Memory factor mean (items 1,2,5,7,8,9,11,12,13); higher = more reported difficulty.',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 2,
        missingPolicy: { type: 'complete_required' },
        source: meanSource(TEXI_WORKING_MEMORY_ITEMS),
      },
      {
        key: 'inhibition',
        type: 'dimension',
        label: 'Inhibition (mean)',
        description: 'Official TEXI Inhibition factor mean (items 3,4,6,10,14–20); higher = more reported difficulty.',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 2,
        missingPolicy: { type: 'complete_required' },
        source: meanSource(TEXI_INHIBITION_ITEMS),
      },
      {
        key: 'total_mean',
        type: 'total',
        label: 'TEXI total mean',
        description: 'Mean of all 20 items (descriptive composite; primary published factors are WM + Inhibition).',
        direction: 'higher_is_worse',
        canonical: false,
        displayPrecision: 2,
        missingPolicy: { type: 'complete_required' },
        source: meanSource([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]),
      },
    ],
  },
  report: {
    reportVersion: '1.0.0',
    primaryScoreKeys: ['working_memory', 'inhibition', 'total_mean'],
    scoreOrder: ['working_memory', 'inhibition', 'total_mean'],
    interpretations: [
      {
        scoreKey: 'working_memory',
        headline: 'TEXI Working Memory (descriptive mean)',
        source: { type: 'score_only' },
        summary: 'Mean of Working Memory items (1–5 Likert). Thorell et al. 2020 Swedish adolescent validation sample reported parent-rated WM means near ~2.0–2.1; cited descriptively only — not mainland CN norms, not diagnosis.',
        bands: [],
        guidance: [
          { category: 'reflection', text: 'Review lengthy instructions, multi-step tasks, and planning situations noted by the informant.' },
          { category: 'strategy', text: 'Consider external memory aids and shorter instruction chunks — strategies are educational, not treatment claims.' },
        ],
      },
      {
        scoreKey: 'inhibition',
        headline: 'TEXI Inhibition (descriptive mean)',
        source: { type: 'score_only' },
        summary: 'Mean of Inhibition items including initiation, completion, and procrastination items added for teenagers (Thorell et al. 2020). Parent-rated inhibition means in the validation sample were near ~2.7–2.8; literature descriptive only — no mainland norms.',
        bands: [],
        guidance: [
          { category: 'reflection', text: 'Review stopping preferred activities, impulse control, and task initiation/completion.' },
          { category: 'environment', text: 'Consider cues and buffers when switching activities — not a clinical cut-off.' },
        ],
      },
      {
        scoreKey: 'total_mean',
        headline: 'TEXI total mean (descriptive)',
        source: { type: 'score_only' },
        summary: 'Average of all 20 items. Prefer interpreting WM and Inhibition factors separately per published structure.',
        bands: [],
        guidance: [],
      },
    ],
    limitations: [
      'English source locked; zh-CN localization pending signed manifest — do not invent Chinese TEXI items.',
      'Ages 13–19 only (Thorell et al. 2020).',
      'Descriptive only — no mainland CN norms, no diagnosis, no convergence claims.',
      'WHO-5/SDQ/TEXI/ADEXI low scores must not be treated as crisis signals by themselves.',
      'No cross-informant synthesis in this PR.',
    ],
    disclaimer: 'TEXI results are descriptive informant ratings, not diagnostic conclusions. English source identity; Simplified Chinese display requires a signed localization manifest. Not mainland Chinese norms.',
  },
  referencePolicy: { type: 'none' },
})

const answersAll = (value: string) => itemCodes.map((itemCode) => ({ itemCode, responseValue: value }))

export const TEXI_EN_V1_GOLDEN_CASES: ScaleGoldenCase[] = [
  {
    name: 'all-definitely-true',
    answers: answersAll('5'),
    expected: {
      quality: 'interpretable',
      scores: { working_memory: 5, inhibition: 5, total_mean: 5 },
      totalScoreKeys: ['working_memory', 'inhibition', 'total_mean'],
    },
  },
  {
    name: 'all-definitely-not-true',
    answers: answersAll('1'),
    expected: {
      quality: 'interpretable',
      scores: { working_memory: 1, inhibition: 1, total_mean: 1 },
      totalScoreKeys: ['working_memory', 'inhibition', 'total_mean'],
    },
  },
  {
    name: 'all-partially-true',
    answers: answersAll('3'),
    expected: {
      quality: 'interpretable',
      scores: { working_memory: 3, inhibition: 3, total_mean: 3 },
      totalScoreKeys: ['working_memory', 'inhibition', 'total_mean'],
    },
  },
  {
    // Asymmetric: only item 13 (WM per official subscales PDF) elevated — Inhibition unchanged.
    name: 'only-item-13-elevated',
    answers: itemCodes.map((itemCode) => ({
      itemCode,
      responseValue: itemCode === makeTexiItemCode(13) ? '5' : '1',
    })),
    expected: {
      quality: 'interpretable',
      scores: {
        working_memory: 13 / 9,
        inhibition: 1,
        total_mean: 1.2,
      },
      totalScoreKeys: ['working_memory', 'inhibition', 'total_mean'],
    },
  },
]

export const TEXI_PARENT_EN_V1_PACKAGE = {
  key: 'texi_parent_zh_cn',
  instrumentVersion: '1.0.0',
  releaseStatus: 'DRAFT' as const,
  definition: buildDefinition('parent_observer'),
  references: [],
  goldenCases: TEXI_EN_V1_GOLDEN_CASES,
}

export const TEXI_TEACHER_EN_V1_PACKAGE = {
  key: 'texi_teacher_zh_cn',
  instrumentVersion: '1.0.0',
  releaseStatus: 'DRAFT' as const,
  definition: buildDefinition('teacher_observer'),
  references: [],
  goldenCases: TEXI_EN_V1_GOLDEN_CASES,
}
