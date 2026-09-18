import { useCallback, useEffect, useReducer, useRef } from 'react'
import { cognitiveApi, type CognitiveSessionApi } from '../api'
import { resolveRunner } from '../registry'
import type { CognitiveResult, CognitiveSession } from '../types'
import {
  readSessionLedger,
  writeSessionLedger,
} from './session-ledger'
import { initialRunnerState, runnerReducer } from './runner.state'
import type { RunnerError, RunnerState } from './runner.types'
import { wrapCognitiveTrial } from './trial-envelope'
import type { AdministrationProvenanceV1, CognitiveAdministrationMode } from './administration-provenance'
import { reconcileDeviceClass } from './administration-provenance'
import {
  COGNITIVE_ADMINISTRATION_PROVENANCE_METADATA_KEY,
  readCognitiveAdministrationProvenance,
} from './useAdministrationProvenance'
import {
  checkpointErrorStatus,
  CheckpointTransportError,
  checkpointScheduler,
} from '../../../services/persistence/checkpointScheduler'
import { checkpointId, type CheckpointBatch } from '../../../services/persistence/checkpointTypes'
import { useCheckpointLifecycle } from '../../../services/persistence/flushLifecycle'
import {
  createFinalDraftMeta,
  finalDraftStore,
} from '../../../services/persistence/finalDraftStore'
import { runFinalDraftCapacityRetry } from '../../../services/persistence/finalDraftCapacityRetry'
import { saveCognitiveRecoveryCredential } from './recovery-credential'

interface CognitiveCheckpointPayload {
  trialIndex: number
  payload: unknown
}

const cognitiveBatchSize = () => {
  const configured = Number(import.meta.env.VITE_COGNITIVE_BATCH_SIZE)
  if (!Number.isFinite(configured)) return 5
  return Math.min(10, Math.max(1, Math.floor(configured)))
}

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
  const anyErr = err as { status?: number; statusCode?: number; code?: number | string; message?: string }
  const msg = anyErr?.message || '请求失败，请稍后重试'
  const code = String(checkpointErrorStatus(err) ?? anyErr?.statusCode ?? anyErr?.status ?? anyErr?.code ?? 'UNKNOWN')
  return { code, message: msg }
}

const finalDraftErrorStatus = (error: unknown) => {
  const value = error as { status?: number; statusCode?: number; code?: number | string }
  const status = checkpointErrorStatus(error) ?? value?.status ?? value?.statusCode
  const code = String(value?.code ?? '')
  return status === 409
    || code === 'STALE_ATTEMPT'
    || code === 'DEFINITION_MISMATCH'
    || code === 'SUBMISSION_PAYLOAD_CONFLICT'
    ? 'CONFLICT' as const
    : 'RETRY_PENDING' as const
}

const responseError = (response: { code: number | string; message?: string }) => {
  const error = new Error(response.message || '认知测评提交失败') as Error & { status?: number; code?: number | string }
  error.code = response.code
  if (typeof response.code === 'number') error.status = response.code
  if (response.code === 'ASSESSMENT_SUBMIT_BUSY' || response.code === 'COMPLETION_BUSY') error.status = 503
  return error
}

const mergeAdministrationMode = (
  left: CognitiveAdministrationMode,
  right: CognitiveAdministrationMode,
): CognitiveAdministrationMode => {
  const touch = left === 'TOUCH' || left === 'MIXED' || right === 'TOUCH' || right === 'MIXED'
  const keyboardMouse = left === 'KEYBOARD_MOUSE' || left === 'MIXED' || right === 'KEYBOARD_MOUSE' || right === 'MIXED'
  if (touch && keyboardMouse) return 'MIXED'
  if (touch) return 'TOUCH'
  if (keyboardMouse) return 'KEYBOARD_MOUSE'
  return 'UNKNOWN'
}

const mergeAdministrationProvenance = (
  stored: AdministrationProvenanceV1 | null,
  current: AdministrationProvenanceV1 | undefined,
): AdministrationProvenanceV1 | undefined => {
  if (!stored) return current
  if (!current) return stored
  return {
    schemaVersion: 1,
    deviceClass: reconcileDeviceClass(stored.deviceClass, current.deviceClass),
    administrationMode: mergeAdministrationMode(stored.administrationMode, current.administrationMode),
  }
}

