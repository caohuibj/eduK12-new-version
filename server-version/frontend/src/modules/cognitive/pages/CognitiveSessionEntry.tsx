import {trainingCognitiveLink} from '../../../components/participation/training-participation-link'
import { useTrainingLearnerNavigation } from '../../../training/learnerNavigation'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ProductButton, ProductPage, ProductStatus } from '../../../components/product-ui'
import { isPublicAssessmentPath } from '../../../components/app-shell/access'
import { readCognitiveRecoveryCredential, saveCognitiveRecoveryCredential } from '../core/recovery-credential'

/** Validate locator/credential before mounting domain hooks, including their media and draft reads. */
export default function CognitiveSessionEntry({ children }: { children: ReactNode }) {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { pathname,hash } = useLocation()
  const learner = useTrainingLearnerNavigation()
  const isPublic = isPublicAssessmentPath(pathname)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [, refresh] = useState(0)
  const [fragmentReady,setFragmentReady]=useState('')
  const fragment=trainingCognitiveLink.read(hash)?.key
  const fragmentScope=`${sessionId}:${hash}`
  useEffect(()=>{
    if(!isPublic||!sessionId||!fragment)return
    try {saveCognitiveRecoveryCredential(sessionId,fragment);setError('')}
    catch {setError('当前浏览器无法保存恢复凭据，请手动输入或返回原设备。')}
    setFragmentReady(fragmentScope)
  },[isPublic,sessionId,fragment,fragmentScope])
  let credential = ''
  try { if (sessionId && isPublic) credential = readCognitiveRecoveryCredential(sessionId) } catch { /* Show recovery UI if storage is unavailable. */ }
  if (!sessionId) return <ProductPage><ProductStatus kind="error" title="测评链接不完整" actions={<Link to={isPublic ? '/' : learner.enabled ? learner.backHref : '/student/cognitive'}>{learner.enabled ? learner.backLabel : '返回入口'}</Link>}>请使用老师提供的完整链接。</ProductStatus></ProductPage>
  if(isPublic&&fragment&&fragmentReady!==fragmentScope)return <ProductPage><ProductStatus kind="warning" title="正在准备恢复凭据">仅恢复此测评，随后仍由服务器验证权限。</ProductStatus></ProductPage>
  if (isPublic && !credential) return <ProductPage><ProductStatus kind="warning" title="需要恢复凭证">请填写开始测评时保存的恢复凭证。没有凭证时，请返回原设备或联系发放者获取帮助；这里不会创建新的测评。</ProductStatus>
    <form className="mt-6 space-y-3" onSubmit={(event) => {
      event.preventDefault()
      try { saveCognitiveRecoveryCredential(sessionId, input.trim()); setError(''); refresh((value) => value + 1) }
      catch { setError('当前浏览器无法保存恢复凭证。请允许此网站使用本地存储后重试。') }
    }}>
      <label htmlFor="cognitive-recovery">恢复凭证</label>
      <input id="cognitive-recovery" className="input" autoComplete="off" required value={input} onChange={(event) => setInput(event.target.value)} aria-describedby={error ? 'recovery-error' : undefined} />
      {error && <p role="alert" id="recovery-error">{error}</p>}
      <ProductButton type="submit" variant="primary" disabled={!input.trim()}>恢复测评</ProductButton>
    </form>
  </ProductPage>
  return <>{children}</>
}
