import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Keyboard, ArrowRight, Loader2 } from 'lucide-react'

const ClassroomEnter: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isEntering, setIsEntering] = useState(false)

  // 从 URL 参数中获取课堂码
  useEffect(() => {
    const codeParam = searchParams.get('code')
    if (codeParam && /^\d{6}$/.test(codeParam)) {
      setCode(codeParam)
      // 自动跳转
      setIsEntering(true)
      setTimeout(() => {
        // 直接跳转，不修改登录状态
        // 已登录学生会保持登录状态，未登录学生使用临时身份
        navigate(`/student/classroom/join/${codeParam}`)
      }, 500)
    }
  }, [searchParams, navigate])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // 验证课堂码格式（6位数字）
    if (!code.trim()) {
      setError('请输入课堂码')
      return
    }

    if (!/^\d{6}$/.test(code)) {
      setError('课堂码必须是6位数字')
      return
    }

    // 跳转到加入课堂页面
    navigate(`/student/classroom/join/${code}`)
  }

  const handleKeyPress = (digit: string) => {
    if (code.length < 6 && !isEntering) {
      const newCode = code + digit
      setCode(newCode)
      setError('')
      
      // 输入满6位后自动跳转
      if (newCode.length === 6) {
        setIsEntering(true)
        setTimeout(() => {
          // 直接跳转，不修改登录状态
          // 已登录学生会保持登录状态，未登录学生使用临时身份
          navigate(`/student/classroom/join/${newCode}`)
        }, 300)
      }
    }
  }

  const handleDelete = () => {
    setCode(code.slice(0, -1))
    setError('')
  }

  const handleClear = () => {
    setCode('')
    setError('')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部标题 */}
      <div className="bg-white shadow-sm">
        <div className="max-w-md mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900 text-center">加入课堂</h1>
          <p className="text-gray-500 text-center mt-2 text-sm">
            请输入6位课堂码
          </p>
        </div>
      </div>

      {/* 主要内容 */}
      <div className="flex-1 flex flex-col justify-center px-4 py-8">
        <div className="max-w-md mx-auto w-full">
          {/* 课堂码显示 */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex justify-center gap-2 mb-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="w-12 h-14 border-2 rounded-lg flex items-center justify-center text-2xl font-bold"
                  style={{
                    borderColor: code[i] ? '#10b981' : '#e5e7eb',
                    color: code[i] ? '#10b981' : '#9ca3af',
                  }}
                >
                  {code[i] || '-'}
                </div>
              ))}
            </div>

            {error && (
              <div className="text-red-600 text-sm text-center">{error}</div>
            )}
            
            {isEntering && (
              <div className="text-primary text-sm text-center mt-2 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                正在进入课堂...
              </div>
            )}
          </div>

          {/* 数字键盘 */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(
                (digit, index) => {
                  if (digit === '') {
                    return <div key={index} />
                  }

                  if (digit === 'del') {
                    return (
                      <button
                        key={index}
                        onClick={handleDelete}
                        className="h-14 rounded-lg bg-gray-100 text-gray-600 font-medium hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center"
                      >
                        删除
                      </button>
                    )
                  }

                  return (
                    <button
                      key={index}
                      onClick={() => handleKeyPress(digit)}
                      disabled={isEntering}
                      className="h-14 rounded-lg bg-gray-50 text-gray-900 text-xl font-medium hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {digit}
                    </button>
                  )
                }
              )}
            </div>

            {/* 清空按钮 */}
            <button
              onClick={handleClear}
              className="w-full mt-3 py-2 text-gray-500 text-sm hover:text-gray-700"
            >
              清空
            </button>
          </div>

          {/* 提交按钮 */}
          <button
            onClick={handleSubmit}
            disabled={code.length !== 6 || isEntering}
            className="w-full mt-6 px-4 py-3 bg-primary text-white rounded-lg font-medium disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isEntering ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                正在进入...
              </>
            ) : (
              <>
                <Keyboard className="w-5 h-5" />
                进入课堂
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ClassroomEnter
