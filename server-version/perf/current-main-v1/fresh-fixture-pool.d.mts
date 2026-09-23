export interface FreshFixture {
  fixtureId: string
  method: 'POST'
  path: string
  body: { submissionId: string; attemptEpoch: number; [key: string]: unknown }
  [key: string]: unknown
}
export function assertFreshFixturePool(
  groups: Record<string, FreshFixture[]>,
  options?: { allowCrossGroupAliases?: boolean },
): { fixtureCount: number; uniqueAttempts: number }
export function partitionFreshFixturePool<T extends FreshFixture>(
  fixtures: T[], warmupCount: number, steadyCount: number,
): { warmup: T[]; steady: T[] }
