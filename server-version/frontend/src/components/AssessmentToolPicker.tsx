import { useId, useRef, useState,type ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import ModalSurface from './shared-ui/ModalSurface'
import './assessment-tool-picker.css'

export interface AssessmentToolOption {
  id: string
  name: string
  description?: string | null
  version?: string | number | null
  instrumentVersion?: string | null
  configVersion?: string | null
  code?: string | null
  instrumentKey?: string | null
  testType?: string | null
  profile?: string | null
  disabled?: boolean
  unavailableReason?: string | null
}

/** Choices are supplied by an already-authorized catalog. Selecting a card
 * changes only editor selection; the existing add/publish endpoints recheck use. */
export default function AssessmentToolPicker({ options, value, onChange, label, disabled = false, more }: {
  options: readonly AssessmentToolOption[]
  value: string
  onChange: (id: string) => void
  label: string
  disabled?: boolean
  more?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const selected = options.find(option => option.id === value)
  return <div className="assessment-tool-select">
    <span className="assessment-tool-select-label">{label}</span>
    <button type="button" className="assessment-tool-trigger" disabled={disabled} onClick={() => setOpen(true)} aria-haspopup="dialog">
      <span><strong>{selected?.name || `选择${label}`}</strong><small>{selected ? '点击重新选择' : '从可用工具中检索并选择'}</small></span><Search size={19} aria-hidden="true" />
    </button>
    {selected && <p className="assessment-tool-version">{[selected.version || selected.instrumentVersion || selected.configVersion, selected.profile].filter(Boolean).join(' · ')}</p>}
    {open && !disabled && <ToolDialog key={label} options={options} value={value} label={label} titleId={titleId} more={more} onClose={() => setOpen(false)} onSelect={id => { onChange(id); setOpen(false) }} />}
  </div>
}

function ToolDialog({ options, value, label, titleId, onClose, onSelect, more }: {
  options: readonly AssessmentToolOption[]; value: string; label: string; titleId: string
  onClose: () => void; onSelect: (id: string) => void
  more?: ReactNode
}) {
  const searchRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const query = search.trim().toLocaleLowerCase()
  const filtered = options.filter(option => [option.name, option.description, option.code, option.instrumentKey, option.testType, option.profile, option.version, option.instrumentVersion, option.configVersion].some(text => String(text ?? '').toLocaleLowerCase().includes(query)))
  const totalPages = Math.max(1, Math.ceil(filtered.length / 12))
  const currentPage = Math.min(page, totalPages)
  return <ModalSurface open onClose={onClose} className="assessment-tool-modal" initialFocusRef={searchRef} dismissOnBackdrop>
    <section role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="assessment-tool-dialog">
      <header><div><h2 id={titleId}>选择{label}</h2><p>从当前账号可用的工具中选择，返回编辑页后继续配置。</p></div><button type="button" className="assessment-tool-close" aria-label="关闭工具选择" onClick={onClose}><X size={21} /></button></header>
      <div className="assessment-tool-search"><Search size={19} aria-hidden="true" /><input ref={searchRef} aria-label="检索工具" placeholder="搜索名称、编号或版本" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} /></div>
      <p className="assessment-tool-count" role="status">{query ? `找到 ${filtered.length} 项` : `共 ${filtered.length} 项可用工具`}</p>
      <div className="assessment-tool-grid">{filtered.slice((currentPage - 1) * 12, currentPage * 12).map(option => {
        const version = option.version || option.instrumentVersion || option.configVersion
        return <button type="button" key={option.id} disabled={option.disabled} className={'assessment-tool-card' + (option.id === value ? ' is-selected' : '')} aria-label={`选择 ${option.name}${version ? `，版本 ${version}` : ''}${option.disabled?'，暂不可用':''}`} onClick={() => onSelect(option.id)}>
          <span className="assessment-tool-card-kind">{label}{option.id === value && <span><Check size={14} aria-hidden="true" />已选择</span>}</span>
          <strong>{option.name}</strong>{option.description && <p>{option.description}</p>}
          {option.unavailableReason&&<p>{option.unavailableReason}</p>}
          <span className="assessment-tool-card-meta">{[version ? `版本 ${version}` : null, option.code || option.instrumentKey || option.testType, option.profile].filter(Boolean).join(' · ') || '已列入可用目录'}</span>
        </button>
      })}</div>
      {!filtered.length && <div className="assessment-tool-empty">{query ? '没有找到匹配的工具，请更换关键词。' : '暂无可选工具。请先确认工具已发布且当前账号有使用权限。'}</div>}
      {more}
      <footer><span>第 {currentPage} / {totalPages} 页</span><div><button type="button" aria-label="上一页工具" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} />上一页</button><button type="button" aria-label="下一页工具" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>下一页<ChevronRight size={16} /></button></div></footer>
    </section>
  </ModalSurface>
}
