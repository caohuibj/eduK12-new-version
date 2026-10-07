import { usePageSignal } from '../../hooks/usePageSignal'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Save,
  Play,
  LockKeyhole,
} from 'lucide-react'
import { compositeApi, publicCompositeApi } from './api'
import type {
  CompositeAttemptState,
  CompositeCurrentItem,
  CompositePublicInfo,
} from './types'
import { resolveCompositeChildRouteContext } from './child-route-context'
import { saveCognitiveRecoveryCredential } from '../cognitive/core/recovery-credential'
import {
  ProductButton,
  ProductPage,
  ProductStatus,
} from '../../components/product-ui'
import FinalCompositeAssessment from '../../components/FinalCompositeAssessment'

const tokenKey = (token: string) => `composite:recovery:token:${token}`
const attemptKey = (attemptId: string) =>
  `composite:recovery:attempt:${attemptId}`

const readStored = (key: string) =>
  typeof window === 'undefined' ? '' : window.sessionStorage.getItem(key) || ''
const store = (key: string, value: string) => {
  if (typeof window !== 'undefined' && value)
    window.sessionStorage.setItem(key, value)
}

const CompositeAssessmentContent: React.FC = () => {
  const pageSignal = usePageSignal()
  const params = useParams<{
    assessmentId?: string
    token?: string
    attemptId?: string
  }>()
  const navigate = useNavigate()
  const publicMode = window.location.pathname.startsWith('/public/composite')
  const relationalMode = window.location.pathname.startsWith('/relational/')
  const organizationTask =
    relationalMode &&
    ['/organization-tasks', '/my-assessments'].includes(
      new URLSearchParams(window.location.search).get('returnTo') ?? '',
    )
  const token = params.token || ''
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingReportId, setExistingReportId] = useState<string | null>(null)
  const [state, setState] = useState<CompositeAttemptState | null>(null)
  const [publicInfo, setPublicInfo] = useState<CompositePublicInfo | null>(null)
  const [recoveryToken, setRecoveryToken] = useState('')
  const [recoveryInput, setRecoveryInput] = useState('')
  const [newRecoveryToken, setNewRecoveryToken] = useState<string | null>(null)
  const [scaleAnswers, setScaleAnswers] = useState<
    Record<string, string | number>
  >({})
  const [scaleIndex, setScaleIndex] = useState(0)
  const [formValue, setFormValue] = useState('')
  const scaleItemStartTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    scaleItemStartTimeRef.current = Date.now()
  }, [state?.currentItem?.id, scaleIndex])

  const attemptId = params.attemptId || state?.id || ''
  const api = useMemo(
    () => (publicMode ? publicCompositeApi(recoveryToken) : compositeApi),
    [publicMode, recoveryToken],
  )

  const freezeBeforeMeasurement = async (
    next: CompositeAttemptState,
    credential = recoveryToken,
  ): Promise<CompositeAttemptState> => {
    // Final-only attempts freeze context only when their first context section
    // is submitted. Loading or starting one must not resurrect the legacy
    // "freeze before the first measurement" write.
    if (
      next.deliveryMode === 'FINAL_ONLY' ||
      next.status === 'COMPLETED' ||
      !next.currentItem ||
      next.currentItem.type === 'FORM' ||
      next.currentItem.type === 'FORM_SECTION' ||
      next.context?.status === 'frozen'
    )
      return next
    const client = publicMode ? publicCompositeApi(credential) : compositeApi
    const frozen = await client.freezeContext(next.id)
    if (frozen.code !== 0 || !frozen.data)
      throw new Error(frozen.message || '人口学上下文冻结失败')
    return {
      ...next,
      context: { status: 'frozen', frozenAt: frozen.data.frozenAt },
    }
  }

  const goReport = (id: string) => {
    if (pageSignal().aborted) return
    if (relationalMode) {
      navigate(organizationTask ? '/my-assessments' : '/relational/tasks')
      return
    }
    navigate(
      publicMode
        ? `/public/composite/attempts/${id}/report`
        : `/student/composite/attempts/${id}/report`,
    )
  }

  const applyState = (next: CompositeAttemptState) => {
    if (pageSignal().aborted) return
    setState(next)
    if (next.status === 'COMPLETED') {
      goReport(next.id)
      return
    }
    const item = next.currentItem
    if (item?.type === 'SCALE') {
      const nextAnswers: Record<string, string | number> = {}
      ;(item.answers || []).forEach((answer) => {
        if (answer.itemCode && answer.responseValue !== undefined)
          nextAnswers[answer.itemCode] = answer.responseValue
      })
      setScaleAnswers(nextAnswers)
      setScaleIndex(0)
    } else if (item?.type === 'FORM') {
      setFormValue(item.form?.value || '')
    }
  }

  const loadAttempt = async (id: string, credential = recoveryToken) => {
    const signal = pageSignal()
    if (signal.aborted) return
    if (publicMode && !credential) {
      setLoading(false)
      setError('请输入保存时获得的恢复凭证，才能继续这次匿名测评')
      return
    }
    try {
      const response = await (publicMode
        ? publicCompositeApi(credential).getAttempt(id)
        : compositeApi.getAttempt(id))
      if (signal.aborted) return
      if (response.code !== 0 || !response.data)
        throw new Error(response.message || '综合测评记录不存在')
      if (publicMode) store(attemptKey(id), credential)
      applyState(await freezeBeforeMeasurement(response.data, credential))
    } catch (err) {
      setError((err as { message?: string }).message || '加载综合测评失败')
    } finally {
      setLoading(false)
    }
  }

  const start = async (resumeToken?: string) => {
    const signal = pageSignal()
    if (signal.aborted) return
    try {
      setSubmitting(true)
      setError(null)
      setExistingReportId(null)
      if (publicMode) {
        const credential =
          resumeToken ||
          recoveryInput.trim() ||
          (token ? readStored(tokenKey(token)) : '')
        const response = await publicCompositeApi(credential).start(
          token,
          credential || undefined,
        )
        if (signal.aborted) return
        if (response.code !== 0 || !response.data)
          throw new Error(response.message || '无法开始匿名综合测评')
        const returnedCredential = response.data.recoveryToken || credential
        if (returnedCredential) {
          setRecoveryToken(returnedCredential)
          store(tokenKey(token), returnedCredential)
          store(attemptKey(response.data.attempt.id), returnedCredential)
        }
        if (response.data.attempt.status === 'COMPLETED')
          goReport(response.data.attempt.id)
        else
          applyState(
            await freezeBeforeMeasurement(
              response.data.attempt,
              returnedCredential,
            ),
          )
        if (response.data.recoveryToken)
          setNewRecoveryToken(response.data.recoveryToken)
      } else {
        const response = await compositeApi.start(params.assessmentId || '')
        if (signal.aborted) return
        if (response.code !== 0 || !response.data)
          throw new Error(response.message || '无法开始综合测评')
        if (response.data.attempt.status === 'COMPLETED')
          goReport(response.data.attempt.id)
        else applyState(await freezeBeforeMeasurement(response.data.attempt))
      }
    } catch (err) {
      if (signal.aborted) return
      const message =
        (err as { message?: string }).message || '无法开始综合测评'
      setError(message)
      if (!publicMode && !relationalMode && message.includes('最大次数')) {
        try {
          const available = await compositeApi.listAvailable()
          const assessment =
            available.code === 0
              ? available.data?.list.find(
                  (item) => item.id === params.assessmentId,
                )
              : undefined
          const completed = assessment?.latestCompletedAttempt as
            | { id?: string }
            | undefined
          if (!signal.aborted && typeof completed?.id === 'string')
            setExistingReportId(completed.id)
        } catch {
          /* The course list remains available if report discovery fails. */
        }
      }
    } finally {
      setSubmitting(false)
      setLoading(false)
    }
  }

  const restartLegacyAttempt = async () => {
    const signal = pageSignal()
    if (!state || signal.aborted) return
    if (relationalMode) {
      setError(
        '关系测评旧版记录不能从通用重启入口迁移，请返回任务列表重新发起。',
      )
      return
    }
    try {
      setSubmitting(true)
      setError(null)
      const response = publicMode
        ? await publicCompositeApi(recoveryToken).restart(state.id)
        : await compositeApi.restart(state.id)
      if (signal.aborted) return
      if (response.code !== 0 || !response.data)
        throw new Error(response.message || '重启综合测评失败')
      const nextId = response.data.attempt.id
      if (publicMode) {
        const nextCredential = response.data.recoveryToken || recoveryToken
        if (nextCredential) {
          setRecoveryToken(nextCredential)
          store(tokenKey(token), nextCredential)
          store(attemptKey(nextId), nextCredential)
        }
        navigate(`/public/composite/attempts/${nextId}`)
      } else {
        navigate(`/student/composite/attempts/${nextId}`)
      }
    } catch (err) {
      setError((err as { message?: string }).message || '重启综合测评失败')
      setSubmitting(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setState(null)
    setPublicInfo(null)
    setError(null)
    setExistingReportId(null)
    setRecoveryToken('')
    setRecoveryInput('')
    setNewRecoveryToken(null)
    const initialise = async () => {
      if (publicMode) {
        if (token) {
          try {
            const infoResponse = await publicCompositeApi('').info(token)
            if (infoResponse.code !== 0 || !infoResponse.data) throw new Error(infoResponse.message || '公开链接不可用')
            if (!cancelled) setPublicInfo(infoResponse.data)
          } catch (err) {
            if (!cancelled)
              setError(
                (err as { message?: string }).message || '公开链接不可用',
              )
          }
        }
        if (cancelled) return
        const id = params.attemptId
        const saved = id
          ? readStored(attemptKey(id))
          : token
            ? readStored(tokenKey(token))
            : ''
        if (saved) {
          setRecoveryToken(saved)
          if (id) await loadAttempt(id, saved)
          else await start(saved)
        } else if (!id) {
          // Merely opening a public link must not consume a participation slot.
          // The explicit button below is the only path for a new anonymous attempt.
          setLoading(false)
        } else {
          setLoading(false)
          setError('请输入恢复凭证后继续匿名测评')
        }
      } else if (params.attemptId) {
        await loadAttempt(params.attemptId)
      } else {
        await start()
      }
    }
    void initialise()
    return () => {
      cancelled = true
    }
  }, [publicMode, token, params.attemptId, params.assessmentId])

  const saveAndExit = async () => {
    const signal = pageSignal()
    if (!attemptId || signal.aborted) return
    if (state?.deliveryMode === 'FINAL_ONLY') {
      const studyReturn = sessionStorage.getItem(
        `composite:study:return:${attemptId}`,
      )
      navigate(
        publicMode
          ? studyReturn &&
            /^\/public\/studies\/[0-9a-f-]{36}$/.test(studyReturn)
            ? studyReturn
            : '/'
          : relationalMode
            ? organizationTask
              ? '/my-assessments'
              : '/relational/tasks'
            : '/student',
      )
      return
    }
    try {
      const draft =
        state?.currentItem?.type === 'FORM'
          ? { itemId: state.currentItem.id, value: formValue }
          : undefined
      await api.save(attemptId, draft)
      if (signal.aborted) return
      navigate(publicMode ? '/' : '/student')
    } catch (err) {
      setError((err as { message?: string }).message || '保存失败，请稍后重试')
    }
  }

  const submitScaleAnswer = async (value: string | number) => {
    if (!state?.currentItem || state.currentItem.type !== 'SCALE') return
    const items = state.currentItem.scale?.definition?.items || []
    const current = items[scaleIndex]
    if (!current) return
    setScaleAnswers((previous) => ({ ...previous, [current.itemCode]: value }))
    try {
      const response = await api.scaleAnswer(state.id, state.currentItem.id, {
        itemCode: current.itemCode,
        responseValue: value,
        responseTimeMs: Math.max(0, Date.now() - scaleItemStartTimeRef.current),
      })
      if (response.code !== 0)
        throw new Error(response.message || '答案保存失败')
      if (scaleIndex < items.length - 1) setScaleIndex((index) => index + 1)
    } catch (err) {
      setError((err as { message?: string }).message || '答案保存失败')
    }
  }

  const completeScale = async () => {
    if (!state?.currentItem) return
    try {
      setSubmitting(true)
      const response = await api.completeScale(state.id, state.currentItem.id)
      if (response.code !== 0)
        throw new Error(response.message || '量表提交失败')
      await loadAttempt(state.id)
    } catch (err) {
      setError((err as { message?: string }).message || '量表提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const submitForm = async () => {
    if (!state?.currentItem) return
    try {
      setSubmitting(true)
      const response = await api.formAnswer(
        state.id,
        state.currentItem.id,
        formValue,
      )
      if (response.code !== 0)
        throw new Error(response.message || '表单提交失败')
      // The write endpoint returns an ACK. Reload once at the module boundary
      // so navigation uses authoritative parent and child state.
      await loadAttempt(state.id)
    } catch (err) {
      setError((err as { message?: string }).message || '表单提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const enterChild = (item: CompositeCurrentItem) => {
    const result = resolveCompositeChildRouteContext({
      publicMode,
      relationalMode,
      organizationTask,
      parentAttemptId: state?.id || '',
      item,
    })
    if (!result.ok) {
      setError(result.message)
      return
    }
    setError(null)
    if (result.context.kind === 'COGNITIVE' && publicMode && recoveryToken) {
      saveCognitiveRecoveryCredential(
        result.context.childAttemptId,
        recoveryToken,
      )
    }
    navigate(result.context.target)
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>

  if (publicMode && !state) {
    return (
      <div className="max-w-xl mx-auto card p-8">
        <LockKeyhole className="w-10 h-10 text-action mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">{publicInfo?.name || '公开综合测评'}</h1>
        <p className="text-gray-600 whitespace-pre-wrap mb-6">{publicInfo?.instruction || publicInfo?.description || '完成后可分别查看量表反馈和认知任务结果。'}</p>
        <label className="block text-sm text-gray-600 mb-2">已有恢复凭证？</label>
        <input value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value)} className="w-full border rounded px-3 py-2 mb-4" placeholder="粘贴保存时获得的恢复凭证（可选）" />
        {error && <p role="alert" className="text-red-500 text-sm mb-4">{error}</p>}
        {!params.attemptId && !publicInfo && <p className="mb-4 text-sm">当前入口不能开始新作答。已有恢复凭证可继续尝试恢复原记录。</p>}
        {publicInfo?.studyEntryPath && <Link className="block mb-4 text-action" to={publicInfo.studyEntryPath}>选择单次访客或保存研究内身份码</Link>}
        <button
          onClick={() => {
            const credential = recoveryInput.trim()
            if (params.attemptId && credential) {
              setRecoveryToken(credential)
              setError(null)
              setLoading(true)
              void loadAttempt(params.attemptId, credential)
            } else {
              void start()
            }
          }}
          disabled={submitting || (!recoveryInput.trim() && (Boolean(params.attemptId) || !publicInfo))}
          className="btn-primary w-full"
        >
          <Play className="w-4 h-4 inline mr-1" />{params.attemptId ? '继续作答' : recoveryInput ? '继续作答' : '开始匿名测评'}
        </button>
        {!params.attemptId && !publicInfo && <ProductButton className="mt-3" onClick={() => window.location.reload()}>重新读取入口</ProductButton>}
      </div>
    )
  }

  if (!state) return <ProductPage width="reading"><ProductStatus
    kind="warning"
    title={error?.includes('最大次数') ? '本次测评的参与次数已用尽' : '暂时无法进入测评'}
    actions={<><Link className="hui-button hui-button--secondary" to={relationalMode ? (organizationTask ? '/my-assessments' : '/relational/tasks') : '/student'}>返回任务列表</Link>
      {existingReportId && <ProductButton variant="primary" onClick={() => goReport(existingReportId)}>查看已有结果</ProductButton>}
      {!error?.includes('最大次数') && <ProductButton onClick={() => params.attemptId ? void loadAttempt(params.attemptId) : void start()}>重新加载</ProductButton>}
    </>}
  >{error || '综合测评不存在或不可访问'}{error?.includes('最大次数') && !existingReportId && <p>已有结果可从课程详情中查看。</p>}</ProductStatus></ProductPage>

  if (state.status === 'COMPLETED') {
    return <div className="card p-8 max-w-xl mx-auto text-center"><CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" /><h1 className="text-2xl font-bold mb-3">{state.productKind === 'QUESTIONNAIRE' ? '问卷已完成' : '综合测评已完成'}</h1><button onClick={() => goReport(state.id)} className="btn-primary">{relationalMode ? '返回关系测评' : '查看个人报告'}</button></div>
  }

  if (state.deliveryMode === 'LEGACY') {
    return (
      <div className="max-w-xl mx-auto rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <h1 className="text-xl font-semibold text-amber-900 mb-2">这是旧版进行中的综合测评</h1>
        <p className="text-sm text-amber-800 mb-5">旧版内容仍可读取，但不能继续写入。重启会保留历史记录，并创建新的整单元提交测评。</p>
        {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
        <button onClick={() => void restartLegacyAttempt()} disabled={submitting} className="btn-primary">{submitting ? '重启中...' : '重启并继续作答'}</button>
      </div>
    )
  }

  if (state.deliveryMode === 'FINAL_ONLY') {
    return (
      <FinalCompositeAssessment
        state={state}
        publicMode={publicMode}
        recoveryToken={recoveryToken}
        submitFormSection={(id, sectionId, input) => api.submitFinalFormSection(id, sectionId, input)}
        submitScale={(id, itemId, input) => api.submitFinalScale(id, itemId, input)}
        onReload={() => loadAttempt(state.id, recoveryToken)}
        onExit={() => void saveAndExit()}
        onCompleted={() => goReport(state.id)}
        onEnterCognitive={enterChild}
        onEnterSituational={enterChild}
        onRestart={restartLegacyAttempt}
      />
    )
  }

  const current = state.currentItem
  const scale = current?.scale
  const scaleItems = scale?.definition?.items || []
  const scaleQuestion = scaleItems[scaleIndex]

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div><h1 className="text-2xl font-bold text-gray-800">{state.name}</h1><p className="text-sm text-gray-500">整体进度：{state.completedItems} / {state.totalItems}（{state.progress}%）</p></div>
        <button onClick={() => void saveAndExit()} className="btn-secondary"><Save className="w-4 h-4 inline mr-1" />保存并退出</button>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-5"><div className="bg-action h-2 rounded-full" style={{ width: `${state.progress}%` }} /></div>
      {publicMode && (newRecoveryToken || recoveryToken) && <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-5 text-sm text-amber-800">匿名编号：<strong>{state.anonymousCode || '匿名参与者'}</strong>。请保存恢复凭证：<code className="break-all">{newRecoveryToken || recoveryToken}</code></div>}
      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {current?.type === 'COGNITIVE' && <div className="card p-8 text-center"><h2 className="text-xl font-semibold mb-3">{state.items[state.currentIndex]?.label || '认知任务'}</h2><p className="text-gray-600 mb-6">完成该认知任务后会自动回到综合测评。</p><button onClick={() => enterChild(current)} className="btn-primary">开始/继续认知任务</button></div>}

      {current?.type === 'FORM' && current.form && <div className="card p-8">
        <h2 className="text-xl font-semibold mb-6">
          {current.form.label}{current.required && <span className="text-red-500 text-sm ml-2">必填</span>}
        </h2>
        {current.form.contextKey && <p className="text-sm text-gray-500 mb-4">此字段用于本次测评的参考匹配；同一父级测评中的后续模块会复用这份信息。</p>}
        {current.form.type === 'single_choice' ? <div className="space-y-2">{(current.form.options || []).map((option) => <button key={option.value} onClick={() => setFormValue(option.value)} className={`block w-full text-left border rounded px-4 py-3 ${formValue === option.value ? 'border-action bg-action/5' : ''}`}>{option.label}</button>)}</div> : current.form.type === 'multiple_choice' ? <div className="space-y-2">{(current.form.options || []).map((option) => { const selected = formValue.split(',').filter(Boolean).includes(option.value); return <button key={option.value} onClick={() => setFormValue((old) => { const values = old.split(',').filter(Boolean); return selected ? values.filter((value) => value !== option.value).join(',') : [...values, option.value].join(',') })} className={`block w-full text-left border rounded px-4 py-3 ${selected ? 'border-action bg-action/5' : ''}`}>{option.label}</button> })}</div> : current.form.type === 'year_month' ? <input type="month" value={formValue} onChange={(event) => setFormValue(event.target.value)} className="w-full border rounded px-3 py-2" /> : <textarea value={formValue} onChange={(event) => setFormValue(event.target.value)} placeholder={current.form.placeholder || '请输入'} className="w-full border rounded px-3 py-2 min-h-32" />}
        <button onClick={() => void submitForm()} disabled={submitting} className="btn-primary mt-6">保存并进入下一项</button>
      </div>}

      {current?.type === 'SCALE' && scale && scaleQuestion && <div className="card p-8"><p className="text-sm text-gray-500 mb-2">{scale.name} · 第 {scaleIndex + 1} / {scaleItems.length} 题</p><h2 className="text-xl font-semibold mb-6">{scaleQuestion.content}</h2><div className="space-y-2">{scaleQuestion.options.map((option) => <button key={`${typeof option.value}:${String(option.value)}`} onClick={() => void submitScaleAnswer(option.value)} className={`block w-full text-left border rounded px-4 py-3 ${scaleAnswers[scaleQuestion.itemCode] === option.value ? 'border-action bg-action/5 text-action' : 'hover:border-gray-400'}`}><span>{option.label}</span></button>)}</div><div className="flex justify-between mt-6"><button onClick={() => setScaleIndex((index) => Math.max(0, index - 1))} disabled={scaleIndex === 0} className="btn-secondary"><ChevronLeft className="w-4 h-4 inline" />上一题</button>{scaleIndex < scaleItems.length - 1 ? <button onClick={() => setScaleIndex((index) => Math.min(scaleItems.length - 1, index + 1))} className="btn-secondary">下一题<ChevronRight className="w-4 h-4 inline" /></button> : <button onClick={() => void completeScale()} disabled={submitting} className="btn-primary">完成量表</button>}</div></div>}

      <div className="mt-5 bg-white rounded shadow p-4"><p className="text-sm text-gray-500 mb-2">模块进度</p><div className="flex flex-wrap gap-2">{state.items.map((item) => <span key={item.id} className={`px-3 py-1 rounded text-sm ${item.completed ? 'bg-green-100 text-green-700' : item.index === state.currentIndex ? 'bg-action text-white' : 'bg-gray-100 text-gray-600'}`}>{item.index + 1}. {item.label || item.type}</span>)}</div></div>
    </div>
  )
}

const CompositeAssessmentPage: React.FC = () => {
  const location = useLocation()
  return (
    <CompositeAssessmentContent
      key={`${location.pathname}:${location.search}`}
    />
  )
}
export default CompositeAssessmentPage
