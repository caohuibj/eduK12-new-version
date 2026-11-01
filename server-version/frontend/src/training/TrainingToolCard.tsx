import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Brain, ChevronDown, ClipboardList, FileText, Layers, MessageSquareText, Wrench } from 'lucide-react'
import './training-toolkit-compact.css'
import CatalogClassificationTags from '../components/scale-governance/CatalogClassificationTags'
import type {CatalogClassificationTag} from '../api/catalogDiscovery'

export type TrainingToolRow = {
  id: string; name: string; kind: string; description?: string
  source: 'owned' | 'granted'; status?: string; version?: string; updatedAt?: string; href?: string
  canUpdateVersion?: boolean
  classificationTags?:CatalogClassificationTag[]
}
const labels: Record<string, string> = {
  scale: '量表', form: '表单', 'form-composition': '表单内容', 'form-template': '表单',
  situational: '情境判断', 'sjt-draft': '情境判断', cognitive: '认知测验',
  composition: '普通组合问卷', bundle: '打包组合问卷 · 综合报告',
}
const statuses: Record<string, string> = { DRAFT: '草稿', PUBLISHED: '已发布', IN_REVIEW: '审核中', REJECTED: '待修订', DEPRECATED: '已停用', RETIRED: '已停用' }

/** Compact catalog presentation. Actions retain the original server-provided eligibility. */
export default function TrainingToolCard({ row, busy, onUpdateVersion }: { row: TrainingToolRow; busy: boolean; onUpdateVersion: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const key = row.kind + '-' + row.id
  const titleId = 'resource-' + key, detailId = 'resource-details-' + key
  const versionable = row.canUpdateVersion === true && row.source === 'owned' && row.status === 'PUBLISHED'
    && ['scale', 'form', 'composition', 'form-composition'].includes(row.kind)
  const unavailable = ['situational', 'sjt-draft', 'cognitive'].includes(row.kind)
  const isFormContent = ['form', 'form-composition'].includes(row.kind)
  const Icon = row.kind === 'scale' ? ClipboardList : row.kind === 'cognitive' ? Brain
    : ['situational', 'sjt-draft'].includes(row.kind) ? MessageSquareText
      : ['composition', 'bundle'].includes(row.kind) ? Layers : row.kind.includes('form') ? FileText : Wrench
  const date = row.updatedAt ? new Date(row.updatedAt) : null
  const hasDate = date && !Number.isNaN(date.getTime())
  return <article className={'training-tool-card' + (expanded ? ' is-expanded' : '')} aria-labelledby={titleId}>
    <div className="training-tool-row">
      <span className="training-tool-icon" aria-hidden="true"><Icon size={19} /></span>
      <div className="training-tool-copy">
        <h2 id={titleId} title={row.name}>{row.name}</h2>
        <div className="training-tool-meta">
          <span>{labels[row.kind] || '工具'}</span>
          <span>{row.source === 'owned' ? '我编制的' : '已获授权'}</span>
          {row.status && <span className={'training-tool-status is-' + row.status.toLowerCase()}>{statuses[row.status] || row.status}</span>}
          {unavailable && <span>{row.kind === 'sjt-draft' ? '暂不开放编辑' : '仅供组合问卷选用'}</span>}
        </div>
        <CatalogClassificationTags tags={row.classificationTags}/>
      </div>
      <div className="training-tool-actions">
        {row.kind === 'bundle'
          ? <Link className="training-tool-primary" to={row.href?.startsWith('/bundle-products/') ? row.href : '/bundle-products'}>查看与使用<ArrowRight size={15} aria-hidden="true" /></Link>
          : !unavailable && (isFormContent
            ? <button type="button" className="training-tool-primary" disabled={busy} onClick={onUpdateVersion}>存为独立表单<ArrowRight size={15} aria-hidden="true" /></button>
            : <Link className="training-tool-primary" to={row.kind === 'composition' ? '/questionnaire-products/' + row.id : row.href || '/toolkit'}>
              {row.kind === 'composition' ? row.status === 'DRAFT' ? '编辑组合问卷' : '查看组合问卷' : row.source === 'owned' && row.status === 'DRAFT' ? '编辑' : row.source === 'granted' ? '查看与使用' : '查看'}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>)}
        <button type="button" className="training-tool-toggle" aria-label={(expanded ? '收起详情：' : '展开详情：') + row.name} aria-expanded={expanded} aria-controls={detailId} onClick={() => setExpanded(value => !value)}>
          {expanded ? '收起' : '详情'}<ChevronDown size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
    {expanded && <section className="training-tool-details" id={detailId} aria-label={row.name + '的详情'}>
      {row.description && <p className="training-tool-description">{row.description}</p>}
      {row.kind === 'composition' && <p>各测评单独出报告</p>}
      {row.kind === 'bundle' && <p>综合报告 · 测评内容与分析规则固定</p>}
      {!row.description && !['composition', 'bundle'].includes(row.kind) && <p>暂无补充说明。</p>}
      {(row.version || hasDate) && <dl className="training-tool-facts">
        {row.version && <div><dt>{['composition', 'form-composition', 'form-template'].includes(row.kind) ? '修订' : '版本'}</dt><dd>{row.version}</dd></div>}
        {hasDate && <div><dt>更新于</dt><dd><time dateTime={row.updatedAt}>{date.toLocaleDateString('zh-CN')}</time></dd></div>}
      </dl>}
      {((row.kind === 'composition' && row.href) || (versionable && !isFormContent)) && <div className="training-tool-secondary-actions">
        {row.kind === 'composition' && row.href && <Link to={row.href}>配置与报告<ArrowRight size={14} aria-hidden="true" /></Link>}
        {versionable && !isFormContent && <button type="button" disabled={busy} onClick={onUpdateVersion}>更新版本</button>}
      </div>}
    </section>}
  </article>
}
