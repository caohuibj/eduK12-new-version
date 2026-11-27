import { useEffect, useRef, useState } from 'react'
import api, { type ApiClientError } from '../../api/client'
import { type Product } from '../../admin/toolLicenseFocus'
import './tool-catalog-tags.css'

const endpoint = '/admin/tool-catalog-tags'
const toolTypes: Record<string, string> = {
  SCALE: '量表',
  FORM: '表单',
  COGNITIVE: '认知测评',
  SJT: '情境测评',
  COMBINATION: '普通组合',
  BUNDLE: '组合包',
}
const tagLimit = 20
const tagLength = 40
const normalized = (tag: string) => tag.normalize('NFKC').trim().replace(/\s+/gu, ' ')
type Tool = { key: string; name: string; family: string; tags: string[]; revision: number }
type Page = { list: Tool[]; hasMore: boolean }
type Filter = { q: string; tag: string; page: number }
const emptyFilter: Filter = { q: '', tag: '', page: 1 }

function catalogPath(product: Product, filter: Filter) {
  return endpoint + '?' + new URLSearchParams({
    product,
    page: String(filter.page),
    ...(filter.q ? { q: filter.q } : {}),
    ...(filter.tag ? { tag: filter.tag } : {}),
  })
}

type CatalogProps = { product: Product; onChange?: () => void }

export default function ToolCatalogTags({ product, onChange }: CatalogProps) {
  return <CatalogSession key={product} product={product} onChange={onChange}/>
}

export function ToolCatalogTagsPanel({ product, onChange }: CatalogProps) {
  const [open, setOpen] = useState(false)
  return <details className="tool-catalog-tags-panel" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>工具标签</summary>
    {open && <ToolCatalogTags product={product} onChange={onChange}/>}
  </details>
}

function CatalogSession({ product, onChange }: CatalogProps) {
  const [keyword, setKeyword] = useState('')
  const [tag, setTag] = useState('')
  const [filter, setFilter] = useState(emptyFilter)
  const [page, setPage] = useState<Page | null>(null)
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<Tool | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    let current = true
    setLoading(true)
    setPage(null)
    setLoadError('')
    void api.get<Page>(catalogPath(product, filter)).then(result => {
      if (!result.data) throw new Error('未能读取工具目录。')
      if (current) setPage(result.data)
    }).catch((error: unknown) => {
      if (current) setLoadError(error instanceof Error ? error.message : '未能读取工具目录。')
    }).finally(() => {
      if (current) setLoading(false)
    })
    return () => { current = false }
  }, [product, filter, reload])

  const search = (next: Filter) => {
    setNotice('')
    setEditing(null)
    setFilter(next)
  }
  async function save(tags: string[]) {
    if (!editing) return
    const result = await api.put<Tool>(endpoint, {
      product,
      toolKey: editing.key,
      expectedRevision: editing.revision,
      tags,
    })
    if (!result.data) throw new Error('未能确认保存结果，请刷新核对。')
    if (mounted.current) {
      setEditing(null)
      setNotice(`已保存「${result.data.name}」的标签。`)
      setReload(current => current + 1)
      onChange?.()
    }
  }

  return <section className="tool-catalog-tags" aria-label="工具标签目录">
    <p>管理本入口公共工具的标签，供检索和以后签发授权时使用。</p>
    <form className="tool-catalog-tags-filters" role="search" aria-label="检索公共工具标签"
      onSubmit={event => { event.preventDefault(); search({ q: keyword.trim(), tag: normalized(tag), page: 1 }) }}>
      <label>工具名称
        <input type="search" value={keyword} maxLength={160} disabled={Boolean(editing)} onChange={event => setKeyword(event.target.value)} placeholder="搜索名称"/>
      </label>
      <label>按标签筛选
        <input type="search" value={tag} maxLength={80} disabled={Boolean(editing)} onChange={event => setTag(event.target.value)} placeholder="输入完整标签"/>
      </label>
      <button type="submit" className="tool-catalog-tags-action" disabled={loading || Boolean(editing)}>搜索工具</button>
    </form>
    {loading && <p role="status">正在读取公共工具…</p>}
    {loadError && <div className="tool-catalog-tags-feedback"><p role="alert">{loadError}</p>
      <button type="button" onClick={() => setReload(current => current + 1)}>重试读取工具</button></div>}
    {notice && <p role="status">{notice}</p>}
    {page && (page.list.length > 0 ? <ul className="tool-catalog-tags-tools">
      {page.list.map(tool => <li key={tool.key}>
        <article aria-label={tool.name}>
          <div className="tool-catalog-tags-tool">
            <div><strong>{tool.name}</strong><small>{toolTypes[tool.family] ?? tool.family}</small></div>
            {editing?.key !== tool.key && <button type="button" disabled={Boolean(editing)}
              onClick={() => { setNotice(''); setEditing(tool) }}>编辑标签<span className="sr-only"> · {tool.name}</span></button>}
          </div>
          {editing?.key === tool.key
            ? <TagEditor key={tool.key} tool={editing} save={save} onCancel={() => setEditing(null)}
              onReload={() => { setEditing(null); setReload(current => current + 1) }}/>
            : tool.tags.length > 0 ? <ul className="tool-catalog-tags-chips" aria-label="已添加标签">
              {tool.tags.map(label => <li key={label}>{label}</li>)}
            </ul> : <small>暂无标签</small>}
        </article>
      </li>)}
    </ul> : <p>没有匹配的公共工具。</p>)}
    {page && (filter.page > 1 || page.hasMore) && <nav className="tool-catalog-tags-pagination" aria-label="工具标签分页">
      <button type="button" disabled={filter.page === 1 || Boolean(editing)}
        onClick={() => search({ ...filter, page: filter.page - 1 })}>上一页</button>
      <span>第 {filter.page} 页</span>
      <button type="button" disabled={!page.hasMore || Boolean(editing)}
        onClick={() => search({ ...filter, page: filter.page + 1 })}>下一页</button>
    </nav>}
  </section>
}

