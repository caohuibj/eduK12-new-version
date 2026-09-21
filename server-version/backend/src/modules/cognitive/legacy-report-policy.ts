/** Historical report formats only. New packages must declare their own presentation. */
const experienceHeadlines: Record<string,string> = { stroop: 'incongruentAccuracy', nback: 'dPrimeByN', sst: 'pRespondStop' }
export const legacyExperienceHeadline = (testType: string): string | undefined => experienceHeadlines[testType]
export const legacyMetricAllowed = (testType: string, key: string): boolean => !(testType === 'matrix' && key === 'reachedDifficulty')
export const legacySuppressTips = (testType: string): boolean => testType === 'memory' || testType === 'stroop'
