import React, { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import * as echarts from 'echarts'
import 'echarts-wordcloud'
import { useClassroomSocket } from '../../hooks/useClassroomSocket'
import { useAuth } from '../../contexts/AuthContext'
import apiClient from '../../api/client'
import { Users, BookOpen, Clock } from 'lucide-react'

interface Question {
  questionId: string
  questionContent: any
  questionIndex: number
  timeLimit: number
}

interface Stats {
  questionId: string
  answerCount: number
  totalSessions: number
  submissionRate: number
  optionStats?: Record<string, number>
  textAnswers?: Array<{ text: string; timestamp: number }>
  wordCloud?: {
    topWords?: Array<{ word: string; count: number }>
    wordFrequency?: Record<string, number>
  }
}

const BigScreen: React.FC = () => {
  const { classroomId } = useParams<{ classroomId: string }>()
  const [searchParams] = useSearchParams()
  const historyQuestionId = searchParams.get('history')
  const isHistoryMode = !!historyQuestionId
  const { isLoading: authLoading, user } = useAuth()

  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [onlineCount, setOnlineCount] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [isFinished, setIsFinished] = useState(false)
  const [loading, setLoading] = useState(false)

  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<echarts.ECharts | null>(null)
  const wordCloudRef = useRef<HTMLDivElement>(null)
  const wordCloudInstance = useRef<echarts.ECharts | null>(null)

  // Socket 连接
  const { isConnected, on, off, emit } = useClassroomSocket({
    classroomId,
    role: 'bigscreen',
    autoConnect: !isHistoryMode && !authLoading && !!user,
  })

  // 历史模式加载历史数据
  useEffect(() => {
    if (!isHistoryMode || !historyQuestionId) return

    const loadHistoryData = async () => {
      try {
        setLoading(true)
        
        const response = await apiClient.get<any>(
          `/classrooms/${classroomId}/questions/${historyQuestionId}/stats`
        )
        
        if (response.code === 0 && response.data) {
          
          setCurrentQuestion({
            questionId: response.data.question.id,
            questionContent: response.data.question.questionContent,
            questionIndex: response.data.question.questionIndex,
            timeLimit: response.data.question.timeLimit,
          })
          
          setStats(response.data.stats)
          setIsFinished(true)
        } else {
          alert('加载历史数据失败: ' + response.message)
        }
      } catch (err: any) {
        alert('加载历史数据错误: ' + (err.message || '未知错误'))
      } finally {
        setLoading(false)
      }
    }

    loadHistoryData()
  }, [isHistoryMode, historyQuestionId, classroomId])

  // 监听 Socket 事件
  useEffect(() => {
    if (!isConnected) {
      return
    }


    on('bigscreen:joined', (data) => {
      
      // 如果有当前题目，设置题目和状态
      if (data.currentQuestion) {
        setCurrentQuestion({
          questionId: data.currentQuestion.questionId,
          questionContent: data.currentQuestion.questionContent,
          questionIndex: data.currentQuestion.questionIndex,
          timeLimit: data.currentQuestion.timeLimit,
        })
        
        // 如果有剩余时间，启动倒计时
        if (data.currentQuestion.remainingTime && data.currentQuestion.remainingTime > 0) {
          setCountdown(data.currentQuestion.remainingTime)
        }
      }
      
      // 设置统计数据
      if (data.stats) {
        setStats(data.stats)
      }
      
      // 设置在线人数
      if (data.onlineCount !== undefined) {
        setOnlineCount(data.onlineCount)
      }
    })

    on('broadcast:question', (data: Question) => {
      setCurrentQuestion(data)
      setStats(null)
      setIsFinished(false)
      
      // 启动倒计时
      if (data.timeLimit && data.timeLimit > 0) {
        setCountdown(data.timeLimit)
      } else {
        setCountdown(null)
      }
    })

    on('broadcast:stats', (data: Stats) => {
      setStats(data)
    })

    on('broadcast:online', (data: { onlineCount: number }) => {
      setOnlineCount(data.onlineCount)
    })

    on('broadcast:finished', () => {
      setIsFinished(true)
      setCountdown(null)
    })

    return () => {
      off('bigscreen:joined')
      off('broadcast:question')
      off('broadcast:stats')
      off('broadcast:online')
      off('broadcast:finished')
    }
  }, [isConnected, on, off])

  // 倒计时逻辑
  useEffect(() => {
    if (countdown === null || countdown <= 0) return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer)
          setIsFinished(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [countdown])

  // 初始化/更新图表（柱状图）
  useEffect(() => {
    if (!chartRef.current || !currentQuestion) return
    if (currentQuestion.questionContent.type !== 'single_choice' &&
        currentQuestion.questionContent.type !== 'multiple_choice') return
    
    
    // 如果还没结束且没有统计数据，不显示图表
    if (!isFinished && !stats) {
      return
    }

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current)
    }

    // 兼容两种格式：{ value, label } 和 { key, text }
    const options = currentQuestion.questionContent.options || []
    const optionStats = stats?.optionStats || {}
    const totalCount = stats?.answerCount || 1


    const categories = options.map((opt: any) => opt.value || opt.key)
    const data = options.map((opt: any) => optionStats[opt.value || opt.key] || 0)
    const percentages = options.map((opt: any) => {
      const count = optionStats[opt.value || opt.key] || 0
      return totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) : 0
    })


    const option = {
      backgroundColor: 'transparent',
      title: {
        text: isFinished ? '答题统计（已结束）' : '实时统计',
        left: 'center',
        top: 20,
        textStyle: {
          color: '#ffffff',
          fontSize: 28,
        },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: (params: any) => {
          const idx = params[0].dataIndex
          const opt = options[idx]
          const optValue = opt.value || opt.key
          const optLabel = opt.label || opt.text
          return `${optValue}. ${optLabel}<br/>` +
                 `选择人数: ${data[idx]} 人<br/>` +
                 `占比: ${percentages[idx]}%`
        },
      },
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%',
        top: '20%',
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: {
          color: '#ffffff',
          fontSize: 24,
          margin: 20,
        },
        axisLine: {
          lineStyle: {
            color: '#30363d'
          }
        },
        axisTick: {
          show: false
        }
      },
      yAxis: {
        type: 'value',
        name: '人数',
        nameTextStyle: {
          color: '#8b949e',
          fontSize: 18,
        },
        axisLabel: {
          color: '#8b949e',
          fontSize: 18,
        },
        axisLine: {
          lineStyle: {
            color: '#30363d'
          }
        },
        splitLine: {
          lineStyle: {
            color: '#21262d'
          }
        }
      },
      series: [
        {
          name: '选择人数',
          type: 'bar',
          data: data,
          barWidth: '50%',
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#58A6FF' },
              { offset: 1, color: '#1f6feb' }
            ]),
            borderRadius: [8, 8, 0, 0],
          },
          label: {
            show: true,
            position: 'top',
            color: '#ffffff',
            fontSize: 20,
            formatter: (params: any) => {
              return `${params.value}人\n${percentages[params.dataIndex]}%`
            },
          },
          emphasis: {
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#79c0ff' },
                { offset: 1, color: '#388bfd' }
              ]),
            },
          },
        },
      ],
    }

    chartInstance.current.setOption(option)

    return () => {
      chartInstance.current?.dispose()
      chartInstance.current = null
    }
  }, [currentQuestion, stats, isFinished])

  // 初始化/更新词云
  useEffect(() => {
    
    if (!wordCloudRef.current) {
      return
    }
    if (!currentQuestion) {
      return
    }

    // 检查是否有数据（wordCloud或textAnswers）
    const wordCloud = stats?.wordCloud
    const textAnswers = stats?.textAnswers
    const hasWordCloud = Boolean(wordCloud && (wordCloud.topWords || wordCloud.wordFrequency))
    const hasTextAnswers = Boolean(textAnswers && textAnswers.length > 0)
    
    
    if (!hasWordCloud && !hasTextAnswers) {
      return
    }


    if (!wordCloudInstance.current) {
      wordCloudInstance.current = echarts.init(wordCloudRef.current)
    }

    // 优先使用后端分词结果，降级到前端简单分词
    let data: Array<{ name: string; value: number }>
    
    if (hasWordCloud && wordCloud) {
      // 使用后端分词结果
      if (wordCloud.topWords && wordCloud.topWords.length > 0) {
        data = wordCloud.topWords.map((item: any) => ({
          name: item.word,
          value: item.count,
        }))
      } else if (wordCloud.wordFrequency) {
        data = Object.entries(wordCloud.wordFrequency)
          .map(([name, value]) => ({ name, value: value as number }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 50)
      } else {
        data = []
      }
    } else if (textAnswers) {
      // 降级方案：前端简单分词
      const wordFrequency: Record<string, number> = {}
      textAnswers.forEach((answer) => {
        const words = answer.text.split(/\s+/)
        words.forEach((word) => {
          if (word.trim()) {
            wordFrequency[word.trim()] = (wordFrequency[word.trim()] || 0) + 1
          }
        })
      })

      data = Object.entries(wordFrequency)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 50)
    } else {
      data = []
    }

    const option = {
      backgroundColor: 'transparent',
      series: [
        {
          type: 'wordCloud',
          shape: 'circle',
          left: 'center',
          top: 'center',
          width: '90%',
          height: '90%',
          sizeRange: [20, 80],
          rotationRange: [-45, 45],
          rotationStep: 15,
          gridSize: 8,
          drawOutOfBound: false,
          textStyle: {
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            color: function () {
              const colors = ['#58A6FF', '#00D9FF', '#0078D4', '#FFB900', '#107C10', '#E84855']
              return colors[Math.floor(Math.random() * colors.length)]
            },
          },
          data,
        },
      ],
    }

    wordCloudInstance.current.setOption(option)

    return () => {
      wordCloudInstance.current?.dispose()
      wordCloudInstance.current = null
    }
  }, [currentQuestion, stats])

  if (!isConnected && !isHistoryMode) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-white text-2xl">连接中...</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-white text-2xl">加载历史数据...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-white p-8">
      {/* 顶部状态栏 */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-6">
          <div className="text-3xl font-bold">
            {isHistoryMode ? (
              `第 ${currentQuestion?.questionIndex} 题 - 历史统计`
            ) : currentQuestion ? (
              `第 ${currentQuestion.questionIndex} 题`
            ) : (
              '等待出题'
            )}
          </div>
          {/* 倒计时 */}
          {countdown !== null && countdown > 0 && (
            <div className="flex items-center gap-2 px-6 py-3 bg-orange-600/20 border-2 border-orange-500 rounded-lg">
              <Clock className="w-8 h-8 text-orange-400" />
              <span className="text-3xl font-bold text-orange-400">
                {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
              </span>
            </div>
          )}
          {/* 已结束标记 */}
          {isFinished && currentQuestion && (
            <div className="px-6 py-3 bg-green-600/20 border-2 border-green-500 rounded-lg">
              <span className="text-2xl font-bold text-green-400">答题已结束</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-8 text-xl">
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6" />
              <span>{onlineCount} 人在线</span>
            </div>
            {stats && (
              <>
                <div className="flex items-center gap-2">
                  <BookOpen className="w-6 h-6" />
                  <span>{stats.answerCount} 人已答</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>提交率: {stats.submissionRate.toFixed(1)}%</span>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => {
              // 非历史模式下，如果有正在进行的题目，通知后端结束
              if (!isHistoryMode && currentQuestion && !isFinished) {
                emit('bigscreen:close', {
                  questionId: currentQuestion.questionId,
                })
              }
              window.close()
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-base"
          >
            {isHistoryMode ? '关闭历史查看' : '退出大屏'}
          </button>
        </div>
      </div>

      {/* 主要展示区 - 选择题：左右分栏 */}
      {currentQuestion && 
       (currentQuestion.questionContent.type === 'single_choice' ||
        currentQuestion.questionContent.type === 'multiple_choice') ? (
        (isFinished || stats) ? (
          <div className="grid grid-cols-2 gap-8" style={{ height: 'calc(100vh - 180px)' }}>
            {/* 左侧：题干和选项 */}
            <div className="bg-[#161b22] rounded-lg p-8 overflow-y-auto">
              <div className="mb-8">
                <div className="text-3xl font-bold mb-2">
                  第 {currentQuestion.questionIndex} 题
                </div>
                <div className="text-sm text-gray-400 mb-6">
                  {currentQuestion.questionContent.type === 'single_choice' ? '单选题' : '多选题'}
                </div>
              </div>
              
              <div className="text-2xl font-semibold mb-8 leading-relaxed">
                {currentQuestion.questionContent.question}
              </div>
              
              <div className="space-y-4">
                {currentQuestion.questionContent.options?.map((option: any) => {
                  const optionValue = option.value || option.key
                  const optionLabel = option.label || option.text
                  const count = stats?.optionStats?.[optionValue] || 0
                  const totalCount = stats?.answerCount || 0
                  const percentage = totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) : 0
                  
                  return (
                    <div
                      key={optionValue}
                      className="p-5 rounded-lg border-2 bg-[#21262d] border-gray-700 hover:border-blue-500 transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <div className="text-xl">
                          <span className="font-bold mr-3 text-blue-400">{optionValue}.</span>
                          <span>{optionLabel}</span>
                        </div>
                        {stats && (
                          <div className="text-lg text-gray-400">
                            {count} 人 ({percentage}%)
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 右侧：柱状图统计 */}
            <div className="bg-[#161b22] rounded-lg p-4">
              <div ref={chartRef} className="w-full h-full" />
            </div>
          </div>
        ) : (
          /* 答题中：只显示题目 */
          <div className="bg-[#161b22] rounded-lg p-8 mx-auto max-w-4xl mt-8">
            <div className="mb-6">
              <div className="text-3xl font-bold mb-2">
                第 {currentQuestion.questionIndex} 题
              </div>
              <div className="text-sm text-gray-400">
                {currentQuestion.questionContent.type === 'single_choice' ? '单选题' : '多选题'}
              </div>
            </div>
            
            <div className="text-2xl font-semibold mb-8 leading-relaxed">
              {currentQuestion.questionContent.question}
            </div>
            
            <div className="space-y-4">
              {currentQuestion.questionContent.options?.map((option: any) => {
                const optionValue = option.value || option.key
                const optionLabel = option.label || option.text
                
                return (
                  <div
                    key={optionValue}
                    className="p-5 rounded-lg border-2 bg-[#21262d] border-gray-700 hover:border-blue-500 transition-colors"
                  >
                    <div className="text-xl">
                      <span className="font-bold mr-3 text-blue-400">{optionValue}.</span>
                      <span>{optionLabel}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      ) : currentQuestion ? (
        /* 填空题/文本题：左侧题目 + 右侧词云 */
        <div className="grid grid-cols-2 gap-8" style={{ height: 'calc(100vh - 180px)' }}>
          {/* 左侧：题干 */}
          <div className="bg-[#161b22] rounded-lg p-8 overflow-y-auto">
            <div className="mb-8">
              <div className="text-3xl font-bold mb-2">
                第 {currentQuestion?.questionIndex || 1} 题
              </div>
              <div className="text-sm text-gray-400 mb-6">
                文本题
              </div>
            </div>
            
            <div className="text-2xl font-semibold mb-8 leading-relaxed">
              {currentQuestion.questionContent.question}
            </div>
            
            {stats && stats.textAnswers && stats.textAnswers.length > 0 && (
              <div className="mt-8">
                <div className="text-xl font-semibold mb-4 text-gray-400">
                  已收集 {stats.textAnswers.length} 条答案
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {stats.textAnswers.slice(-10).reverse().map((answer, index) => (
                    <div key={index} className="p-3 bg-[#21262d] rounded-lg text-lg">
                      {answer.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右侧：词云统计 */}
          <div className="bg-[#161b22] rounded-lg p-4">
            {(stats?.wordCloud?.topWords || stats?.textAnswers?.length) ? (
              <div ref={wordCloudRef} className="w-full h-full" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <div className="text-6xl mb-4">💭</div>
                  <div className="text-xl">等待答案提交...</div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 无题目时显示等待 */
        <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 180px)' }}>
          <div className="text-center">
            <div className="text-6xl mb-4">📊</div>
            <div className="text-2xl text-gray-400">
              {isHistoryMode ? '加载中...' : '等待教师出题'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BigScreen