export interface CognitiveSessionController {
  state: RunnerState
  start: () => void
  appendTrial: (payload: Record<string, unknown>) => Promise<boolean>
  complete: (administrationProvenance?: AdministrationProvenanceV1) => Promise<void>
  restart: () => Promise<CognitiveSession | null>
  reload: () => void
}

export function useCognitiveSession(
  sessionId: string,
  api: CognitiveSessionApi = cognitiveApi,
  options: { aggregateOnly?: boolean } = {},
): CognitiveSessionController {
  const [state, dispatch] = useReducer(runnerReducer, initialRunnerState)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  const handleCheckpointError = useCallback((error: unknown) => {
    if (checkpointErrorStatus(error) === 409) {
      checkpointScheduler.block('cognitive', sessionId, error)
      dispatch({ type: 'TRIAL_CONFLICT' })
    }
  }, [sessionId])

  const cognitiveCheckpointTransport = useCallback(async (batch: CheckpointBatch<CognitiveCheckpointPayload>) => {
    if (api.appendTrials) {
      const response = await api.appendTrials(sessionId, batch.records.map((record) => record.payload))
      if (response.code !== 0) {
        throw new CheckpointTransportError(response.message || '试次提交失败', {
          code: response.code,
          status: typeof response.code === 'number' && response.code >= 400 && response.code <= 599 ? response.code : undefined,
        })
      }
      return { acceptedSequences: batch.records.map((record) => record.sequence) }
    }

    for (const record of batch.records) {
      const response = await api.appendTrial(sessionId, record.payload.trialIndex, record.payload.payload)
      if (response.code !== 0) {
        throw new CheckpointTransportError(response.message || '试次提交失败', {
          code: response.code,
          status: typeof response.code === 'number' && response.code >= 400 && response.code <= 599 ? response.code : undefined,
        })
      }
    }
    return { acceptedSequences: batch.records.map((record) => record.sequence) }
  }, [api, options.aggregateOnly, sessionId])

  const flushCognitiveCheckpoints = useCallback(async () => {
    await checkpointScheduler.flush('cognitive', sessionId)
  }, [sessionId])

  useCheckpointLifecycle(
    flushCognitiveCheckpoints,
    Boolean(sessionId) && state.session?.deliveryMode !== 'FINAL_ONLY',
  )

  const load = useCallback(async () => {
    dispatch({ type: 'LOADING' })
    try {
      const response = await api.getSession(sessionId)
      if (response.code !== 0 || !response.data) {
        dispatch({ type: 'SESSION_ERROR', error: { code: 'NOT_FOUND', message: '测评不存在或不可访问' } })
        return
      }
      const session: CognitiveSession = response.data

      if (session.deliveryMode === 'FINAL_ONLY') {
        const submitFinal = api.submitFinal
        if (!submitFinal || !session.definitionHash) {
          dispatch({ type: 'SESSION_ERROR', error: { code: 'DEFINITION_MISMATCH', message: '该认知测评缺少可恢复的冻结定义，请重启后重试' } })
          return
        }
        const draftKey = `cognitive:${session.sessionId}`
        if (session.status === 'COMPLETED') {
          await finalDraftStore.delete(draftKey).catch(() => undefined)
          dispatch({ type: 'SESSION_LOADED', session, trialIndex: 0 })
          return
        }
        try {
          const meta = await finalDraftStore.ensure(createFinalDraftMeta({
            draftKey,
            instrument: 'cognitive',
            attemptId: session.sessionId,
            attemptEpoch: session.attemptEpoch ?? session.attemptNo,
            definitionHash: session.definitionHash,
            contextSnapshotHash: session.contextSnapshotHash ?? null,
            deliveryMode: 'final_only',
            submissionId: checkpointId(),
          }))
          if (meta.status === 'CONFLICT') {
            dispatch({ type: 'RECOVERY_REQUIRED' })
            return
          }
          if (session.status !== 'IN_PROGRESS') {
            dispatch({ type: 'SESSION_ERROR', error: { code: session.status, message: '该测评已失效' } })
            return
          }
          if (meta.sealedSubmission) {
            try {
              await runFinalDraftCapacityRetry({
                onRetry: async ({ error }) => {
                  await finalDraftStore.setStatus(draftKey, 'RETRY_PENDING', {
                    code: String((error as { code?: unknown })?.code || 'ASSESSMENT_SUBMIT_BUSY'),
                    message: friendlyError(error).message,
                  }).catch(() => undefined)
                },
                operation: async () => {
                  const next = await submitFinal(
                    session.sessionId,
                    meta.sealedSubmission!.payload as Parameters<typeof submitFinal>[1],
                  )
                  if (next.code !== 0 || !next.data) throw responseError(next)
                  return next
                },
              })
              const terminal = await api.getSession(sessionId)
              if (terminal.code === 0 && terminal.data?.status === 'COMPLETED') {
                await finalDraftStore.setStatus(draftKey, 'COMPLETED').catch(() => undefined)
                await finalDraftStore.delete(draftKey).catch(() => undefined)
                dispatch({ type: 'SESSION_LOADED', session: terminal.data, trialIndex: 0 })
                return
              }
              dispatch({
                type: 'SESSION_ERROR',
                error: { code: 'FINAL_SUBMISSION_PENDING', message: '提交已发送但服务器终态暂未确认，请稍后重试核对。' },
              })
              return
            } catch (error) {
              const status = finalDraftErrorStatus(error)
              await finalDraftStore.setStatus(draftKey, status, {
                code: String((error as { code?: unknown })?.code ?? ''),
                message: friendlyError(error).message,
              }).catch(() => undefined)
              if (status === 'CONFLICT') {
                dispatch({ type: 'RECOVERY_REQUIRED' })
              } else {
                dispatch({
                  type: 'SESSION_ERROR',
                  error: { code: 'FINAL_SUBMISSION_PENDING', message: '已封存提交仍未确认，请稍后重试核对。' },
                })
              }
              return
            }
          }
          if (meta.status !== 'DRAFT') {
            dispatch({
              type: 'SESSION_ERROR',
              error: {
                code: 'FINAL_DRAFT_PENDING_WITHOUT_SEAL',
                message: '检测到旧版未确认提交；请先核对服务器终态，不能重新生成试次提交。',
              },
            })
            return
          }
          const trials = await finalDraftStore.listTrials(draftKey)
          const nextTrialIndex = trials.reduce((max, trial) => Math.max(max, trial.trialIndex + 1), 0)
          dispatch({ type: 'SESSION_LOADED', session, trialIndex: nextTrialIndex })
        } catch (error) {
          dispatch({ type: 'SESSION_ERROR', error: friendlyError(error) })
        }
        return
      }

      if (session.deliveryMode === 'LEGACY') {
        dispatch({ type: 'LEGACY_READ_ONLY', session })
        return
      }

      checkpointScheduler.register('cognitive', sessionId, cognitiveCheckpointTransport, {
        maxBatchSize: cognitiveBatchSize(),
        maxWaitMs: 2000,
        onError: handleCheckpointError,
      })

      if (session.status === 'COMPLETED') {
        dispatch({ type: 'SESSION_LOADED', session, trialIndex: 0 })
        return
      }
      if (session.status !== 'IN_PROGRESS') {
        dispatch({ type: 'SESSION_ERROR', error: { code: session.status, message: '该测评已失效' } })
        return
      }
      if (!resolveRunner(session.testType, session.engineVersion)) {
        dispatch({ type: 'RUNNER_UNSUPPORTED' })
        return
      }
      const ledger = readSessionLedger(sessionId)
      const pending = await checkpointScheduler.pending('cognitive', sessionId)
      const pendingNextTrialIndex = pending.reduce((nextIndex, record) => {
        const payload = record.payload as CognitiveCheckpointPayload
        return Math.max(nextIndex, payload.trialIndex + 1)
      }, 0)
      if (!ledger && session.nextTrialIndex === undefined && pendingNextTrialIndex === 0) {
        dispatch({ type: 'RECOVERY_REQUIRED' })
        return
      }
      const trialIndex = Math.max(
        ledger ? ledger.trialIndex + 1 : 0,
        session.nextTrialIndex ?? 0,
        pendingNextTrialIndex,
      )
      writeSessionLedger(sessionId, { status: session.status, trialIndex: trialIndex - 1 })
      dispatch({ type: 'SESSION_LOADED', session, trialIndex })
      void checkpointScheduler.flush('cognitive', sessionId).catch((err) => {
        dispatch({ type: 'TRIAL_SUBMIT_FAILED', error: friendlyError(err) })
      })
    } catch (err) {
      dispatch({ type: 'SESSION_ERROR', error: friendlyError(err) })
    }
  }, [api, cognitiveCheckpointTransport, handleCheckpointError, sessionId])

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
        if (session?.deliveryMode === 'FINAL_ONLY') {
          const draftKey = `cognitive:${session.sessionId}`
          await finalDraftStore.putTrial({
            draftKey,
            trialIndex: nextIndex,
            payload: submittedPayload,
            createdAt: Date.now(),
          })
          dispatch({ type: 'TRIAL_SUBMIT_SUCCESS', trialIndex: nextIndex })
          return true
        }
        await checkpointScheduler.enqueue({
          scopeType: 'cognitive',
          scopeId: sessionId,
          payload: { trialIndex: nextIndex, payload: submittedPayload },
        }, cognitiveCheckpointTransport, {
          maxBatchSize: cognitiveBatchSize(),
          maxWaitMs: 2000,
          onError: handleCheckpointError,
        })
        writeSessionLedger(sessionId, { status: 'IN_PROGRESS', trialIndex: nextIndex })
        dispatch({ type: 'TRIAL_SUBMIT_SUCCESS', trialIndex: nextIndex })
        return true
      } catch (err) {
        if (checkpointErrorStatus(err) === 409) {
          checkpointScheduler.block('cognitive', sessionId, err)
          dispatch({ type: 'TRIAL_CONFLICT' })
          return false
        }
        dispatch({ type: 'TRIAL_SUBMIT_FAILED', error: friendlyError(err) })
        return false
      }
    },
    [cognitiveCheckpointTransport, handleCheckpointError, sessionId]
  )

  const complete = useCallback(async (administrationProvenance?: AdministrationProvenanceV1) => {
    dispatch({ type: 'COMPLETE_START' })
    let finalDraftKey: string | null = null
    try {
      const session = stateRef.current.session
      if (session?.deliveryMode === 'FINAL_ONLY') {
        const submitFinal = api.submitFinal
        if (!submitFinal || !session.definitionHash) throw new Error('该认知测评无法提交：缺少冻结定义')
        const draftKey = `cognitive:${session.sessionId}`
        finalDraftKey = draftKey
        const currentMeta = await finalDraftStore.get(draftKey)
        if (!currentMeta) throw new Error('本地认知草稿不存在，请重启测评')
        let sealProvenance = readCognitiveAdministrationProvenance(currentMeta.instrumentMetadata) ?? undefined
        if (!currentMeta.sealedSubmission) {
          sealProvenance = mergeAdministrationProvenance(sealProvenance ?? null, administrationProvenance)
          if (sealProvenance) {
            await finalDraftStore.setInstrumentMetadata(draftKey, {
              [COGNITIVE_ADMINISTRATION_PROVENANCE_METADATA_KEY]: sealProvenance,
            }).catch(() => null)
          }
        }
        const sealed = await finalDraftStore.sealForSubmission(draftKey, (snapshot) => {
          if (snapshot.trials.length === 0) throw new Error('尚未记录任何认知试次')
          const finalProvenance = readCognitiveAdministrationProvenance(snapshot.meta.instrumentMetadata)
            ?? sealProvenance
          return {
            submissionId: snapshot.meta.submissionId,
            attemptEpoch: snapshot.meta.attemptEpoch,
            definitionHash: snapshot.meta.definitionHash,
            contextSnapshotHash: snapshot.meta.contextSnapshotHash,
            trials: snapshot.trials.map((trial) => trial.payload),
            ...(finalProvenance ? { administrationProvenance: finalProvenance } : {}),
          }
        })
        if (!sealed) throw new Error('本地认知草稿不存在，请重启测评')
        const response = await runFinalDraftCapacityRetry({
          onRetry: async ({ error }) => {
            await finalDraftStore.setStatus(draftKey, 'RETRY_PENDING', {
              code: String((error as { code?: unknown })?.code || 'ASSESSMENT_SUBMIT_BUSY'),
              message: friendlyError(error).message,
            }).catch(() => undefined)
          },
          operation: async () => {
            const next = await submitFinal(session.sessionId, sealed.payload)
            if (next.code !== 0 || !next.data) throw responseError(next)
            return next
          },
        })
        if (options.aggregateOnly && (response.data as any).completed === true) {
          await finalDraftStore.setStatus(draftKey, 'COMPLETED')
          await finalDraftStore.delete(draftKey)
          dispatch({
            type: 'SESSION_LOADED',
            session: { ...session, status: 'COMPLETED' },
            trialIndex: 0,
          })
          return
        }
        const resultData = (response.data as any).response ?? (response.data as any)
        const result: CognitiveResult | null = resultData.result
          ?? (((resultData as any).metrics !== undefined || (resultData as any).quality !== undefined)
            ? {
                score: (resultData as any).score,
                metrics: (resultData as any).metrics ?? {},
                qualityFlags: (resultData as any).qualityFlags ?? {},
                quality: (resultData as any).quality,
                references: (resultData as any).references,
                report: (resultData as any).report,
                assessmentContext: (resultData as any).assessmentContext,
              }
            : null)
        if (!result) throw new Error('服务器未返回认知测评结果')
        await finalDraftStore.setStatus(draftKey, 'COMPLETED')
        await finalDraftStore.delete(draftKey)
        dispatch({ type: 'COMPLETE_SUCCESS', result })
        return
      }
      await checkpointScheduler.flush('cognitive', sessionId)
      const pending = await checkpointScheduler.pending('cognitive', sessionId)
      if (pending.length > 0) throw new Error('试次仍在同步，请稍后重试')
      await checkpointScheduler.purgeExpired('cognitive', sessionId)
      const response = await api.completeSession(sessionId)
      if (response.code !== 0 || !response.data) {
        dispatch({ type: 'COMPLETE_FAILED', error: friendlyError(response) })
        return
      }
      const d = response.data as CognitiveSession & Partial<CognitiveResult>
      const result: CognitiveResult | null =
        d.result ??
        ((typeof d.score === 'number' || d.metrics !== undefined || d.quality !== undefined)
          ? { score: d.score, metrics: d.metrics ?? {}, qualityFlags: d.qualityFlags ?? {}, quality: d.quality, references: d.references, report: d.report, assessmentContext: d.assessmentContext, reference: d.reference }
          : null)
      writeSessionLedger(sessionId, { status: 'COMPLETED', trialIndex: -1 })
      dispatch(result ? { type: 'COMPLETE_SUCCESS', result } : { type: 'COMPLETE_FAILED', error: { code: 'NO_RESULT', message: '服务器未返回结果' } })
    } catch (err) {
      if (finalDraftKey) {
        const currentMeta = await finalDraftStore.get(finalDraftKey).catch(() => null)
        if (currentMeta?.sealedSubmission) {
          const terminal = await api.getSession(sessionId).catch(() => null)
          if (terminal?.code === 0 && terminal.data?.status === 'COMPLETED') {
            await finalDraftStore.setStatus(finalDraftKey, 'COMPLETED').catch(() => undefined)
            await finalDraftStore.delete(finalDraftKey).catch(() => undefined)
            dispatch({ type: 'SESSION_LOADED', session: terminal.data, trialIndex: 0 })
            return
          }
          const draftStatus = finalDraftErrorStatus(err)
          await finalDraftStore.setStatus(finalDraftKey, draftStatus, {
            code: String((err as { code?: number | string })?.code ?? ''),
            message: friendlyError(err).message,
          }).catch(() => undefined)
          if (draftStatus === 'CONFLICT') {
            dispatch({ type: 'FINAL_SUBMIT_CONFLICT', error: friendlyError(err) })
          } else {
            dispatch({
              type: 'SESSION_ERROR',
              error: { code: 'FINAL_SUBMISSION_PENDING', message: '提交已封存但服务器终态暂未确认，请稍后重试核对。' },
            })
          }
          return
        }
      }
      // Builder/local validation failed before the logical FINAL was sealed.
      // The DRAFT remains writable, so returning to RUNNING is safe here.
      dispatch({ type: 'COMPLETE_FAILED', error: friendlyError(err) })
    }
  }, [api, options.aggregateOnly, sessionId])

  const reload = useCallback(() => {
    void load()
  }, [load])

  const restart = useCallback(async (): Promise<CognitiveSession | null> => {
    if (!api.restartSession) throw new Error('该认知测评不支持重启')
    const response = await api.restartSession(sessionId)
    if (response.code !== 0 || !response.data) throw new Error(response.message || '重启认知测评失败')
    const payload = response.data as CognitiveSession | { session: CognitiveSession; recoveryToken: string | null }
    const nextSession = 'session' in payload ? payload.session : payload
    if (!nextSession?.sessionId) throw new Error('重启响应缺少新测评记录')
    if ('recoveryToken' in payload && payload.recoveryToken) {
      saveCognitiveRecoveryCredential(nextSession.sessionId, payload.recoveryToken)
    }
    return nextSession
  }, [api, sessionId])

  const stateRef = useRef(state)
  stateRef.current = state

  return { state, start, appendTrial, complete, restart, reload }
}