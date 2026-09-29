import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { completePOW } from '../../utils/powService'
import { createPublicCapabilityClient } from '../../api/publicCapabilityClient'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import {
  readQuestionnaireSessionId,
  readQuestionnaireResumeToken,
  saveQuestionnaireResumeToken,
} from '../../utils/questionnaireResume'

const PublicQuestionnaire: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [powLoading, setPowLoading] = useState(false)
  const [questionnaire, setQuestionnaire] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      setQuestionnaire(null)
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const sessionId = readQuestionnaireSessionId(token)
        const credential = readQuestionnaireResumeToken(token, sessionId)
        const client = createPublicCapabilityClient(credential)
        // An existing attempt is authorized by its own capability, independently
        // of the entry link's remaining quota. Never start a new attempt here.
        if (sessionId && credential) {
          const response = await client.get<{ questionnaireAssessment: { status: string } }>(`/assessments/${encodeURIComponent(sessionId)}`)
          if (cancelled) return
          const page = response.data.questionnaireAssessment.status === 'COMPLETED' ? 'result' : 'assessment'
          navigate(`/public/questionnaire/${encodeURIComponent(token)}/${page}?sessionId=${encodeURIComponent(sessionId)}`, { replace: true })
          return
        }
        const response = await client.get<{ questionnaire: unknown }>(`/questionnaires/${encodeURIComponent(token)}`)
        if (!cancelled) setQuestionnaire(response.data.questionnaire)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to open assessment')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [token, navigate])

  const startAssessment = async () => {
    try {
      setPowLoading(true)
      setActionError(null)

      // 1. POW 验证（防止机器人）
      const powResult = await completePOW()
      setPowLoading(false)

      // 2. 开始测评
      const sessionId = readQuestionnaireSessionId(token)
      const client = createPublicCapabilityClient(readQuestionnaireResumeToken(token, sessionId))
      const data = await client.post<{ sessionId: string; resumeToken?: string }>(`/questionnaires/${token}/start`, {
        sessionId,
        challenge: powResult.challenge,
        proof: powResult.proof,
      })

      if (token && data.data.resumeToken) {
        saveQuestionnaireResumeToken(token, data.data.sessionId, data.data.resumeToken)
      }

      window.location.href = `/public/questionnaire/${token}/assessment?sessionId=${data.data.sessionId}`
    } catch (err) {
      setPowLoading(false)
      setActionError(err instanceof Error ? err.message : '开始测评失败')
    }
  }

  if (loading || powLoading) {
    return (
      <ProductPage width="reading" className="hui-public-participation hui-public-participation--centered">
        <ProductStatus kind="pending" title={powLoading ? '正在进行安全验证' : '正在加载问卷'} announce="polite">
          {powLoading
            ? <span className="hui-public-participation__status-copy"><ShieldCheck size={17} aria-hidden="true" />验证通过后将自动进入问卷。</span>
            : '正在读取匿名问卷信息。'}
        </ProductStatus>
      </ProductPage>
    )
  }

  if (error) {
    return (
      <ProductPage width="reading" className="hui-public-participation hui-public-participation--centered">
        <ProductStatus
          kind="error"
          title="访问失败"
          announce="assertive"
          actions={<ProductButton variant="primary" onClick={() => window.location.reload()}>重试</ProductButton>}
        >
          {error}
        </ProductStatus>
      </ProductPage>
    )
  }

  return (
    <ProductPage width="reading" className="hui-public-participation">
      <PageHeader
        title={questionnaire?.name || '匿名问卷'}
        description={questionnaire?.description || '请根据页面说明完成本次问卷。'}
      />

      {questionnaire?.instruction && (
        <section className="hui-public-participation__instruction" aria-labelledby="public-questionnaire-instruction">
          <p className="hui-public-participation__eyebrow">参与说明</p>
          <h2 id="public-questionnaire-instruction">指导语</h2>
          <p>{questionnaire.instruction}</p>
        </section>
      )}

      <div className="hui-public-participation__facts" aria-label="问卷说明">
        <div>
          <span>预计用时</span>
          <strong>{questionnaire?.estimatedTime || 15} 分钟</strong>
        </div>
        <div>
          <span>参与方式</span>
          <strong>匿名参与</strong>
        </div>
      </div>

      <ProductStatus kind="info" title="匿名与隐私说明">
        本问卷采用匿名方式。恢复凭据仅用于继续本次会话，不会把匿名入口转换为普通登录账户。
      </ProductStatus>

      {actionError && (
        <ProductStatus kind="error" title="暂时无法开始测评" announce="assertive">
          {actionError}
        </ProductStatus>
      )}

      <div className="hui-public-participation__actions">
        <ProductButton variant="primary" onClick={() => void startAssessment()}>
          开始测评
        </ProductButton>
      </div>
    </ProductPage>
  )
}

export default PublicQuestionnaire
