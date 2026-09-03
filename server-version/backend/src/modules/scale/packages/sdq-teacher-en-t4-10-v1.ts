/**
 * SDQ Teacher T4-10 — English source locked from authorized PDF
 * `docs/unified-assessment-bundle-v1/source-instruments/sdq-teacher-t4-10-en.pdf`
 * Form code **T 4-10**, © Robert Goodman, 2005.
 *
 * Product key remains `sdq_teacher_zh_cn` for the observer bundle, but **zh-CN item
 * text is NOT invented**. Display language for this package is English (source identity).
 * zh-CN localization requires a signed translation manifest before claiming zh-CN content.
 *
 * Scoring: Goodman published formulas. Impact supplement present on T4-10:
 * distress + peer relations + classroom learning (0/0/1/2); chronicity/burden excluded.
 * UK teacher 4-band cited descriptively only — not mainland CN norms.
 */
import type { ScaleDefinitionV2 } from '../scale-definition'
import type { ScaleGoldenCase } from './adexi-v2'
import { SDQ_TEACHER_SCORER_KEY } from './sdq-teacher-impact-scorer'
import {
  SDQ_REVERSE_ITEM_NUMBERS,
  SDQ_SUBSCALE_ITEMS,
  describeUkFourBand,
  makeSdqItemCode,
  sdqItemCodesFor,
} from './sdq-shared'

const symptomOptions = [
  { value: 'not_true', label: 'Not True', score: 0 },
  { value: 'somewhat_true', label: 'Somewhat True', score: 1 },
  { value: 'certainly_true', label: 'Certainly True', score: 2 },
] as const

/** Exact 25 symptom items from sdq-teacher-t4-10-en.pdf */
const symptomContents = [
  "Considerate of other people's feelings",
  'Restless, overactive, cannot stay still for long',
  'Often complains of headaches, stomach-aches or sickness',
  'Shares readily with other children, for example toys, treats, pencils',
  'Often loses temper',
  'Rather solitary, prefers to play alone',
  'Generally well behaved, usually does what adults request',
  'Many worries or often seems worried',
  'Helpful if someone is hurt, upset or feeling ill',
  'Constantly fidgeting or squirming',
  'Has at least one good friend',
  'Often fights with other children or bullies them',
  'Often unhappy, depressed or tearful',
  'Generally liked by other children',
  'Easily distracted, concentration wanders',
  'Nervous or clingy in new situations, easily loses confidence',
  'Kind to younger children',
  'Often lies or cheats',
  'Picked on or bullied by other children',
  'Often offers to help others (parents, teachers, other children)',
  'Thinks things out before acting',
  'Steals from home, school or elsewhere',
  'Gets along better with adults than with other children',
  'Many fears, easily scared',
  'Good attention span, sees work through to the end',
] as const

/**
 * Impact supplement items from T4-10 reverse page.
 * Scoring per Goodman: Not at all / Only a little = 0; A medium amount = 1; A great deal = 2.
 * Chronicity and burden are NOT in the impact score.
 */
const impactOptions = [
  { value: 'not_at_all', label: 'Not at all', score: 0 },
  { value: 'only_a_little', label: 'Only a little', score: 0 },
  { value: 'a_medium_amount', label: 'A medium amount', score: 1 },
  { value: 'a_great_deal', label: 'A great deal', score: 2 },
] as const

/** Overall difficulties gate — Goodman: if No, impact score = 0. */
const overallImpactOptions = [
  { value: 'no', label: 'No', score: 0 },
  { value: 'yes_minor', label: 'Yes - minor difficulties', score: 0 },
  { value: 'yes_definite', label: 'Yes - definite difficulties', score: 0 },
  { value: 'yes_severe', label: 'Yes - severe difficulties', score: 0 },
] as const

const overallItem = {
  code: 'SDQ-IMPACT-OVERALL',
  content: 'Overall, do you think that this child has difficulties in any of the following areas: emotions, concentration, behaviour or being able to get on with other people?',
} as const

const impactItems = [
  { code: 'SDQ-IMPACT-DISTRESS', content: 'Do the difficulties upset or distress the child?' },
  { code: 'SDQ-IMPACT-PEER', content: "Do the difficulties interfere with the child's everyday life in PEER RELATIONSHIPS?" },
  { code: 'SDQ-IMPACT-CLASSROOM', content: "Do the difficulties interfere with the child's everyday life in CLASSROOM LEARNING?" },
] as const

