import type { CognitiveScoreResult, ScoringTrial } from '../cognitive.types'

export const scoringEngineKey = (
  testType: string,
  engineVersion: string,
  scoringVersion: string
): string => `${testType}/${engineVersion}/${scoringVersion}`

export interface CognitiveScorer<TConfig = unknown, TTrial = unknown> {
  calculate(input: {
    config: TConfig
    trials: ScoringTrial<TTrial>[]
  }): CognitiveScoreResult
}

/**
 * Version-keyed dispatch for scoring implementations.
 *
 * The key includes the exact test, engine, and scoring versions so a
 * completed session is always scored by its frozen implementation contract.
 */
export class ScoringEngineRegistry {
  private readonly scorers = new Map<string, CognitiveScorer>()

  register(key: string, scorer: CognitiveScorer): void {
    if (this.scorers.has(key)) {
      throw new Error(`Duplicate cognitive scoring engine: ${key}`)
    }
    this.scorers.set(key, scorer)
  }

  resolve(key: string): CognitiveScorer {
    const scorer = this.scorers.get(key)
    if (!scorer) {
      throw new Error(`No cognitive scoring engine registered for ${key}`)
    }
    return scorer
  }

  calculate(
    key: string,
    input: { config: unknown; trials: ScoringTrial<unknown>[] }
  ): CognitiveScoreResult {
    return this.resolve(key).calculate(input)
  }
}
