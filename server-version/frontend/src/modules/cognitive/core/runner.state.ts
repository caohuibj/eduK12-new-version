import type { CognitiveResult } from '../types'
import type { CognitiveTaskContext, RunnerError, RunnerState } from './runner.types'

/**
 * Runner 纯状态机 reducer（Stage B v1.1 §20）。
 *
 * 状态流：LOADING → READY → RUNNING → SUBMITTING_TRIAL → RUNNING → … → COMPLETING → COMPLETED
 * 异常：UNSUPPORTED / ERROR / RECOVERY_REQUIRED
 *
 * 安全规则：
 *  - TRIAL_CONFLICT（append 409 异 hash）→ RECOVERY_REQUIRED，不重试、不猜、不重提旧 trial（v1.1 §21.2）。
 *  - TRIAL_SUBMIT_START 仅允许在 RUNNING 发起；失败留在 RUNNING（可重试）。
 *  - 客户端不持久化权威 score：COMPLETE_SUCCESS 只携带服务器返回的 result。
 */

export type RunnerAction =
  | { type: 'LOADING' }
  | { type: 'SESSION_LOADED'; session: NonNullable<RunnerState['session']>; trialIndex: number }
  | { type: 'LEGACY_READ_ONLY'; session: NonNullable<RunnerState['session']> }
  | { type: 'SESSION_ERROR'; error: RunnerError }
  | { type: 'RUNNER_UNSUPPORTED' }
  | { type: 'RECOVERY_REQUIRED' }
  | { type: 'START_RUN' }
  | { type: 'TRIAL_SUBMIT_START' }
  | { type: 'TRIAL_SUBMIT_SUCCESS'; trialIndex: number }
  | { type: 'TRIAL_SUBMIT_FAILED'; error: RunnerError }
  | { type: 'TRIAL_CONFLICT' }
  | { type: 'COMPLETE_START' }
  | { type: 'COMPLETE_SUCCESS'; result: CognitiveResult }
  | { type: 'FINAL_SUBMIT_CONFLICT'; error: RunnerError }
  | { type: 'COMPLETE_FAILED'; error: RunnerError }

export const initialRunnerState: RunnerState = {
  status: 'LOADING',
  session: null,
  taskContext: null,
  trialIndex: 0,
  error: null,
  result: null,
}

const buildTaskContext = (session: NonNullable<RunnerState['session']>): CognitiveTaskContext => ({
  sessionId: session.sessionId,
  testType: session.testType,
  engineVersion: session.engineVersion,
  scoringVersion: session.scoringVersion,
  configVersion: session.configVersion,
  attemptNo: session.attemptNo,
  config: session.config,
  randomSeed: session.randomSeed,
})

export function runnerReducer(state: RunnerState, action: RunnerAction): RunnerState {
  switch (action.type) {
    case 'LOADING':
      return { ...initialRunnerState }
    case 'SESSION_LOADED': {
      const session = action.session
      // 完成态：trialIndex 无关，直接携带 result（由结果页展示）
      if (session.status === 'COMPLETED') {
        return {
          ...state,
          status: 'COMPLETED',
          session,
          taskContext: buildTaskContext(session),
          trialIndex: 0,
          error: null,
          result: session.result ?? null,
        }
      }
      return {
        ...state,
        status: 'READY',
        session,
        taskContext: buildTaskContext(session),
        trialIndex: action.trialIndex,
        error: null,
        result: null,
      }
    }
    case 'SESSION_ERROR':
      return { ...state, status: 'ERROR', session: null, taskContext: null, error: action.error }
    case 'LEGACY_READ_ONLY':
      return {
        ...state,
        status: 'LEGACY_READ_ONLY',
        session: action.session,
        taskContext: buildTaskContext(action.session),
        trialIndex: 0,
        error: null,
        result: null,
      }
    case 'RUNNER_UNSUPPORTED':
      return { ...state, status: 'UNSUPPORTED', error: { code: 'UNSUPPORTED', message: '该测评类型或版本暂不支持' } }
    case 'RECOVERY_REQUIRED':
      return {
        ...state,
        status: 'RECOVERY_REQUIRED',
        error: { code: 'RECOVERY_REQUIRED', message: '检测到未完成的测评，但无法确认进度，请勿重复提交' },
      }
    case 'START_RUN':
      return state.status === 'READY' ? { ...state, status: 'RUNNING' } : state
    case 'TRIAL_SUBMIT_START':
      return state.status === 'RUNNING' ? { ...state, status: 'SUBMITTING_TRIAL' } : state
    case 'TRIAL_SUBMIT_SUCCESS':
      if (state.status !== 'SUBMITTING_TRIAL') return state
      return { ...state, status: 'RUNNING', trialIndex: action.trialIndex + 1, error: null }
    case 'TRIAL_SUBMIT_FAILED':
      if (state.status !== 'SUBMITTING_TRIAL') return state
      return { ...state, status: 'RUNNING', error: action.error } // 可重试
    case 'TRIAL_CONFLICT':
      return {
        ...state,
        status: 'RECOVERY_REQUIRED',
        error: { code: 'RECOVERY_REQUIRED', message: '试次冲突：检测到重复提交，请勿刷新重跑，请联系老师处理' },
      }
    case 'COMPLETE_START':
      return state.status === 'RUNNING' ? { ...state, status: 'COMPLETING' } : state
    case 'COMPLETE_SUCCESS':
      return { ...state, status: 'COMPLETED', result: action.result, error: null }
    case 'FINAL_SUBMIT_CONFLICT':
      return { ...state, status: 'RECOVERY_REQUIRED', error: action.error }
    case 'COMPLETE_FAILED':
      return state.status === 'COMPLETING' ? { ...state, status: 'RUNNING', error: action.error } : state
    default:
      return state
  }
}
