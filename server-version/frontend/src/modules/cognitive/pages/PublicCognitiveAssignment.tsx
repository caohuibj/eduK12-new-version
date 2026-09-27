import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LockKeyhole, Play } from 'lucide-react'
import { publicCognitiveAssignmentApi } from '../api'
import { saveCognitiveRecoveryCredential } from '../core/recovery-credential'
import { clearCognitiveStartIntent, getOrCreateCognitiveStartIntent, readCognitiveStartIntent } from '../core/start-intent'

const accessRecoveryKey = (token: string) => `cognitive:recovery:access:${token}`

const PublicCognitiveAssignment: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [info, setInfo] = useState<{ title: string; instruction: string | null; testType: string } | null>(null)
  const [recoveryInput, setRecoveryInput] = useState('')
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null)
  const [startIntent, setStartIntent] = useState(() => readCognitiveStartIntent(token))
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [infoUnavailable, setInfoUnavailable] = useState(false)

  useEffect(() => {
    const saved = window.sessionStorage.getItem(accessRecoveryKey(token))
    const pendingIntent = readCognitiveStartIntent(token)
    if (saved) setRecoveryInput(saved)
    if (pendingIntent) setStartIntent(pendingIntent)
    void publicCognitiveAssignmentApi.info(token).then((response) => {
      if (response.code === 0 && response.data) {
        setInfo(response.data)
        if (!saved) setStartIntent((current) => current || getOrCreateCognitiveStartIntent(token))
      } else if (!saved && !pendingIntent) setError(response.message || '公开链接不可用')
      else setInfoUnavailable(true)
    }).catch((err) => {
      if (!saved && !pendingIntent) setError((err as { message?: string }).message || '公开链接不可用')
      else setInfoUnavailable(true)
    }).finally(() => setLoading(false))
  }, [token])

  const start = async () => {
    try {
      setStarting(true)
      const credentialInput = recoveryInput.trim()
      const intent = credentialInput ? '' : (startIntent || getOrCreateCognitiveStartIntent(token))
      if (!credentialInput && !startIntent) setStartIntent(intent)
      const response = await publicCognitiveAssignmentApi.start(
        token,
        credentialInput ? { recoveryToken: credentialInput } : { startIntent: intent },
      )
      if (response.code !== 0 || !response.data) throw new Error(response.message || '无法开始匿名测评')
      const credential = response.data.recoveryToken || credentialInput
      if (!credential) throw new Error('服务器未返回恢复凭证')
      saveCognitiveRecoveryCredential(response.data.session.sessionId, credential)
      window.sessionStorage.setItem(accessRecoveryKey(token), credential)
      if (intent) clearCognitiveStartIntent(token, intent)
      if (response.data.recoveryToken) setRecoveryToken(response.data.recoveryToken)
      navigate(`/public/cognitive/sessions/${response.data.session.sessionId}?public=1`)
    } catch (err) { setError((err as { message?: string }).message || '无法开始匿名测评') } finally { setStarting(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>
  return <div className="max-w-xl mx-auto card p-8"><LockKeyhole className="w-10 h-10 text-primary mx-auto mb-4" /><h1 className="text-2xl font-bold text-center mb-3">{info?.title || (infoUnavailable ? '继续匿名认知测评' : '公开认知测评')}</h1><p className="text-gray-600 whitespace-pre-wrap mb-6">{info?.instruction || (infoUnavailable ? '公开链接当前不能创建新的测评，但已有恢复凭证仍可继续之前的测评。' : '本测评不要求登录，完成后可查看本次任务结果。')}</p>{error && <p className="text-red-500 text-sm mb-4">{error}</p>}<label className="block text-sm text-gray-600 mb-2">已有恢复凭证？</label><input value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value)} className="w-full border rounded px-3 py-2 mb-4" placeholder="可选，粘贴后继续上次作答" /><button onClick={() => void start()} disabled={starting || (!info && !recoveryInput.trim() && !startIntent)} className="btn-primary w-full"><Play className="w-4 h-4 inline mr-1" />{recoveryInput ? '继续测评' : '开始匿名测评'}</button>{recoveryToken && <p className="mt-4 text-sm text-amber-700 bg-amber-50 p-3 rounded">请保存恢复凭证：<code className="break-all">{recoveryToken}</code></p>}</div>
}

export default PublicCognitiveAssignment
