import { useState } from 'react'
import { saveCognitiveRecoveryCredential } from '../core/recovery-credential'
export default function CognitiveCredentialReset({ sessionId }: { sessionId: string }) {
  const [error, setError] = useState('')
  return <div className="mt-4"><button type="button" className="btn-secondary" onClick={() => {
    try { saveCognitiveRecoveryCredential(sessionId, ''); window.location.reload() }
    catch { setError('无法更新恢复凭证，请检查浏览器的本地存储设置。') }
  }}>重新输入恢复凭证</button>{error && <p role="alert">{error}</p>}</div>
}
