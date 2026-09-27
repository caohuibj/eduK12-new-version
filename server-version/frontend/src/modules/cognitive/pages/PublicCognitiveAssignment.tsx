import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LockKeyhole, Play } from 'lucide-react'
import { publicCognitiveAssignmentApi } from '../api'
import { saveCognitiveRecoveryCredential } from '../core/recovery-credential'
import { getOrCreateCognitiveStartIntent, readCognitiveStartIntent, rotateCognitiveStartIntent } from '../core/start-intent'

const accessRecoveryKey = (token: string) => `cognitive:recovery:access:${token}`
const messageFor = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback

const PublicCognitiveAssignment: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const generation = useRef(0)
  const busy = useRef(false)
  const [info, setInfo] = useState<{ title: string; instruction: string | null; testType: string } | null>(null)
  const [recoveryInput, setRecoveryInput] = useState('')
  const [startIntent, setStartIntent] = useState('')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [infoUnavailable, setInfoUnavailable] = useState(false)

  useEffect(() => {
    const current = ++generation.current
    let saved = ''
    try { saved = window.sessionStorage.getItem(accessRecoveryKey(token)) || '' } catch { /* manual recovery remains available */ }
    busy.current = false
    setStarting(false)
    setLoading(true)
    setInfo(null)
    setInfoUnavailable(false)
    setError(null)
    setRecoveryInput(saved)
    setStartIntent('')
    void (async () => {
      let pendingIntent = ''
      let storageError: string | null = null
      try { pendingIntent = await readCognitiveStartIntent(token) }
      catch (cause) { storageError = messageFor(cause, '无法保存匿名作答记录') }
      if (current !== generation.current) return
      setStartIntent(pendingIntent)
      try {
        const response = await publicCognitiveAssignmentApi.info(token)
        if (current !== generation.current) return
        if (response.code === 0 && response.data) {
          setInfo(response.data)
          if (storageError && !saved) setError(storageError)
        } else if (!saved && !pendingIntent) setError(response.message || '公开链接不可用')
        else setInfoUnavailable(true)
      } catch (cause) {
        if (current !== generation.current) return
        if (!saved && !pendingIntent) setError(messageFor(cause, '公开链接不可用'))
        else setInfoUnavailable(true)
      } finally { if (current === generation.current) setLoading(false) }
    })()
    return () => { generation.current += 1 }
  }, [token])

  const start = async () => {
    if (busy.current) return
    busy.current = true
    const current = generation.current
    setStarting(true)
    setError(null)
    try {
      const credentialInput = recoveryInput.trim()
      // Always consult the atomic shared store, not possibly stale React state
      // from another tab or an earlier participant on a shared device.
      const intent = credentialInput ? '' : await getOrCreateCognitiveStartIntent(token)
      if (current !== generation.current) return
      if (intent) setStartIntent(intent)
      const response = await publicCognitiveAssignmentApi.start(
        token,
        credentialInput ? { recoveryToken: credentialInput } : { startIntent: intent },
      )
      if (current !== generation.current) return
      if (response.code !== 0 || !response.data) throw new Error(response.message || '无法开始匿名测评')
      const credential = response.data.recoveryToken || credentialInput
      if (!credential) throw new Error('服务器未返回恢复凭证')
      saveCognitiveRecoveryCredential(response.data.session.sessionId, credential)
      window.sessionStorage.setItem(accessRecoveryKey(token), credential)
      // Do not delete the shared intent here: a response-lost concurrent tab
      // still owns this same admission and must not mint a second participant.
      navigate(`/public/cognitive/sessions/${response.data.session.sessionId}?public=1`)
    } catch (cause) {
      if (current === generation.current) setError(messageFor(cause, '无法开始匿名测评'))
    } finally {
      if (current === generation.current) { busy.current = false; setStarting(false) }
    }
  }

  const newParticipant = async () => {
    if (busy.current || !info) return
    busy.current = true
    const current = generation.current
    setStarting(true)
    setError(null)
    try {
      const previous = startIntent || await readCognitiveStartIntent(token)
      const next = await rotateCognitiveStartIntent(token, previous)
      if (current !== generation.current) return
      window.sessionStorage.removeItem(accessRecoveryKey(token))
      setRecoveryInput('')
      setStartIntent(next)
    } catch (cause) {
      if (current === generation.current) setError(messageFor(cause, '无法创建新的匿名作答记录'))
    } finally {
      if (current === generation.current) { busy.current = false; setStarting(false) }
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>
  return <div className="max-w-xl mx-auto card p-8">
    <LockKeyhole className="w-10 h-10 text-primary mx-auto mb-4" />
    <h1 className="text-2xl font-bold text-center mb-3">{info?.title || (infoUnavailable ? '继续匿名认知测评' : '公开认知测评')}</h1>
    <p className="text-gray-600 whitespace-pre-wrap mb-6">{info?.instruction || (infoUnavailable
      ? '公开链接当前不能创建新的测评，但已有恢复凭证仍可继续之前的测评。'
      : '本测评不要求登录，完成后可查看本次任务结果。')}</p>
    {error && <p role="alert" className="text-red-500 text-sm mb-4">{error}</p>}
    <label htmlFor="cognitive-public-recovery" className="block text-sm text-gray-600 mb-2">已有恢复凭证？</label>
    <input id="cognitive-public-recovery" value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value)}
      disabled={starting} className="w-full border rounded px-3 py-2 mb-4" placeholder="可选，粘贴后继续上次作答" />
    <button onClick={() => void start()} disabled={starting || (!info && !recoveryInput.trim() && !startIntent)} className="btn-primary w-full">
      <Play className="w-4 h-4 inline mr-1" />{recoveryInput ? '继续测评' : '开始匿名测评'}
    </button>
    {(startIntent || recoveryInput) && info && <div className="mt-4 text-sm text-gray-600 space-y-2">
      <p>本设备会保留本次匿名作答的恢复记录。由另一位参与者使用前，请明确开始新的作答，并保存原参与者的恢复凭证。</p>
      <button type="button" disabled={starting} onClick={() => void newParticipant()} className="btn-secondary w-full">为另一位参与者开始新作答</button>
    </div>}
  </div>
}

export default PublicCognitiveAssignment
