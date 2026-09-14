import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Keyboard, Loader2 } from 'lucide-react'

const ClassroomEnter: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isEntering, setIsEntering] = useState(false)

  useEffect(() => {
    const codeParam = searchParams.get('code')
    if (codeParam && /^\d{6}$/.test(codeParam)) {
      setCode(codeParam)
      setIsEntering(true)
      setTimeout(() => {
        navigate(`/student/classroom/join/${codeParam}`)
      }, 500)
    }
  }, [searchParams, navigate])

  const validateCode = (value: string) => {
    if (!value.trim()) return '请输入课堂码'
    if (!/^\d{6}$/.test(value)) return '课堂码必须是6位数字'
    return ''
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const validationError = validateCode(code)
    if (validationError) {
      setError(validationError)
      return
    }
    setIsEntering(true)
    navigate(`/student/classroom/join/${code}`)
  }

  const handleCodeChange = (value: string) => {
    if (isEntering) return
    const nextCode = value.replace(/\D/g, '').slice(0, 6)
    setCode(nextCode)
    setError('')
  }

  const handleKeyPress = (digit: string) => {
    if (code.length >= 6 || isEntering) return
    const nextCode = code + digit
    setCode(nextCode)
    setError('')

    if (nextCode.length === 6) {
      setIsEntering(true)
      setTimeout(() => {
        navigate(`/student/classroom/join/${nextCode}`)
      }, 300)
    }
  }

  const handleDelete = () => {
    if (isEntering) return
    setCode(current => current.slice(0, -1))
    setError('')
  }

  const handleClear = () => {
    if (isEntering) return
    setCode('')
    setError('')
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-md px-4 py-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">加入课堂</h1>
          <p className="mt-2 text-sm text-gray-500">输入6位课堂码；可使用键盘或屏幕数字键盘。</p>
        </div>
      </header>

      <div className="flex flex-1 flex-col justify-center px-4 py-8">
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md space-y-6">
          <section className="rounded-lg bg-white p-6 shadow-sm">
            <div className="mb-4 flex justify-center gap-2" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map(index => (
                <div
                  key={index}
                  className={`flex h-14 w-12 items-center justify-center rounded-lg border-2 text-2xl font-bold ${code[index] ? 'border-emerald-500 text-emerald-500' : 'border-gray-200 text-gray-400'}`}
                >
                  {code[index] || '-'}
                </div>
              ))}
            </div>

            <label htmlFor="classroom-code" className="mb-1 block text-sm font-medium text-gray-700">课堂码</label>
            <input
              id="classroom-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={event => handleCodeChange(event.target.value)}
              disabled={isEntering}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'classroom-code-error' : undefined}
              className="input w-full text-center text-lg tracking-[0.35em]"
              placeholder="000000"
            />

            {error && <div id="classroom-code-error" role="alert" className="mt-2 text-center text-sm text-red-600">{error}</div>}
            {isEntering && (
              <div role="status" aria-live="polite" className="mt-2 flex items-center justify-center gap-2 text-sm text-primary">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />正在进入课堂...
              </div>
            )}
          </section>

          <section className="rounded-lg bg-white p-4 shadow-sm" aria-label="屏幕数字键盘">
            <div className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((digit, index) => {
                if (digit === '') return <div key={index} aria-hidden="true" />
                if (digit === 'del') {
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={handleDelete}
                      disabled={isEntering || code.length === 0}
                      className="flex h-14 items-center justify-center rounded-lg bg-gray-100 font-medium text-gray-600 hover:bg-gray-200 active:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      删除
                    </button>
                  )
                }
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleKeyPress(digit)}
                    disabled={isEntering || code.length >= 6}
                    className="h-14 rounded-lg bg-gray-50 text-xl font-medium text-gray-900 hover:bg-gray-100 active:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`输入数字 ${digit}`}
                  >
                    {digit}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={handleClear}
              disabled={isEntering || code.length === 0}
              className="mt-3 w-full py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              清空
            </button>
          </section>

          <button
            type="submit"
            disabled={code.length !== 6 || isEntering}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isEntering ? (
              <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />正在进入...</>
            ) : (
              <><Keyboard className="h-5 w-5" aria-hidden="true" />进入课堂<ArrowRight className="h-5 w-5" aria-hidden="true" /></>
            )}
          </button>
        </form>
      </div>
    </main>
  )
}

export default ClassroomEnter