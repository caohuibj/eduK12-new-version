import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Spin, message, Card, Button, Result } from 'antd'
import { SafetyOutlined } from '@ant-design/icons'
import { completePOW } from '../../utils/powService'
import { createPublicCapabilityClient } from '../../api/publicCapabilityClient'
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

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true); setError(null); setQuestionnaire(null)
      if (!token) { setLoading(false); return }
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
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [token, navigate])

  /**
   * 开始测评
   */
  const startAssessment = async () => {
    try {
      setPowLoading(true)
      
      // 1. POW 验证（防止机器人）
      const powResult = await completePOW()
      setPowLoading(false)
      
      // 2. 开始测评
      const sessionId = readQuestionnaireSessionId(token)

      const client = createPublicCapabilityClient(readQuestionnaireResumeToken(token, sessionId))
      const data = await client.post<{ sessionId: string; resumeToken?: string }>(`/questionnaires/${token}/start`, {
          sessionId,
          challenge: powResult.challenge,
          proof: powResult.proof
        })
      
      if (token && data.data.resumeToken) {
        saveQuestionnaireResumeToken(token, data.data.sessionId, data.data.resumeToken)
      }
      
      // 跳转到测评页面
      window.location.href = `/public/questionnaire/${token}/assessment?sessionId=${data.data.sessionId}`
      
    } catch (err: any) {
      setPowLoading(false)
      message.error(err.message || '开始测评失败')
    }
  }

  if (loading || powLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <Spin size="large" />
          <div className="mt-4 text-gray-600">
            {powLoading ? (
              <>
                <SafetyOutlined className="mr-2" />
                正在进行安全验证...
              </>
            ) : (
              '正在加载问卷...'
            )}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen p-4">
        <Result
          status="error"
          title="访问失败"
          subTitle={error}
          extra={
            <Button type="primary" onClick={() => window.location.reload()}>
              重试
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Card className="shadow-lg">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              {questionnaire?.name}
            </h1>
            {questionnaire?.description && (
              <p className="text-gray-600 mb-6">{questionnaire.description}</p>
            )}
          </div>

          {questionnaire?.instruction && (
            <div className="bg-blue-50 p-6 rounded-lg mb-8">
              <h3 className="font-semibold text-gray-900 mb-3">指导语</h3>
              <p className="text-gray-700 whitespace-pre-wrap">
                {questionnaire.instruction}
              </p>
            </div>
          )}

          <div className="text-center space-y-4">
            <div className="text-gray-600">
              <p>预计用时：{questionnaire?.estimatedTime || 15} 分钟</p>
              <p className="text-sm text-gray-500 mt-2">
                本问卷采用匿名方式，您的回答将被严格保密
              </p>
            </div>

            <Button
              type="primary"
              size="large"
              onClick={startAssessment}
              className="mt-6"
            >
              开始测评
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default PublicQuestionnaire
