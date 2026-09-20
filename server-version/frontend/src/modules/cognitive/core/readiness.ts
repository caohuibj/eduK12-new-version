export type CognitiveTaskCategory =
  | 'fixed-trial'
  | 'timed-response'
  | 'adaptive'
  | 'staged'
  | 'learning'
  | 'visuospatial'
  | 'planning'
  | 'decision'

export type CognitiveInputCapability = 'keyboard' | 'pointer' | 'touch'
export type CognitiveResumeDisposition = 'restart-required' | 'trial-boundary-safe'

export interface CognitiveReadinessProfile {
  testType: string
  engineVersion: string
  category: CognitiveTaskCategory
  inputs: readonly CognitiveInputCapability[]
  orientation: 'any'
  globalKeyboardCapture: boolean
  resumeDisposition: CognitiveResumeDisposition
  resumeReason: string
  frozenMediaSlots: readonly ['instruction', 'example', 'stimulus']
}

const profile = (
  testType: string,
  category: CognitiveTaskCategory,
  options: {
    globalKeyboardCapture?: boolean
    inputs?: readonly CognitiveInputCapability[]
    resumeReason?: string
  } = {},
): CognitiveReadinessProfile => ({
  testType,
  engineVersion: '1.0.0',
  category,
  inputs: options.inputs ?? ['keyboard', 'pointer', 'touch'],
  orientation: 'any',
  globalKeyboardCapture: options.globalKeyboardCapture ?? false,
  // FE-07A deliberately fails closed. The shared FINAL_ONLY draft persists trial
  // payload/index plus generic metadata, but none of the current task contracts
  // exports a durable task-phase/adaptive/staircase state that proves a safe
  // remount boundary. Exact sealed FINAL replay remains supported separately.
  resumeDisposition: 'restart-required',
  resumeReason: options.resumeReason
    ?? '当前冻结/本地契约没有持久化足以证明安全重挂任务的 task-level 阶段或自适应状态。',
  frozenMediaSlots: ['instruction', 'example', 'stimulus'],
})

export const COGNITIVE_READINESS_PROFILES: readonly CognitiveReadinessProfile[] = [
  profile('fake', 'fixed-trial'),
  profile('reaction', 'timed-response', { globalKeyboardCapture: true }),
  profile('memory', 'adaptive', { globalKeyboardCapture: true, resumeReason: '数字广度层级/自适应状态未作为独立安全断点持久化。' }),
  profile('stroop', 'staged', { globalKeyboardCapture: true, resumeReason: 'practice/formal 与刺激子阶段未作为独立安全断点持久化。' }),
  profile('gonogo', 'timed-response', { globalKeyboardCapture: true }),
  profile('cpt', 'timed-response', { globalKeyboardCapture: true }),
  profile('nback', 'adaptive', { globalKeyboardCapture: true, resumeReason: 'N 层级与阶段状态不能仅由已存 trial 最大索引证明。' }),
  profile('corsi', 'adaptive', { resumeReason: '空间广度层级/自适应状态未作为独立安全断点持久化。' }),
  profile('sst', 'adaptive', { globalKeyboardCapture: true, resumeReason: '停止信号 staircase/阶段状态未作为独立安全断点持久化。' }),
  profile('taskswitch', 'staged', { globalKeyboardCapture: true }),
  profile('patterncompare', 'timed-response', { globalKeyboardCapture: true }),
  profile('flanker', 'staged', { globalKeyboardCapture: true }),
  profile('cardsort', 'staged', { globalKeyboardCapture: true }),
  profile('digitbackward', 'adaptive', { globalKeyboardCapture: true }),
  profile('picturesequence', 'staged'),
  profile('pairedassociate', 'learning', { resumeReason: '学习状态与已暴露配对刺激不能仅由 trialIndex 重建。' }),
  profile('matrix', 'fixed-trial'),
  profile('mentalrotation', 'visuospatial', { globalKeyboardCapture: true }),
  profile('tower', 'planning', { resumeReason: '题内多步规划状态没有 durable task checkpoint。' }),
  profile('trailmaking', 'visuospatial', { resumeReason: '题内访问序列/路径状态没有 durable task checkpoint。' }),
  profile('reversallearning', 'learning', { resumeReason: '学习/反转状态不能仅由 trialIndex 证明。' }),
  profile('bart', 'decision', { resumeReason: '气球题内泵压状态没有 durable task checkpoint。' }),
  profile('wordlist', 'learning', { resumeReason: '学习轮次与回忆阶段状态没有 durable task checkpoint。' }),
  profile('lexicaldecision', 'timed-response', { globalKeyboardCapture: true }),
  profile('emotionrecognition', 'timed-response', { globalKeyboardCapture: true }),
] as const

const PROFILE_BY_IDENTITY = new Map(
  COGNITIVE_READINESS_PROFILES.map((entry) => [`${entry.testType}/${entry.engineVersion}`, entry] as const),
)

export const resolveCognitiveReadinessProfile = (
  testType: string,
  engineVersion: string,
): CognitiveReadinessProfile | undefined => PROFILE_BY_IDENTITY.get(`${testType}/${engineVersion}`)

export const usesGlobalKeyboardCapture = (testType: string, engineVersion: string) => (
  resolveCognitiveReadinessProfile(testType, engineVersion)?.globalKeyboardCapture === true
)

export const cognitiveInputNotice = (testType: string, engineVersion: string): string | null => {
  const entry = resolveCognitiveReadinessProfile(testType, engineVersion)
  if (!entry) return null
  return '请使用当前任务提供的键盘或触控/指针控件作答；系统按实际输入记录方式，不用屏幕宽度推断输入设备。'
}
