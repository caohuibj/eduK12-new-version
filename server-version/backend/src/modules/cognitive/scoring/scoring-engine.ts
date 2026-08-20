export interface CognitiveScore {
  score: number
  qualityState: 'interpretable' | 'insufficient'
  metadata?: Record<string, unknown>
}

export interface CognitiveSessionInput {
  id: string
  testType: string
  payload: unknown
}

/**
 * Every cognitive assessment scorer implements the same contract.
 * Individual engines remain isolated while reports consume a stable result.
 */
export interface CognitiveScorer {
  calculate(session: CognitiveSessionInput): Promise<CognitiveScore>
}

export class ScoringEngineRegistry {
  private readonly scorers = new Map<string, CognitiveScorer>()

  register(testType: string, scorer: CognitiveScorer) {
    this.scorers.set(testType, scorer)
  }

  resolve(testType: string) {
    const scorer = this.scorers.get(testType)
    if (!scorer) {
      throw new Error(`No cognitive scorer registered for ${testType}`)
    }
    return scorer
  }
}
