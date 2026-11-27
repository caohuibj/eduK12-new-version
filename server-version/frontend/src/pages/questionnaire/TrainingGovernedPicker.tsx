import { useRef, useState } from 'react'
import api from '../../api/client'
import { ProductButton } from '../../components/product-ui'
import { apiErrorMessage } from '../../utils/apiErrorMessage'

export type TrainingGovernedChoice = { id: string; name: string; family: 'FORM' | 'COMBINATION'; version: string; hash: string }

export function TrainingGovernedPicker({ selected, onSelect }: {
  selected: TrainingGovernedChoice | null; onSelect: (choice: TrainingGovernedChoice | null) => void
}) {
  const [q, setQuery] = useState('')
  const [applied, setApplied] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<{ list: TrainingGovernedChoice[]; hasMore: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  const load = async (query: string, nextPage: number) => {
    const current = ++request.current
    setBusy(true)
    setError('')
    try {
      const response = await api.get<{list: TrainingGovernedChoice[]; hasMore: boolean}>(
        '/questionnaire-products/governed-sources?' + new URLSearchParams({ q: query, page: String(nextPage) }).toString())
      if (response.code !== 0) throw response
      if (current !== request.current) return
      setResult(response.data)
      setApplied(query)
      setPage(nextPage)
    } catch (cause) {
      if (current === request.current) setError(apiErrorMessage(cause))
    } finally {
      if (current === request.current) setBusy(false)
    }
  }

  return <details className="qt-advanced">
    <summary>选用已批准的公共表单或组合</summary>
    <div className="qt-advanced-body">
      <label>搜索平台工具<input type="search" value={q} maxLength={120} onChange={event => setQuery(event.target.value)} /></label>
      <ProductButton disabled={busy} onClick={() => void load(q.trim(), 1)}>查找工具</ProductButton>
      {busy && <p role="status">正在查找平台工具…</p>}
      {error && <p role="alert">{error}</p>}
      {result && <><ul>{result.list.map(choice => <li key={choice.id}>
        <ProductButton disabled={busy} aria-pressed={selected?.id === choice.id} onClick={() => onSelect(choice)}>
          {choice.name} · {choice.family === 'FORM' ? '表单' : '普通组合'} · {choice.version}
        </ProductButton>
      </li>)}</ul>{!result.list.length && <p>没有匹配的 Training 公共工具。</p>}
      {(page > 1 || result.hasMore) && <nav aria-label="平台工具分页">
        <ProductButton disabled={page === 1 || busy} onClick={() => void load(applied, page - 1)}>上一页</ProductButton>
        <ProductButton disabled={!result.hasMore || busy} onClick={() => void load(applied, page + 1)}>下一页</ProductButton>
      </nav>}</>}
      {selected && <p>已选 {selected.name} · {selected.version} <ProductButton onClick={() => onSelect(null)}>清除选择</ProductButton></p>}
    </div>
  </details>
}
