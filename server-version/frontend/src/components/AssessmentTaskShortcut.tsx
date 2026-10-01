import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../api/client'

export default function AssessmentTaskShortcut() {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    void apiClient.get<{ pendingCount: number }>('/my-assessments').then(response => {
      if (active && response.code === 0 && Number.isFinite(response.data?.pendingCount)) setCount(response.data.pendingCount)
    }).catch(() => { if (active) setCount(null) })
    return () => { active = false }
  }, [])
  return <aside className="mx-auto my-4 flex max-w-7xl flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
    <span>待完成测评{count === null ? '' : `：${count}`}</span><Link to="/my-assessments">进入我的测评</Link>
  </aside>
}
