/**
 * Cross-family scientific maturity vocabulary.
 *
 * This is governance metadata, not a runtime capability switch. Product
 * availability is controlled by each instrument/bundle release status. A
 * PUBLISHED PILOT and a PUBLISHED RESEARCH_READY identity must use the same
 * runner, scorer, FINAL path, report/history/export surfaces and Bundle path.
 *
 * RESEARCH_GRADE is reserved for a future, higher evidence bar. The current
 * productisation target is RESEARCH_READY.
 */
export const SCIENTIFIC_MATURITY_LEVELS = [
  'PILOT',
  'RESEARCH_READY',
  'RESEARCH_GRADE',
] as const

export type ScientificMaturity = (typeof SCIENTIFIC_MATURITY_LEVELS)[number]

export const DEFAULT_SCIENTIFIC_MATURITY: ScientificMaturity = 'PILOT'

const SCIENTIFIC_MATURITY_SET = new Set<string>(SCIENTIFIC_MATURITY_LEVELS)

export const isScientificMaturity = (value: unknown): value is ScientificMaturity => (
  typeof value === 'string' && SCIENTIFIC_MATURITY_SET.has(value)
)

/**
 * Lightweight Pilot research backlog. It intentionally records questions and
 * upgrade evidence targets rather than pretending those answers already exist.
 * Family-specific catalogs may embed/reference this contract; runtime code must
 * not depend on it.
 */
export interface ResearchPlanV1 {
  unknowns: string[]
  validationQuestions: string[]
  requiredData: string[]
  plannedAnalyses: string[]
  upgradeCriteria: string[]
  knownGaps: string[]
  evidenceRefs: string[]
}

export const emptyResearchPlan = (): ResearchPlanV1 => ({
  unknowns: [],
  validationQuestions: [],
  requiredData: [],
  plannedAnalyses: [],
  upgradeCriteria: [],
  knownGaps: [],
  evidenceRefs: [],
})
