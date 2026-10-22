import { useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, FileText, ListOrdered, Pencil, Plus, Trash2 } from 'lucide-react'
import { ProductButton } from '../../components/product-ui'

interface FormItem {
  id: string
  formLabel: string
  formType: string
  required?: boolean
  formSectionId?: string
}
interface FormSection {
  id: string
  label: string
  contextSection?: boolean
  items: FormItem[]
}
interface Props {
  isNew: boolean
  name: string
  dirty: boolean
  draft: boolean
  busy: boolean
  locked: boolean
  sections: FormSection[]
  editingQuestionId?: string
  basicSettings: ReactNode
  questionControls: ReactNode
  onEdit: (item: FormItem) => void
  onMove: (index: number, direction: number) => void
  onRemove: (itemId: string) => void
  onRemoveSection: (sectionId: string) => void
}
const questionTypes: Record<string, string> = {
  text_input: '文本', fill_blank: '填空', single_choice: '单选', multiple_choice: '多选',
  year_month: '年月', number: '数值', long_text: '长文本', date: '日期', time: '时间',
  likert: 'Likert', matrix: '矩阵单选', matrix_multiple: '矩阵多选', rank_order: '排序',
  slider: '滑块', constant_sum: '恒定总和',
}

export function FormTemplateWorkspace({ isNew, name, dirty, draft, busy, locked, sections,
  editingQuestionId, basicSettings, questionControls, onEdit, onMove, onRemove, onRemoveSection }: Props) {
  const [infoOpen, setInfoOpen] = useState(isNew)
  const disabled = busy || dirty || locked
  const count = sections.reduce((total, section) => total + section.items.length, 0)
  return <fieldset disabled={locked} className="qt-form-template-workspace">
    <details className="qt-form-info" open={infoOpen} onToggle={event => setInfoOpen(event.currentTarget.open)}>
      <summary><FileText size={19} aria-hidden="true"/><span className="qt-form-info-title"><strong>{name || '为表单起个名字'}</strong><small>表单信息{dirty ? ' · 有未保存的修改' : ' · 名称、描述与指导语'}</small></span><span className="qt-form-info-action">{infoOpen ? '收起信息' : '编辑信息'}<ChevronDown size={16} aria-hidden="true"/></span></summary>
      <div className="qt-form-info-fields">{isNew && <p>先填写名称并点击“创建草稿”，就可以开始添加题目。</p>}{basicSettings}<p className="qt-form-help">名称便于查找；指导语会展示给学员。{!isNew && '修改后请点击页面上方的“保存表单信息”。'}</p></div>
    </details>
    {!isNew && <section className="qt-form-content" aria-labelledby="questionnaire-content">
      <header className="qt-form-content-heading"><div><span className="qt-form-eyebrow">编制表单</span><h2 id="questionnaire-content" tabIndex={-1}>题目编辑 <span>{count} 道题目</span></h2><p>从目录选择已有题目，或在编辑区添加新题。</p></div><span className="qt-form-save-note"><span/>添加、移除与排序成功后即保存</span></header>
      {dirty && <p role="status" className="qt-note">表单信息尚未保存。请先点击“保存表单信息”，再编辑题目。</p>}
      <div className="qt-form-builder">
        <aside className="qt-form-directory" aria-label="表单题目目录">
          <header><ListOrdered size={18} aria-hidden="true"/><h3>题目目录</h3><span>{count}</span></header>
          {sections.length ? <ol className="qt-form-sections">{sections.map((section, index) => <li key={section.id}>
            <div className="qt-form-section-heading"><strong>{section.label}</strong>{draft && <div className="qt-form-order-actions">
              <ProductButton aria-label={`上移区段：${section.label}`} title="上移区段" disabled={disabled || Boolean(editingQuestionId) || index === 0 || Boolean(sections[index - 1]?.contextSection)} onClick={() => onMove(index, -1)}><ArrowUp size={14}/></ProductButton>
              <ProductButton aria-label={`下移区段：${section.label}`} title="下移区段" disabled={disabled || Boolean(editingQuestionId) || index === sections.length - 1 || section.contextSection || Boolean(sections[index + 1]?.contextSection)} onClick={() => onMove(index, 1)}><ArrowDown size={14}/></ProductButton>
            </div>}</div>
            <ol className="qt-form-questions">{section.items.map((item, itemIndex) => <li key={item.id}>
              <ProductButton className="qt-form-question" aria-label={`编辑题目：${item.formLabel}`} aria-pressed={editingQuestionId === item.id} disabled={!draft || disabled || Boolean(editingQuestionId)} onClick={() => onEdit({ ...item, formSectionId: section.id })}><span className="qt-form-question-number">{sections.slice(0, index).reduce((total, previous) => total + previous.items.length, 0) + itemIndex + 1}</span><span><strong>{item.formLabel}</strong><small>{questionTypes[item.formType] || '表单题'} · {item.required === false ? '选填' : '必填'}</small></span><Pencil size={14} aria-hidden="true"/></ProductButton>
              {draft && <ProductButton className="qt-form-remove" aria-label={`移除题目：${item.formLabel}`} title="移除题目" disabled={disabled || Boolean(editingQuestionId)} onClick={() => onRemove(item.id)}><Trash2 size={14}/></ProductButton>}
            </li>)}</ol>
            {!section.items.length && <><p className="qt-form-help">这个区段还没有题目。</p>{draft && <ProductButton disabled={disabled || Boolean(editingQuestionId)} onClick={() => onRemoveSection(section.id)}>移除空区段</ProductButton>}</>}
          </li>)}</ol> : <div className="qt-form-directory-empty"><FileText size={28} aria-hidden="true"/><strong>还没有题目</strong><p>在编辑区写下第一道题，<br/>添加后会出现在这里。</p></div>}
          <p className="qt-form-directory-help">{editingQuestionId ? '保存或取消当前修改后，可选择其他题目。' : '点击题目即可编辑；区段顺序可用上下箭头调整。'}</p>
        </aside>
        <section className="qt-form-question-editor" aria-label={editingQuestionId ? '当前题目编辑区' : '新题目编辑区'}>
          <header><span className="qt-form-editor-icon">{editingQuestionId ? <Pencil size={20}/> : <Plus size={20}/>}</span><div><h3>{editingQuestionId ? '编辑题目' : draft ? '添加新题' : '表单内容'}</h3><p>{editingQuestionId ? '修改后点击“保存题目修改”；取消编辑会放弃本次修改。' : '填写题目文字，选择题型，最后点击“添加题目”。'}</p></div></header>
          {draft ? <div className="qt-form-question-fields">{questionControls}</div> : <p className="qt-form-help">当前版本不可编辑。</p>}
        </section>
      </div>
    </section>}
    <p className="qt-form-help qt-form-library-note">表单保存在“工具 → 表单”。组合问卷选用后获得独立副本，后续修改不会影响已选用的副本。</p>
  </fieldset>
}