const reverseSet = new Set<number>(SDQ_REVERSE_ITEM_NUMBERS)
const symptomCodes = symptomContents.map((_, index) => makeSdqItemCode(index + 1))

const symptomItemSource = (numbers: readonly number[]) => ({
  type: 'items' as const,
  items: sdqItemCodesFor(numbers).map((itemCode) => ({ itemCode, weight: 1 })),
  aggregation: 'sum' as const,
})

export const SDQ_TEACHER_EN_T4_10_V1_DEFINITION: ScaleDefinitionV2 = {
  schemaVersion: 2,
  respondentType: 'teacher_observer',
  source: {
    title: 'Strengths and Difficulties Questionnaire — Teacher T 4-10 (English)',
    citation: 'Goodman R. SDQ Teacher form T 4-10 © 2005. Transcribed from authorized PDF sdq-teacher-t4-10-en.pdf. Scoring: Goodman published instructions. UK teacher 4-band cited descriptively only. zh-CN translation not claimed in this package.',
    url: 'https://www.sdqinfo.org/py/sdqinfo/c0.py',
    publicationYear: 2005,
  },
  license: {
    status: 'authorized',
    redistribution: 'restricted',
    note: 'English source locked. Electronic admin/scoring require APPROVED authorization. zh-CN localization pending signed translation manifest — do not invent Chinese teacher items.',
  },
  display: { randomizeItems: false },
  responseSets: [
    { key: 'sdq_not_somewhat_certainly_en', options: [...symptomOptions] },
    { key: 'sdq_impact_overall_en', options: [...overallImpactOptions] },
    { key: 'sdq_impact_0_2_en', options: [...impactOptions] },
  ],
  items: [
    ...symptomContents.map((content, index) => ({
      itemCode: makeSdqItemCode(index + 1),
      content,
      type: 'single' as const,
      required: true,
      sortOrder: index,
      responseSetKey: 'sdq_not_somewhat_certainly_en',
      randomizeOptions: false,
    })),
    {
      itemCode: overallItem.code,
      content: overallItem.content,
      type: 'single' as const,
      required: true,
      sortOrder: 25,
      responseSetKey: 'sdq_impact_overall_en',
      randomizeOptions: false,
    },
    ...impactItems.map((row, index) => ({
      itemCode: row.code,
      content: row.content,
      type: 'single' as const,
      required: true,
      sortOrder: 26 + index,
      responseSetKey: 'sdq_impact_0_2_en',
      randomizeOptions: false,
    })),
  ],
  scoring: {
    scoringVersion: '1.0.0',
    scorerKey: SDQ_TEACHER_SCORER_KEY,
    itemRules: [
      ...symptomCodes.map((itemCode, index) => ({
        itemCode,
        transform: reverseSet.has(index + 1)
          ? { type: 'reverse' as const }
          : { type: 'identity' as const },
      })),
      { itemCode: overallItem.code, transform: { type: 'identity' as const } },
      ...impactItems.map((row) => ({
        itemCode: row.code,
        transform: { type: 'identity' as const },
      })),
    ],
    defaultMissingPolicy: { type: 'complete_required' },
    scores: [
      {
        key: 'emotional',
        type: 'dimension',
        label: 'Emotional symptoms',
        description: 'Goodman Emotional symptoms (0–10).',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        range: { min: 0, max: 10 },
        missingPolicy: { type: 'complete_required' },
        source: symptomItemSource(SDQ_SUBSCALE_ITEMS.emotional),
      },
      {
        key: 'conduct',
        type: 'dimension',
        label: 'Conduct problems',
        description: 'Goodman Conduct problems (0–10).',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        range: { min: 0, max: 10 },
        missingPolicy: { type: 'complete_required' },
        source: symptomItemSource(SDQ_SUBSCALE_ITEMS.conduct),
      },
      {
        key: 'hyperactivity',
        type: 'dimension',
        label: 'Hyperactivity/inattention',
        description: 'Goodman Hyperactivity/inattention (0–10).',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        range: { min: 0, max: 10 },
        missingPolicy: { type: 'complete_required' },
        source: symptomItemSource(SDQ_SUBSCALE_ITEMS.hyperactivity),
      },
      {
        key: 'peer',
        type: 'dimension',
        label: 'Peer relationship problems',
        description: 'Goodman Peer problems (0–10).',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        range: { min: 0, max: 10 },
        missingPolicy: { type: 'complete_required' },
        source: symptomItemSource(SDQ_SUBSCALE_ITEMS.peer),
      },
      {
        key: 'prosocial',
        type: 'dimension',
        label: 'Prosocial behaviour',
        description: 'Goodman Prosocial (0–10); excluded from total difficulties.',
        direction: 'higher_is_better',
        canonical: false,
        displayPrecision: 0,
        range: { min: 0, max: 10 },
        missingPolicy: { type: 'complete_required' },
        source: symptomItemSource(SDQ_SUBSCALE_ITEMS.prosocial),
      },
      {
        key: 'total_difficulties',
        type: 'total',
        label: 'Total difficulties',
        description: 'Sum of emotional+conduct+hyperactivity+peer (0–40).',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        range: { min: 0, max: 40 },
        missingPolicy: { type: 'complete_required' },
        source: {
          type: 'scores',
          scores: [
            { scoreKey: 'emotional', weight: 1 },
            { scoreKey: 'conduct', weight: 1 },
            { scoreKey: 'hyperactivity', weight: 1 },
            { scoreKey: 'peer', weight: 1 },
          ],
          aggregation: 'sum',
        },
      },
      {
        key: 'impact',
        type: 'dimension',
        label: 'Impact score (teacher)',
        description: 'Goodman teacher impact: distress + peer + classroom (0–6). When overall difficulties answered No, score impact items as Not at all (0) per Goodman.',
        direction: 'higher_is_worse',
        canonical: false,
        displayPrecision: 0,
        range: { min: 0, max: 6 },
        missingPolicy: { type: 'complete_required' },
        source: {
          type: 'items',
          items: impactItems.map((row) => ({ itemCode: row.code, weight: 1 })),
          aggregation: 'sum',
        },
      },
    ],
  },
  report: {
    reportVersion: '1.0.0',
    primaryScoreKeys: ['total_difficulties', 'emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial', 'impact'],
    scoreOrder: ['total_difficulties', 'emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial', 'impact'],
    interpretations: [
      {
        scoreKey: 'total_difficulties',
        headline: 'SDQ Total difficulties (descriptive)',
        source: { type: 'score_only' },
        summary: `Teacher T4-10 total difficulties (0–40). ${describeUkFourBand('teacher')} Form ages 4–10. English source locked; zh-CN translation not claimed.`,
        bands: [],
        guidance: [
          { category: 'reflection', text: 'Base answers on the last six months or this school year (form instructions).' },
          { category: 'support', text: 'Low or high scores alone are not crisis signals; no diagnosis.' },
        ],
      },
      {
        scoreKey: 'emotional',
        headline: 'Emotional symptoms (descriptive)',
        source: { type: 'score_only' },
        summary: 'Goodman Emotional symptoms subscale (0–10). UK cut-points literature-only; not mainland CN norms.',
        bands: [],
        guidance: [],
      },
      {
        scoreKey: 'conduct',
        headline: 'Conduct problems (descriptive)',
        source: { type: 'score_only' },
        summary: 'Goodman Conduct problems subscale (0–10).',
        bands: [],
        guidance: [],
      },
      {
        scoreKey: 'hyperactivity',
        headline: 'Hyperactivity/inattention (descriptive)',
        source: { type: 'score_only' },
        summary: 'Goodman Hyperactivity/inattention subscale (0–10).',
        bands: [],
        guidance: [],
      },
      {
        scoreKey: 'peer',
        headline: 'Peer problems (descriptive)',
        source: { type: 'score_only' },
        summary: 'Goodman Peer relationship problems subscale (0–10).',
        bands: [],
        guidance: [],
      },
      {
        scoreKey: 'prosocial',
        headline: 'Prosocial behaviour (descriptive)',
        source: { type: 'score_only' },
        summary: 'Goodman Prosocial subscale (0–10); not in total difficulties.',
        bands: [],
        guidance: [],
      },
      {
        scoreKey: 'impact',
        headline: 'Teacher impact score (descriptive)',
        source: { type: 'score_only' },
        summary: 'Goodman teacher impact (distress + peer relations + classroom learning; 0–6). Chronicity and burden excluded. If overall difficulties answered No, impact is typically 0.',
        bands: [],
        guidance: [],
      },
    ],
    limitations: [
      'English T4-10 source locked; zh-CN teacher item text pending signed translation manifest — not invented.',
      'Form code T 4-10 → subject ages 4–10 for this package.',
      describeUkFourBand('teacher'),
      'Not mainland CN clinical norms; not diagnosis.',
      'Electronic admin/scoring require approved authorization.',
      'No cross-informant synthesis in this PR.',
    ],
    disclaimer: 'Not a diagnostic tool. English source identity only; do not present as verified mainland Chinese teacher form until signed localization lands. UK community cut-points are literature references only.',
  },
  referencePolicy: { type: 'none' },
}

