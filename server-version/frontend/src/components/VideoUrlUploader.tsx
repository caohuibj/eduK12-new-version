/**
 * 视频链接上传组件
 * 支持：输入视频URL，后端下载并处理
 */
import React, { useEffect, useRef, useState } from 'react'
import { message, Input, Button, Card, Progress, Space, Typography, Alert } from 'antd'
import { CloudDownloadOutlined, LinkOutlined, LoadingOutlined } from '@ant-design/icons'
import { sessionFetch } from '../api/client'

const { Text, Title } = Typography

interface VideoUrlUploaderProps {
  onSuccess?: (videoId: string) => void
}

export const VideoUrlUploader: React.FC<VideoUrlUploaderProps> = ({ onSuccess }) => {
  const [videoUrl, setVideoUrl] = useState('')
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'idle' | 'downloading' | 'processing' | 'completed' | 'failed'>('idle')
  const [videoId, setVideoId] = useState<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  // 提交视频链接
  const handleSubmit = async () => {
    if (!videoUrl.trim()) {
      message.error('请输入视频链接')
      return
    }
    if (!title.trim()) {
      message.error('请输入视频标题')
      return
    }

    // URL格式验证
    try {
      new URL(videoUrl)
    } catch {
      message.error('请输入有效的URL')
      return
    }

    setLoading(true)
    setStatus('downloading')

    try {
      const response = await sessionFetch('/api/videos/upload-from-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          videoUrl: videoUrl.trim(),
          watermarkText: '慧育空间教学专属视频',
        }),
      })

      const data = await response.json()

      if (data.code === 0) {
        message.success('视频链接已提交，正在后台处理')
        setVideoId(data.data.id)
        setStatus('processing')
        setProgress(0)
        
        // 开始轮询处理状态
        pollStatus(data.data.id)
        
        onSuccess?.(data.data.id)
      } else {
        message.error(data.message || '提交失败')
        setStatus('failed')
      }
    } catch (err) {
      message.error('网络错误，请重试')
      setStatus('failed')
    } finally {
      setLoading(false)
    }
  }

  // 轮询处理状态
  const pollStatus = async (id: string) => {
    const scheduleCheck = (check: () => void, delay: number) => {
      if (!mountedRef.current) return
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      pollTimerRef.current = setTimeout(() => {
        pollTimerRef.current = null
        check()
      }, delay)
    }

    const checkStatus = async () => {
      if (!mountedRef.current) return
      try {
        const response = await sessionFetch(`/api/videos/${id}/status`)
        const data = await response.json()

        if (!mountedRef.current) return

        if (data.code === 0) {
          setProgress(data.data.progress || 0)
          
          switch (data.data.status) {
            case 'COMPLETED':
              pollTimerRef.current = null
              setStatus('completed')
              message.success('视频处理完成！')
              return
            case 'FAILED':
              pollTimerRef.current = null
              setStatus('failed')
              message.error(`处理失败: ${data.data.errorMessage}`)
              return
            case 'PROCESSING':
              // 继续轮询
              scheduleCheck(() => { void checkStatus() }, 2000)
              break
            default:
              scheduleCheck(() => { void checkStatus() }, 2000)
          }
        }
      } catch (err) {
        if (!mountedRef.current) return
        console.error('获取状态失败:', err)
        scheduleCheck(() => { void checkStatus() }, 5000)
      }
    }

    checkStatus()
  }

  const getStatusText = () => {
    switch (status) {
      case 'downloading':
        return '正在提交链接...'
      case 'processing':
        return '正在下载并处理视频...'
      case 'completed':
        return '处理完成！'
      case 'failed':
        return '处理失败'
      default:
        return ''
    }
  }

  return (
    <Card>
      <Title level={4}>
        <LinkOutlined /> 视频链接上传
      </Title>
      
      <Alert
        message="功能说明"
        description="输入视频链接（如 https://example.com/video.mp4），系统会自动下载到服务器并进行压缩、添加水印处理。支持大多数常见的视频链接格式。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div>
          <Text strong>视频标题</Text>
          <Input
            placeholder="请输入视频标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            showCount
          />
        </div>

        <div>
          <Text strong>视频链接</Text>
          <Input.TextArea
            placeholder="请输入视频URL，例如：https://example.com/video.mp4"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            rows={3}
          />
        </div>

        <Button
          type="primary"
          icon={loading ? <LoadingOutlined /> : <CloudDownloadOutlined />}
          onClick={handleSubmit}
          loading={loading}
          disabled={status === 'processing'}
          block
        >
          {loading ? '提交中...' : '提交视频链接'}
        </Button>

        {(status === 'processing' || status === 'downloading') && (
          <div>
            <Text type="secondary">{getStatusText()}</Text>
            <Progress percent={progress} status="active" />
          </div>
        )}

        {status === 'completed' && (
          <Alert
            message="处理完成"
            description="视频已下载并处理完成，可以在视频库中查看。"
            type="success"
            showIcon
          />
        )}

        {status === 'failed' && (
          <Alert
            message="处理失败"
            description="请检查视频链接是否有效，或联系管理员。"
            type="error"
            showIcon
          />
        )}
      </Space>
    </Card>
  )
}

export default VideoUrlUploader
