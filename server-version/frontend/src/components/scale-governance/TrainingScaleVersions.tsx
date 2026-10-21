import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../../api/client'
type ScaleVersion = { id: string; name: string; status: string; authoringVersion?: number; authoringFamilyId?: string; measurementReleaseId?: string | null }
export function TrainingScaleVersions({ sourceId }: { sourceId: string }) {
  const [list, setList] = useState<ScaleVersion[] | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false)
  const generation = useRef(0)
  useEffect(() => () => { generation.current++ }, [sourceId])
  const load = async () => {
    const current = ++generation.current; setLoading(true); setError('')
    try { const response = await apiClient.get<{ list: ScaleVersion[] }>(`/scales/${encodeURIComponent(sourceId)}/versions`); if (current !== generation.current) return; if (response.code !== 0 || !response.data) throw new Error(response.message || '版本历史读取失败'); setList(response.data.list) }
    catch (failure) { if (current === generation.current) setError(failure instanceof Error ? failure.message : '版本历史读取失败') }
    finally { if (current === generation.current) setLoading(false) }
  }
  return <section className="scale-edit-source" aria-label="同量表版本历史"><button type="button" className="hui-button hui-button--secondary" disabled={loading} onClick={() => void load()}>查看同量表版本历史</button><p>版本彼此独立冻结；修订不会自动替换旧任务、问卷或报告的绑定版本。</p>{error && <p role="alert">{error}</p>}{list && <ul>{list.map(row => <li key={row.id}><Link to={'/scales/' + encodeURIComponent(row.id)}>{row.name} · v{row.authoringVersion ?? 1}</Link> · {row.status === 'PUBLISHED' ? '已发布 · 只读' : row.status === 'DRAFT' ? '草稿' : row.status}{row.measurementReleaseId && <span className="block break-all text-sm">发布标识：{row.measurementReleaseId}</span>}</li>)}</ul>}</section>
}
