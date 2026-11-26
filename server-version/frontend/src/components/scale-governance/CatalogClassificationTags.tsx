import { useState } from 'react'
import { CATALOG_FACET_LABELS, catalogTagLabel, type CatalogClassificationTag } from '../../api/catalogDiscovery'
import './catalog-discovery.css'

export default function CatalogClassificationTags({ tags = [] }: { tags?: CatalogClassificationTag[] }) {
  const [expanded, setExpanded] = useState(false)
  if (!tags.length) return <span className="catalog-classification-empty">尚未分类</span>
  // Keep declared human labels and every licence constraint in the overview.
  // Source identifiers remain available without inventing translated meanings.
  const overview = new Set(tags.filter(tag => !/^[a-z][a-z0-9_-]*:[a-z0-9_.:-]+$/i.test(catalogTagLabel(tag))).slice(0, 8).map(tag => tag.id))
  for (const tag of tags) if (tag.facet === 'license') overview.add(tag.id)
  const remaining = tags.filter(tag => !overview.has(tag.id)).length
  const visible = expanded ? tags : tags.filter(tag => overview.has(tag.id))
  return <span className="catalog-classification-tags" role="list" aria-label="分类标签">
    {visible.map(tag => <span key={tag.id} role="listitem" data-facet={tag.facet} title={`${CATALOG_FACET_LABELS[tag.facet]}：${catalogTagLabel(tag)}`}>
      {catalogTagLabel(tag)}
    </span>)}
    {remaining > 0 && <button type="button" className="catalog-classification-toggle" aria-expanded={expanded}
      onClick={event => { event.preventDefault(); event.stopPropagation(); setExpanded(value => !value) }}>
      {expanded ? '收起分类标签' : `显示其余 ${remaining} 项分类`}
    </button>}
  </span>
}
