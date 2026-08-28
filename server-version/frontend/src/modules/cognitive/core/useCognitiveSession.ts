import { useCallback, useEffect, useReducer, useRef } from 'react'
import { cognitiveApi, type CognitiveSessionApi } from '../api'
import { resolveRunner } from '../registry'
import type { CognitiveResult, CognitiveSession } from '../types'
import {
  readSessionLedger,
  writeSessionLedger,
} from './session-ledger'
import { initialRunnerState, runnerReducer, type RunnerAction } from './runner.state'
import type { RunnerError, RunnerState } from './runner.types'
import { wrapCognitiveTrial } from './trial-envelope'

/**
 * Runner 核心 hook（Stage B v1.1 §20/§21）。
 *
 * 挂载即 LOADING → GET /cognitive/sessions/:id：
 *  - COMPLETED → SESSION_LOADED（携带 stored result，结果页只读展示，**不重新评分**，v1.1 §21.3）
 *  - IN_PROGRESS → 读本地账本：有账本 → 续跑（trialIndex = 账本+1，进度已证明）；
 *                  无账本且服务端没有安全断点 → RECOVERY_REQUIRED（禁止默认为 0 / 猜测 / 重提旧 trial，v1.1 §21.2）
 *  - ABANDONED/INVALID/404 → SESSION_ERROR（友好文案）
 *  - testType+engineVersion 无法解析 → RUNNER_UNSUPPORTED（无 latest fallback，v1.1 §16）
 *
 * 客户端不持久化权威 score；只有服务器返回的 result 被保存展示。
 */

const friendlyError = (err: unknown): RunnerError => {
  const anyErr = err as { statusCode?: number; code?: number; message?: string }
  const msg = anyErr?.message || '请求失败，请稍后重试'
  const code = String(anyErr?.statusCode ?? anyErr?.code ?? 'UNKNOWN')
  return { code, message: msg }
}

export interface CognitiveSessionController {
  state: RunnerState
  start: () => void
  appendTrial: (payload: Record<string, unknown>) => Promise<boolean>
  complete: () => Promise<void>
  reload: () => void
}

export function useCognitiveSession(sessionId: string, api: CognitiveSessionApi = cognitiveApi): CognitiveSessionController {
  const [state, dispatch] = useReducer(runnerReducer, initialRunnerState)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  const load = useCallback(async () => {
    dispatch({ type: 'LOADING' })
    try {
      const response = await api.getSession(sessionId)
      if (response.code !== 0 || !response.data) {
        dispatch({ type: 'SESSION_ERROR', error: { code: 'NOT_FOUND', message: '测评不存在或不可访问' } })
        return
      }
      const session: CognitiveSession = response.data

      if (session.status === 'COMPLETED') {
        dispatch({ type: 'SESSION_LOADED', session, trialIndex: 0 })
        return
      }
      if (session.status !== 'IN_PROGRESS') {
        dispatch({ type: 'SESSION_ERROR', error: { code: session.status, message: '该测评已失效' } })
        return
      }
      // IN_PROGRESS：先检查前端能否解析 Runner（无 fallback）
      if (!resolveRunner(session.testType, session.engineVersion)) {
        dispatch({ type: 'RUNNER_UNSUPPORTED' })
        return
      }
      // 优先使用本地账本；匿名恢复跨设备时，服务端提供的 nextTrialIndex 是已保存试次计数，
      // 不需要猜测或重复提交旧试次。
      const ledger = readSessionLedger(sessionId)
      if (!ledger && session.nextTrialIndex === undefined) {
        dispatch({ type: 'RECOVERY_REQUIRED' })
        return
      }
      const trialIndex = ledger ? ledger.trialIndex + 1 : session.nextTrialIndex!
      writeSessionLedger(sessionId, { status: session.status, trialIndex: trialIndex - 1 })
      dispatch({ type: 'SESSION_LOADED', session, trialIndex })
    } catch (err) {
      dispatch({ type: 'SESSION_ERROR', error: friendlyError(err) })
    }
  }, [api, sessionId])

  useEffect(() => {
    void load()
  }, [load])

  const start = useCallback(() => {
    dispatch({ type: 'START_RUN' })
  }, [])

  const appendTrial = useCallback(
    async (payload: Record<string, unknown>): Promise<boolean> => {
      const nextIndex = stateRef.current.trialIndex
      dispatch({ type: 'TRIAL_SUBMIT_START' })
      try {
        const session = stateRef.current.session
        const submittedPayload = session?.protocolSignature
          ? wrapCognitiveTrial({ trialIndex: nextIndex, payload })
          : payload
        const response = await api.appendTrial(sessionId, nextIndex, submittedPayload)
        if (response.code !== 0) {
          dispatch({ type: 'TRIAL_SUBMIT_FAILED', error: friendlyError(response) })
          return false
        }
        // 只有 append 成功后才写账本（可证明进度）
        writeSessionLedger(sessionId, { status: 'IN_PROGRESS', trialIndex: nextIndex })
        dispatch({ type: 'TRIAL_SUBMIT_SUCCESS', trialIndex: nextIndex })
        return true
      } catch (err) {
        // 409 = 同 index 异 hash 冲突 → 禁止重跑，进入安全态
        const status = (err as { statusCode?: number }).statusCode
        if (status === 409) {
          dispatch({ type: 'TRIAL_CONFLICT' })
          return false
        }
        dispatch({ type: 'TRIAL_SUBMIT_FAILED', error: friendlyError(err) })
        return false
      }
    },
    [api, sessionId]
  )

  const complete = useCallback(async () => {
    dispatch({ type: 'COMPLETE_START' })
    try {
      const response = await api.completeSession(sessionId)
      if (response.code !== 0 || !response.data) {
        dispatch({ type: 'COMPLETE_FAILED', error: friendlyError(response) })
        return
      }
      // complete 返回扁平 {score, metrics, qualityFlags}（completion.service）；
      // GET session 返回 {result:{...}}（session.service COMPLETED 分支）。两种都兼容。
      const d = response.data as CognitiveSession & Partial<CognitiveResult>
      const result: CognitiveResult | null =
        d.result ??
        ((typeof d.score === 'number' || d.metrics !== undefined || d.quality !== undefined)
          ? { score: d.score, metrics: d.metrics ?? {}, qualityFlags: d.qualityFlags ?? {}, quality: d.quality, references: d.references, report: d.report, assessmentContext: d.assessmentContext, reference: d.reference }
          : null)
      writeSessionLedger(sessionId, { status: 'COMPLETED', trialIndex: -1 })
      dispatch(result ? { type: 'COMPLETE_SUCCESS', result } : { type: 'COMPLETE_FAILED', error: { code: 'NO_RESULT', message: '服务器未返回结果' } })
    } catch (err) {
      dispatch({ type: 'COMPLETE_FAILED', error: friendlyError(err) })
    }
  }, [api, sessionId])

  const reload = useCallback(() => {
    void load()
  }, [load])

  // 让 appendTrial 读取最新的 trialIndex（避免闭包陈旧）
  const stateRef = useRef(state)
  stateRef.current = state

  return { state, start, appendTrial, complete, reload }
}
