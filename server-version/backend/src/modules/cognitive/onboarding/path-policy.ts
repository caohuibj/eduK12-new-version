export type CognitiveOnboardingPathClass =
  | 'TASK_OWNED'
  | 'GENERATED'
  | 'TASK_TEST'
  | 'SHARED_CORE'

const GENERATED_PATHS = new Set([
  'server-version/backend/src/modules/cognitive/tasks/generated/task-packages.generated.ts',
  'server-version/backend/src/modules/cognitive/tasks/generated/participant-presentations.generated.ts',
  'server-version/backend/src/modules/cognitive/tasks/generated/catalog.generated.ts',
  'server-version/backend/src/modules/cognitive/tasks/generated/seeds.generated.ts',
  'server-version/frontend/src/modules/cognitive/generated/runners.generated.ts',
  'server-version/frontend/src/modules/cognitive/generated/participant-presentations.generated.ts',
])

export const classifyCognitiveOnboardingPath = (
  filePath: string,
  testType: string,
): CognitiveOnboardingPathClass => {
  const normalized = filePath.replace(/\\\\/g, '/')
  if (GENERATED_PATHS.has(normalized)) return 'GENERATED'
  if (normalized.startsWith(`server-version/backend/src/modules/cognitive/tasks/${testType}/`)) {
    return 'TASK_OWNED'
  }
  if (normalized.startsWith(`server-version/frontend/src/modules/cognitive/tasks/${testType}/`)) {
    return 'TASK_OWNED'
  }
  if (
    normalized.startsWith('server-version/backend/src/__tests__/cognitive/')
    || normalized.startsWith('server-version/frontend/src/modules/cognitive/__tests__/')
  ) {
    return 'TASK_TEST'
  }
  return 'SHARED_CORE'
}

export const cognitiveContentOnlyPathsAllowed = (
  paths: string[],
  testType: string,
): boolean => paths.every((filePath) => classifyCognitiveOnboardingPath(filePath, testType) !== 'SHARED_CORE')
