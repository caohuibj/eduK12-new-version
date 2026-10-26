import { Search } from 'lucide-react'
import {
  CATALOG_FACETS, CATALOG_FACET_LABELS, EMPTY_CATALOG_FILTERS, catalogTagLabel,
  type CatalogFilters, type CatalogOrigin, type CatalogTagFacets,
} from '../../api/catalogDiscovery'
import './catalog-discovery.css'

type Props = {
  filters: CatalogFilters
  facets: CatalogTagFacets
  onChange: (filters: CatalogFilters) => void
  onApply: (filters: CatalogFilters) => void
  includeOrigin?: boolean
  disabled?: boolean
  label?: string
  showKeyword?: boolean
}

export default function CatalogDiscoveryFilters({ filters, facets, onChange, onApply, includeOrigin = false, disabled = false, label = '量表目录检索', showKeyword = true }: Props) {
  return <form className="catalog-discovery" role="search" aria-label={label} onSubmit={event => { event.preventDefault(); onApply(filters) }}>
    <fieldset disabled={disabled}>
      <legend className="sr-only">工具分类与关键词</legend>
      {showKeyword&&<label className="catalog-discovery-keyword">关键词
        <input type="search" maxLength={100} value={filters.keyword} onChange={event => onChange({ ...filters, keyword: event.target.value })} placeholder="搜索名称、编号或标签" />
      </label>}
      {CATALOG_FACETS.map(facet => <label key={facet}>{CATALOG_FACET_LABELS[facet]}
        <select value={filters[facet]??''} onChange={event => onChange({ ...filters, [facet]: event.target.value })}>
          <option value="">全部{CATALOG_FACET_LABELS[facet]}</option>
          {(facets[facet] ?? []).map(tag => <option key={tag.id} value={tag.id}>{catalogTagLabel(tag)}</option>)}
        </select>
      </label>)}
      {includeOrigin && <label>入库来源
        <select value={filters.origin} onChange={event => onChange({ ...filters, origin: event.target.value as CatalogOrigin })}>
          <option value="ALL">全部来源</option><option value="STANDARD_REGISTRY">注册工具库</option><option value="AUTHORED">私有工具申请入库</option>
        </select>
      </label>}
      <div className="catalog-discovery-actions">
        <button type="submit"><Search size={16} aria-hidden="true" />检索</button>
        <button type="button" onClick={() => { onChange({ ...EMPTY_CATALOG_FILTERS }); onApply({ ...EMPTY_CATALOG_FILTERS }) }}>清除筛选</button>
      </div>
    </fieldset>
    <p className="catalog-discovery-hint">在全部可见目录中检索，分类与关键词同时生效。修改条件后点击“检索”。分类资料不代表使用许可、科学成熟度或版本批准。</p>
  </form>
}