export function TagEditor({ tool, save, onCancel, onReload }: {
  tool: Pick<Tool, 'name' | 'tags'>
  save: (tags: string[]) => Promise<void>
  onCancel: () => void
  onReload: () => void
}) {
  const [tags, setTags] = useState(tool.tags)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)

  const append = () => {
    const label = normalized(input)
    if (!label) return tags
    if (tags.some(tag => tag.toLowerCase() === label.toLowerCase())) return tags
    if (Array.from(label).length > tagLength || tags.length >= tagLimit) {
      setError(`每项工具最多添加 ${tagLimit} 个标签，每个最多 ${tagLength} 个字符。`)
      return null
    }
    return [...tags, label]
  }
  const add = () => {
    setError('')
    const next = append()
    if (next) {
      setTags(next)
      setInput('')
    }
  }
  const submit = async () => {
    if (busy || stale) return
    setError('')
    const next = append()
    if (!next) return
    setBusy(true)
    try {
      await save(next)
    } catch (cause) {
      const conflict = (cause as ApiClientError)?.status === 409
      setStale(conflict)
      setError(conflict ? '工具标签已发生变化，请重新读取最新标签。' :
        cause instanceof Error ? cause.message : '保存标签未完成。')
    } finally {
      setBusy(false)
    }
  }

  return <div role="group" className="tool-catalog-tags-editor" aria-label={`编辑「${tool.name}」的标签`}>
    {tags.length > 0 && <ul className="tool-catalog-tags-chips" aria-label="待保存标签">
      {tags.map(label => <li key={label}>{label}
        <button className="tool-catalog-tags-remove" aria-label={`移除标签 ${label}`} type="button" disabled={busy || stale}
          onClick={() => { setError(''); setTags(current => current.filter(item => item !== label)) }}>×</button>
      </li>)}
    </ul>}
    <div className="tool-catalog-tags-fields">
      <label>新标签
        <input value={input} maxLength={tagLength * 2} disabled={busy || stale} placeholder="例如 新生适应"
          onChange={event => setInput(event.target.value)} onKeyDown={event => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); add() }
          }}/>
      </label>
      <button type="button" disabled={busy || stale || !normalized(input)} onClick={add}>添加标签</button>
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="tool-catalog-tags-actions">
      {stale
        ? <button type="button" onClick={onReload}>重新读取标签</button>
        : <button type="button" onClick={()=>void submit()} className="tool-catalog-tags-action" disabled={busy}>{busy ? '正在保存…' : '保存标签'}</button>}
      <button type="button" disabled={busy} onClick={onCancel}>取消</button>
    </div>
  </div>
}