const allCertainly = symptomCodes.map((itemCode) => ({ itemCode, responseValue: 'certainly_true' }))

export const SDQ_TEACHER_EN_T4_10_V1_GOLDEN_CASES: ScaleGoldenCase[] = [
  {
    name: 'symptoms-all-certainly-impact-zero',
    answers: [
      ...allCertainly,
      { itemCode: 'SDQ-IMPACT-OVERALL', responseValue: 'yes_minor' },
      { itemCode: 'SDQ-IMPACT-DISTRESS', responseValue: 'not_at_all' },
      { itemCode: 'SDQ-IMPACT-PEER', responseValue: 'not_at_all' },
      { itemCode: 'SDQ-IMPACT-CLASSROOM', responseValue: 'not_at_all' },
    ],
    expected: {
      quality: 'interpretable',
      scores: {
        emotional: 10,
        conduct: 8,
        hyperactivity: 6,
        peer: 6,
        prosocial: 10,
        total_difficulties: 30,
        impact: 0,
      },
      totalScoreKeys: ['emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial', 'total_difficulties', 'impact'],
    },
  },
  {
    name: 'symptoms-somewhat-impact-great',
    answers: [
      ...symptomCodes.map((itemCode) => ({ itemCode, responseValue: 'somewhat_true' })),
      { itemCode: 'SDQ-IMPACT-OVERALL', responseValue: 'yes_definite' },
      { itemCode: 'SDQ-IMPACT-DISTRESS', responseValue: 'a_great_deal' },
      { itemCode: 'SDQ-IMPACT-PEER', responseValue: 'a_great_deal' },
      { itemCode: 'SDQ-IMPACT-CLASSROOM', responseValue: 'a_medium_amount' },
    ],
    expected: {
      quality: 'interpretable',
      scores: {
        emotional: 5,
        conduct: 5,
        hyperactivity: 5,
        peer: 5,
        prosocial: 5,
        total_difficulties: 20,
        impact: 5,
      },
      totalScoreKeys: ['emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial', 'total_difficulties', 'impact'],
    },
  },
  {
    // Goodman gate: overall=No forces impact=0 even when impact items are elevated.
    name: 'overall-no-gates-impact-to-zero',
    answers: [
      ...symptomCodes.map((itemCode) => ({ itemCode, responseValue: 'somewhat_true' })),
      { itemCode: 'SDQ-IMPACT-OVERALL', responseValue: 'no' },
      { itemCode: 'SDQ-IMPACT-DISTRESS', responseValue: 'a_great_deal' },
      { itemCode: 'SDQ-IMPACT-PEER', responseValue: 'a_great_deal' },
      { itemCode: 'SDQ-IMPACT-CLASSROOM', responseValue: 'a_great_deal' },
    ],
    expected: {
      quality: 'interpretable',
      scores: {
        emotional: 5,
        conduct: 5,
        hyperactivity: 5,
        peer: 5,
        prosocial: 5,
        total_difficulties: 20,
        impact: 0,
      },
      totalScoreKeys: ['emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial', 'total_difficulties', 'impact'],
    },
  },
]

export const SDQ_TEACHER_EN_T4_10_V1_PACKAGE = {
  key: 'sdq_teacher_zh_cn',
  instrumentVersion: '1.0.0',
  releaseStatus: 'DRAFT' as const,
  definition: SDQ_TEACHER_EN_T4_10_V1_DEFINITION,
  references: [],
  goldenCases: SDQ_TEACHER_EN_T4_10_V1_GOLDEN_CASES,
}

/** Gate reason until zh-CN signed translation exists. */
export const SDQ_TEACHER_ZH_CN_TRANSLATION_PENDING = {
  status: 'PENDING_SIGNED_TRANSLATION' as const,
  sourceLocale: 'en',
  sourceFormCode: 'T4-10',
  targetLocale: 'zh-CN',
  notes: [
    'Official English T4-10 items are locked in-package.',
    'Do not invent Simplified Chinese teacher items.',
    'Publish as zh-CN content only after signed translation/back-translation/mainland language review manifest.',
  ],
}
