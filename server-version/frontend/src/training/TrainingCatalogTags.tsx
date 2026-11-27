import { useEffect, useState } from 'react'
import apiClient from '../api/client'
import './training-catalog-controls.css'

export default function TrainingCatalogTags({ id, kind, tags = [], onSaved }: {
  id: string
  kind: string
  tags?: string[]
  onSaved: (tags: string[]) => void
}) {
  const tagText = tags.join(', ')
  const [draft, setDraft] = useState(tagText)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => setDraft(tagText), [tagText])

  async function save() {
    if (busy) return
    const values = [...new Set(draft.split(/[,，]/).map(value => value.trim()).filter(Boolean))]
    if (values.length > 10 || values.some(value => value.length > 20)) {
      setError('最多 10 个标签，每个最多 20 个字')
      return
    }
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      const response = await apiClient.post<{ tags: string[] }>('/questionnaire-products/' + encodeURIComponent(id) + '/catalog-tags', {
        kind, tags: values, expectedTags: tags,
      })
      if (response.code !== 0) throw new Error(response.message || '保存失败')
      if (!Array.isArray(response.data?.tags)) throw new Error('无法确认保存结果，请刷新核对。')
      setSaved(true)
      onSaved(response.data.tags)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return <details className="training-catalog-tags">
    <summary>管理标签{tags.length ? ' · ' + tags.join(' / ') : ''}</summary>
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <label>标签
        <input aria-label="测评标签" value={draft} maxLength={209} placeholder="用逗号分隔，如：课前, 第一期" disabled={busy}
          onChange={event => { setDraft(event.target.value); setSaved(false) }}/>
      </label>
      <button type="submit" disabled={busy}>{busy ? '保存中…' : '保存标签'}</button>
      <p>标签用于查找，保存后适用于该测评在所有课程中的管理列表。</p>
      {saved && <p role="status">标签已保存。</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  </details>
}
