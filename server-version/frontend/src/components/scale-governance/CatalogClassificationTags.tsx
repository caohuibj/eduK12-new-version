import { CATALOG_FACET_LABELS, catalogTagLabel, type CatalogClassificationTag } from '../../api/catalogDiscovery'
import './catalog-discovery.css'

export default function CatalogClassificationTags({ tags = [] }: { tags?: CatalogClassificationTag[] }) {
  if (!tags.length) return <span className="catalog-classification-empty">尚未分类</span>
  return <span className="catalog-classification-tags" role="list" aria-label="分类标签">
    {tags.map(tag => <span key={tag.id} role="listitem" data-facet={tag.facet} title={`${CATALOG_FACET_LABELS[tag.facet]}：${catalogTagLabel(tag)}`}>
      {catalogTagLabel(tag)}
    </span>)}
  </span>
}
