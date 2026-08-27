import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Spin, message, Card, Button, Result } from 'antd'
import { SafetyOutlined } from '@ant-design/icons'
import { completePOW } from '../../utils/powService'
import {
  questionnaireResumeHeaders,
  readQuestionnaireSessionId,
  saveQuestionnaireResumeToken,
} from '../../utils/questionnaireResume'

const PublicQuestionnaire: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [powLoading, setPowLoading] = useState(false)
  const [questionnaire, setQuestionnaire] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (token) {
      validateAndFetchQuestionnaire()
    }
  }, [token])

  /**
   * 验证令牌并获取问卷信息
   */
  const validateAndFetchQuestionnaire = async () => {
    try {
      setLoading(true)
      
      // 获取问卷信息（GET 请求，无需 POW）
      const response = await fetch(`/api/public/questionnaires/${token}`, {
        headers: questionnaireResumeHeaders(token, readQuestionnaireSessionId(token)),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '访问失败')
      }

      const data = await response.json()
      setQuestionnaire(data.data.questionnaire)
      
    } catch (err: any) {
      setError(err.message || '问卷访问失败')
      message.error(err.message || '问卷访问失败')
    } finally {
      setLoading(false)
    }
  }

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

      const response = await fetch(`/api/public/questionnaires/${token}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...questionnaireResumeHeaders(token, sessionId),
        },
        body: JSON.stringify({ 
          sessionId,
          challenge: powResult.challenge,
          proof: powResult.proof
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '开始测评失败')
      }

      const data = await response.json()
      
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
