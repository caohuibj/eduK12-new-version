import type {RawScoreFeedbackContent} from '../modules/scale/rawScoreFeedback'
import {scoreSelectionSummary as sharedScoreSummary} from '../modules/assessment-core/scale/scoreSummary'
import {AssessmentImageField,type ImageAuthoringAdapter} from '../modules/assessment-media/AssessmentImageField'
import React, { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react'
import { applyScaleOptionLabels, parseScaleItemPaste, resizeScaleOptions, scaleOptionPresets } from '../modules/assessment-core/scale/authoringInput'
import type { RawScoreFeedbackRule } from '../modules/scale/rawScoreFeedback'
import { TrainingRawScoreFeedbackEditor } from './TrainingRawScoreFeedbackEditor'
import { type ScaleDefinition, type ResponseOption, type Direction, type Aggregation, responseValueToken, scoreSourceFor, updateReportContract } from './scaleDefinitionEditorModel'
import './ScaleEdit.css'

/** Definition-only editing. Persistence, product authority and navigation stay in the owning entry. */
export function ScaleDefinitionEditor({ definition, setDefinition, activeTab, readOnly, controlsDisabled, saveDefinition, mediaUploadCount = 0, onUploadBusy, mediaEnabled = true, imageAdapter, importControl, onPendingChange, renderItemMaterials, renderFeedbackContent, renderFeedbackPreview }: {
  definition: ScaleDefinition
  setDefinition: React.Dispatch<React.SetStateAction<ScaleDefinition>>
  activeTab: 'basic' | 'responses' | 'items' | 'scores' | 'report'
  readOnly: boolean
  controlsDisabled: boolean
  saveDefinition: () => void | Promise<void>
  mediaUploadCount?: number
  onUploadBusy?: (busy: boolean) => void
  mediaEnabled?: boolean
  imageAdapter?: ImageAuthoringAdapter
  importControl?: React.ReactNode
  onPendingChange?: (id:string,pending:boolean)=>void
  renderItemMaterials?: (item:ScaleDefinition['items'][number],onChange:(patch:Partial<ScaleDefinition['items'][number]>)=>void)=>React.ReactNode
  renderFeedbackContent?: (content:RawScoreFeedbackContent,onChange:(content:RawScoreFeedbackContent)=>void)=>React.ReactNode
  renderFeedbackPreview?: (content:RawScoreFeedbackContent)=>React.ReactNode
}) {
  const [itemPaste, setItemPaste] = useState('')
  const [optionPaste, setOptionPaste] = useState('')
  const pending=!!itemPaste.trim()||!!optionPaste.trim()
  useEffect(()=>{onPendingChange?.('scale-paste',pending)},[pending,onPendingChange])
  useEffect(()=>()=>onPendingChange?.('scale-paste',false),[onPendingChange])
  const [authoringNotice, setAuthoringNotice] = useState('')
  const [authoringError, setAuthoringError] = useState('')
  useEffect(() => { setAuthoringNotice(''); setAuthoringError('') }, [activeTab])
  const responseSet = definition.responseSets[0]
  const sortedItems = useMemo(() => [...definition.items].sort((a, b) => a.sortOrder - b.sortOrder), [definition.items])
  const contentItems = sortedItems.filter(item => !item.purpose || item.purpose === 'CONTENT')
  const replaceOptions = (options: ResponseOption[]) => {
    if (readOnly || controlsDisabled) return false
    const removedTarget = definition.items.find(item => item.purpose === 'ATTENTION_CHECK' && item.responseSetKey === responseSet.key && item.attentionTarget !== undefined && !options.some(option => option.value === item.attentionTarget))
    if (removedTarget) { setAuthoringError('这些选项包含注意力题的目标答案，请先修改目标答案，再减少选项。'); return false }
    setDefinition(current => ({ ...current, responseSets: [{ ...current.responseSets[0], options }, ...current.responseSets.slice(1)] }))
    setAuthoringError(''); setAuthoringNotice('选项已更新，尚未保存。')
  }
  const applyOptionText = (text = optionPaste) => {
    try { const options=applyScaleOptionLabels(responseSet.options, text); if(replaceOptions(options)!==false)setOptionPaste('') }
    catch (error) { setAuthoringError((error as Error).message) }
  }
  const pastedItems = (() => { try { return { rows: parseScaleItemPaste(itemPaste), error: '' } } catch (error) { return { rows: [], error: (error as Error).message } } })()
  const appendPastedItems = () => {
    if (readOnly || controlsDisabled || !pastedItems.rows.length || pastedItems.error) return
    if (definition.items.length + pastedItems.rows.length > 200) { setAuthoringError('量表最多 200 道题，请减少本次追加数量。'); return }
    const lastOrder = Math.max(0, ...definition.items.map(item => item.sortOrder))
    const additions = pastedItems.rows.map((row, index) => ({ itemCode: `Q_${crypto.randomUUID().replace(/-/g, '')}`, content: row.content, type: 'single', required: true, sortOrder: lastOrder + index + 1, responseSetKey: responseSet.key, randomizeOptions: false }))
    setDefinition(current => ({ ...current, items: [...current.items, ...additions], scoring: { ...current.scoring, itemRules: [...current.scoring.itemRules, ...additions.map((item, index) => ({ itemCode: item.itemCode, transform: { type: pastedItems.rows[index].reverse ? 'reverse' as const : 'identity' as const } }))] } }))
    setItemPaste(''); setAuthoringError(''); setAuthoringNotice(`已追加 ${additions.length} 道必答题，尚未保存。`)
  }
  const updateOption = (index: number, patch: Partial<ResponseOption>) => setDefinition((current) => ({ ...current, responseSets: [{ ...current.responseSets[0], options: current.responseSets[0].options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option) }, ...current.responseSets.slice(1)] }))
  const addOption = () => replaceOptions(resizeScaleOptions(responseSet.options, Math.min(50, responseSet.options.length + 1)))
  const removeOption = (index: number) => { if (responseSet.options.length > 2) replaceOptions(responseSet.options.filter((_, optionIndex) => optionIndex !== index)) }


  const addItem = (purpose: 'CONTENT' | 'ATTENTION_CHECK' | 'SOCIAL_DESIRABILITY' = 'CONTENT') => setDefinition((current) => {
    if(current.items.length>=200)return current
    const itemCode = `Q_${crypto.randomUUID().replace(/-/g, '')}`
    const ordered = [...current.items].sort((a, b) => a.sortOrder - b.sortOrder)
    const previousSetKey = ordered[ordered.length - 1]?.responseSetKey
    const sharedSet = (purpose !== 'CONTENT' && current.responseSets.find(set => set.key === previousSetKey)) || current.responseSets[0]
    return {
      ...current,
      items: [...current.items, { itemCode, content: purpose === 'SOCIAL_DESIRABILITY' ? '我从不撒谎' : purpose === 'ATTENTION_CHECK' ? `请选择「${sharedSet.options[0]?.label ?? ''}」。` : '', ...(purpose === 'CONTENT' ? {} : { purpose }), ...(purpose === 'ATTENTION_CHECK' ? { attentionTarget: sharedSet.options[0]?.value } : {}), type: 'single', required: true, sortOrder: (ordered[ordered.length - 1]?.sortOrder ?? 0) + 1, responseSetKey: sharedSet.key, randomizeOptions: false }],
      scoring: { ...current.scoring, itemRules: purpose === 'CONTENT' ? [...current.scoring.itemRules, { itemCode, transform: { type: 'identity' } }] : current.scoring.itemRules },
    }
  })
  const moveItem = (itemCode: string, delta: number) => setDefinition(current => {
    const items = [...current.items].sort((a, b) => a.sortOrder - b.sortOrder)
    const index = items.findIndex(item => item.itemCode === itemCode)
    const target = index + delta
    if (index < 0 || target < 0 || target >= items.length) return current
    ;[items[index], items[target]] = [items[target], items[index]]
    return { ...current, items: items.map((item, i) => ({ ...item, sortOrder: i + 1 })) }
  })
  const duplicateItem = (itemCode: string) => setDefinition(current => {
    if(current.items.length>=200)return current
    const items = [...current.items].sort((a, b) => a.sortOrder - b.sortOrder)
    const index = items.findIndex(item => item.itemCode === itemCode)
    if (index < 0) return current
    const copiedCode = `Q_${crypto.randomUUID().replace(/-/g, '')}`
    items.splice(index + 1, 0, { ...items[index], itemCode: copiedCode })
    const rule = current.scoring.itemRules.find(entry => entry.itemCode === itemCode)
    return { ...current, items: items.map((item, i) => ({ ...item, sortOrder: i + 1 })),
      scoring: { ...current.scoring, itemRules: rule ? [...current.scoring.itemRules, { ...rule, itemCode: copiedCode, transform: { ...rule.transform } }] : current.scoring.itemRules } }
  })
  const updateItem = (itemCode: string, patch: Partial<ScaleDefinition['items'][number]>) => setDefinition((current) => ({ ...current, items: current.items.map((item) => item.itemCode === itemCode ? { ...item, ...patch } : item) }))
  const toggleReverse = (itemCode: string) => setDefinition(current => {
    const exists = current.scoring.itemRules.some(rule => rule.itemCode === itemCode)
    const rules = exists ? current.scoring.itemRules.map(rule => rule.itemCode === itemCode ? { ...rule, transform: { type: rule.transform.type === 'reverse' ? 'identity' as const : 'reverse' as const } } : rule)
      : [...current.scoring.itemRules, { itemCode, transform: { type: 'reverse' as const } }]
    return { ...current, scoring: { ...current.scoring, itemRules: rules } }
  })

  const removeItem = (itemCode: string) => setDefinition((current) => ({ ...current, items: [...current.items].sort((a, b) => a.sortOrder - b.sortOrder).filter((item) => item.itemCode !== itemCode).map((item, index) => ({ ...item, sortOrder: index + 1 })), scoring: { ...current.scoring, itemRules: current.scoring.itemRules.filter((rule) => rule.itemCode !== itemCode), scores: current.scoring.scores.map((score) => ({ ...score, source: { ...score.source, items: score.source.items.filter((item) => item.itemCode !== itemCode) } })) } }))

  const scoreSelectionSummary = (score: ScaleDefinition['scoring']['scores'][number]) => sharedScoreSummary({
    items:contentItems.map(item=>({key:item.itemCode,scores:definition.responseSets.find(set=>set.key===item.responseSetKey)?.options.map(option=>option.score)??[]})),
    selected:score.source.items.map(item=>({key:item.itemCode,weight:item.weight})),aggregation:score.source.aggregation,precision:score.displayPrecision,
  })

  const addScore = (type: 'total' | 'dimension') => setDefinition((current) => {
    const scoreKeys = new Set(current.scoring.scores.map((score) => score.key))
    let index = current.scoring.scores.length + 1
    while (scoreKeys.has(`${type}_${index}`)) index += 1
    const key = `${type}_${index}`
    const score = { key, type, label: type === 'total' ? '总分' : `维度 ${index}`, direction: 'descriptive' as Direction, canonical: current.scoring.scores.length === 0, displayPrecision: 1, source: { type: 'items' as const, items: [] as Array<{ itemCode: string; weight: number }>, aggregation: 'sum' as Aggregation } }
    return updateReportContract({ ...current, scoring: { ...current.scoring, scores: [...current.scoring.scores, score] } })
  })
  const updateScore = (key: string, patch: Partial<ScaleDefinition['scoring']['scores'][number]>) => setDefinition((current) => updateReportContract({ ...current, scoring: { ...current.scoring, scores: current.scoring.scores.map((score) => score.key === key ? { ...score, ...patch } : score) } }))
  const toggleScoreItem = (scoreKey: string, itemCode: string) => setDefinition((current) => updateReportContract({ ...current, scoring: { ...current.scoring, scores: current.scoring.scores.map((score) => { if (score.key !== scoreKey) return score; const exists = score.source.items.some((item) => item.itemCode === itemCode); const items = exists ? score.source.items.filter((item) => item.itemCode !== itemCode) : [...score.source.items, { itemCode, weight: 1 }]; return { ...score, source: { ...score.source, items } } }) } }))
  const removeScore = (key: string) => setDefinition((current) => updateReportContract({ ...current, scoring: { ...current.scoring, scores: current.scoring.scores.filter((score) => score.key !== key) } }))
  const updateRawFeedback = (scoreKey: string, rule: RawScoreFeedbackRule | undefined) => setDefinition(current => {
    const rules = (current.report.rawScoreFeedback?.rules ?? []).filter(entry => entry.scoreKey !== scoreKey)
    if (rule) rules.push(rule)
    const report = { ...current.report }
    if (rules.length) report.rawScoreFeedback = { schemaVersion: 1, rules }
    else delete report.rawScoreFeedback
    return { ...current, report }
  })
  const updateInterpretation = (scoreKey: string, patch: { headline?: string; summary?: string }) => setDefinition((current) => ({ ...current, report: { ...current.report, interpretations: current.report.interpretations.map((entry) => entry.scoreKey === scoreKey ? { ...entry, ...patch } : entry) } }))

  return <>
      {activeTab === 'responses' && <section className="staff-panel scale-author-panel">
        <header className="scale-author-heading"><div><h2>作答选项</h2><p>设置学员看到的选项文字和对应分值，同一组选项供题目共用。</p></div><button onClick={addOption} disabled={controlsDisabled || responseSet.options.length >= 50} className="hui-button hui-button--secondary"><Plus size={17} aria-hidden="true" />增加选项</button></header>
        {definition.responseSets.length > 1 && <p className="scale-edit-multiset-note">此量表含 {definition.responseSets.length} 组响应选项；这里编辑第一组（{responseSet.key}），其余响应集将完整保留。</p>}
        {!readOnly && <div className="scale-author-bulk">
          <div className="scale-author-presets"><label>选项数量<select aria-label="选项数量" disabled={controlsDisabled} value={responseSet.options.length} onChange={event => replaceOptions(resizeScaleOptions(responseSet.options, Number(event.target.value)))}>{Array.from({ length: 49 }, (_, index) => index + 2).map(count => <option key={count} value={count}>{count} 项</option>)}</select></label><div><span>常用选项</span>{scaleOptionPresets.map(preset => <button key={preset.label} type="button" disabled={controlsDisabled} onClick={() => { const text = preset.labels.join('\n'); setOptionPaste(text); applyOptionText(text) }}>{preset.label}</button>)}</div></div>
          <label className="scale-author-paste-label">粘贴选项<textarea aria-label="选项批量内容" className="input" rows={4} maxLength={200000} disabled={controlsDisabled} value={optionPaste} onChange={event => setOptionPaste(event.target.value)} placeholder={'每行一个选项，例如：\n非常不同意\n不同意\n一般\n同意\n非常同意'} /></label>
          <div className="scale-author-bulk-footer"><p>系统标记自动处理。更新文字会保留同序选项原有分值；新增选项分值顺延，请在下方核对。</p><button type="button" disabled={controlsDisabled || !optionPaste.trim()} onClick={() => applyOptionText()} className="hui-button hui-button--secondary">应用选项文字</button></div>
        </div>}
        {authoringError && <p className="scale-author-error" role="alert">{authoringError}</p>}{authoringNotice && <p className="scale-author-notice" role="status">{authoringNotice}</p>}
        <div className="scale-option-list">{responseSet.options.map((option, index) => <div key={responseValueToken(option.value)} className="scale-option-row"><span className="scale-option-number">{index + 1}</span><label>选项文字<input aria-label={`选项 ${index + 1} 文字`} disabled={controlsDisabled} value={option.label} onChange={event => updateOption(index, { label: event.target.value })} className="input" placeholder="显示标签" /></label><label>分值<input aria-label={`选项 ${index + 1} 分值`} disabled={controlsDisabled} type="number" value={option.score} onChange={event => updateOption(index, { score: Number(event.target.value) })} className="input" /></label><button type="button" aria-label={`删除选项 ${index + 1}`} onClick={() => removeOption(index)} disabled={controlsDisabled || responseSet.options.length <= 2} className="scale-author-delete text-red-500"><Trash2 size={18} aria-hidden="true" /></button></div>)}</div>
        <footer className="scale-author-footer"><button onClick={() => void saveDefinition()} disabled={controlsDisabled || mediaUploadCount > 0 || pending} className="hui-button hui-button--primary">保存响应集</button></footer>
      </section>}

      {activeTab === 'items' && <section className="staff-panel scale-author-panel">
        <header className="scale-author-heading"><div><h2>题目录入</h2><p>题号自动排列，默认必答、正向计分。需要时可单独勾选反向计分。</p></div><button onClick={() => addItem()} disabled={controlsDisabled} className="hui-button hui-button--secondary"><Plus size={17} aria-hidden="true" />增加题目</button></header>
        {!readOnly && <div className="scale-author-bulk"><label className="scale-author-paste-label">粘贴题干<textarea aria-label="题干批量内容" className="input" rows={5} maxLength={200000} value={itemPaste} disabled={controlsDisabled} onChange={event => setItemPaste(event.target.value)} placeholder={'每行一道题，例如：\n我能专心完成学习任务\n我常常中途放弃 [反向]\n我愿意尝试新的学习方法'} /></label><div className="scale-author-bulk-footer"><div><p>首尾标记 [反向] 或 (R) 的题目按反向计分，其余默认正向。</p><p role={pastedItems.error ? 'alert' : 'status'}>{pastedItems.error || (pastedItems.rows.length ? `将追加 ${pastedItems.rows.length} 题，其中 ${pastedItems.rows.filter(row => row.reverse).length} 题反向计分；已有题目保留。` : '粘贴后预览数量，再追加到下方。')}</p></div><button type="button" className="hui-button hui-button--secondary" onClick={appendPastedItems} disabled={controlsDisabled || !pastedItems.rows.length || Boolean(pastedItems.error)}>追加题目</button></div></div>}
        {authoringError && <p className="scale-author-error" role="alert">{authoringError}</p>}{authoringNotice && <p className="scale-author-notice" role="status">{authoringNotice}</p>}
        <details className="scale-author-advanced"><summary>更多录入方式与辅助题</summary><div className="scale-author-assist"><button type="button" onClick={() => addItem('ATTENTION_CHECK')} disabled={controlsDisabled} className="hui-button hui-button--secondary">插入注意力题</button><button type="button" onClick={() => addItem('SOCIAL_DESIRABILITY')} disabled={controlsDisabled} className="hui-button hui-button--secondary">插入社会赞许性题（测谎题）</button></div><p>辅助题仅采集和导出原始作答，不纳入总分、维度分或系统内质量判断。</p>{importControl}</details>
        <div className="scale-item-list">{sortedItems.map((item, itemIndex) => { const rule = definition.scoring.itemRules.find(candidate => candidate.itemCode === item.itemCode); return <article key={item.itemCode} className="scale-item-card">
          <div className="scale-item-top"><strong>第 {itemIndex + 1} 题</strong><span>{item.required ? '必答' : '选答'}{item.purpose === 'ATTENTION_CHECK' ? ' · 注意力题' : item.purpose === 'SOCIAL_DESIRABILITY' ? ' · 社会赞许性题' : ''}</span></div>
          <textarea aria-label={`第 ${itemIndex + 1} 题题干`} disabled={controlsDisabled} value={item.content} onChange={event => updateItem(item.itemCode, { content: event.target.value })} className="input" placeholder="题目内容" />
          {renderItemMaterials?.(item,patch=>updateItem(item.itemCode,patch))}
          {imageAdapter&&<AssessmentImageField adapter={imageAdapter} images={item.images} disabled={controlsDisabled} onBusy={onUploadBusy} legend="题目图片（可选）" uploadLabel="上传题目图片" description="题目图片与报告反馈图片独立保存；仅可使用当前工具内有权使用的静态图片。" allowCaption onChange={images=>updateItem(item.itemCode,{images})}/>}
          <div className="scale-item-controls">{(!item.purpose || item.purpose === 'CONTENT') && <label><input type="checkbox" checked={rule?.transform.type === 'reverse'} disabled={controlsDisabled} onChange={() => toggleReverse(item.itemCode)} />反向计分</label>}
            {item.purpose === 'ATTENTION_CHECK' && <label>注意力题目标选项<select aria-label={`目标选项 ${item.itemCode}`} className="input" disabled={controlsDisabled} value={item.attentionTarget === undefined ? '' : responseValueToken(item.attentionTarget)} onChange={event => { const option = definition.responseSets.find(set => set.key === item.responseSetKey)?.options.find(option => responseValueToken(option.value) === event.target.value); updateItem(item.itemCode, { attentionTarget: option?.value }) }}><option value="">请选择目标选项</option>{definition.responseSets.find(set => set.key === item.responseSetKey)?.options.map(option => <option key={responseValueToken(option.value)} value={responseValueToken(option.value)}>{option.label}</option>)}</select></label>}
            <div className="scale-item-actions"><button type="button" aria-label={`上移 ${item.itemCode}`} onClick={() => moveItem(item.itemCode, -1)} disabled={controlsDisabled || itemIndex === 0} title="上移"><ArrowUp size={17} /></button><button type="button" aria-label={`下移 ${item.itemCode}`} onClick={() => moveItem(item.itemCode, 1)} disabled={controlsDisabled || itemIndex === sortedItems.length - 1} title="下移"><ArrowDown size={17} /></button><button type="button" aria-label={`复制 ${item.itemCode}`} onClick={() => duplicateItem(item.itemCode)} disabled={controlsDisabled}><Copy size={17} />复制</button><button type="button" aria-label={`删除题目 ${itemIndex + 1}`} onClick={() => removeItem(item.itemCode)} disabled={controlsDisabled} className="scale-author-delete"><Trash2 size={17} />删除</button></div>
          </div>
        </article> })}</div>
        <footer className="scale-author-footer"><p>新增题目请在“计分”中选择纳入的计分项。</p><button onClick={() => void saveDefinition()} disabled={controlsDisabled || mediaUploadCount > 0 || pending} className="hui-button hui-button--primary">保存题目</button></footer>
      </section>}

      {activeTab === 'scores' && <section className="staff-panel scale-scoring-panel" aria-labelledby="scale-scoring-title">
        <header className="scale-scoring-header">
          <div><h2 id="scale-scoring-title">计分定义</h2><p>为总分或维度分选择题目，并设置计分方式。新增计分项默认不选题。</p></div>
          <div className="scale-scoring-actions"><button onClick={() => addScore('total')} disabled={controlsDisabled || contentItems.length === 0} className="hui-button hui-button--secondary">+ 总分</button><button onClick={() => addScore('dimension')} disabled={controlsDisabled || contentItems.length === 0} className="hui-button hui-button--secondary">+ 维度</button></div>
        </header>
        <div className="scale-score-list">{definition.scoring.scores.map((score, index) => <article key={score.key} className="scale-score-card" aria-label={`计分项 ${score.label}`}>
          <div className="scale-score-heading"><span>{score.type === 'total' ? '总分' : '维度分'} · {index + 1}</span><details className="scale-score-identity"><summary>系统标识</summary><code>{score.key}</code></details><button type="button" aria-label={`删除计分项 ${score.label}`} onClick={() => removeScore(score.key)} disabled={controlsDisabled} className="scale-score-delete"><Trash2 size={18} aria-hidden="true" />删除</button></div>
          <div className="scale-score-fields">
            <label className="scale-score-field">显示名称
              <input disabled={controlsDisabled} value={score.label} onChange={event => updateScore(score.key, { label: event.target.value })} className="input" placeholder="输入报告中显示的名称，如：学习投入总分" />
              <small>报告中显示的总分或维度名称，可自行修改。</small>
            </label>
            <label className="scale-score-field">分数方向
              <select disabled={controlsDisabled} value={score.direction} onChange={event => updateScore(score.key, { direction: event.target.value as Direction })} className="input"><option value="descriptive">描述性</option><option value="higher_is_more">高分代表更多</option><option value="higher_is_worse">高分代表更多困难</option><option value="higher_is_better">高分更有利</option><option value="lower_is_better">低分更有利</option><option value="bipolar">双向</option></select>
              <small>记录分数含义，不自动改变分值或报告文案。</small>
            </label>
          </div>
          <div className="scale-score-settings">
            <div className="scale-score-primary"><label><input type="checkbox" checked={score.canonical} disabled={controlsDisabled} onChange={event => updateScore(score.key, { canonical: event.target.checked })} />主要计分项</label><p>勾选：作为报告主要指标，并参与结果有效性判断。<br />未勾选：仍会计分，作为辅助指标。至少保留一个主要计分项。</p></div>
            {!readOnly && <label className="scale-score-field scale-score-aggregation">聚合方式<select disabled={controlsDisabled} value={score.source.aggregation} onChange={event => updateScore(score.key, { source: { ...score.source, aggregation: event.target.value as Aggregation } })} className="input"><option value="sum">求和</option><option value="mean">平均</option></select><small>新建默认求和，可改为平均。求和是分数相加，平均是相加后除以题目数。</small></label>}
            {readOnly && score.source.aggregation !== 'sum' && <p className="scale-score-fixed-method">计分方式：平均（当前版本已固定）</p>}
          </div>
          <div className="scale-score-items"><h3>纳入计分的题目</h3><p role="status">{scoreSelectionSummary(score)}</p><div className="scale-score-item-options">{contentItems.map(item => <button type="button" key={item.itemCode} aria-pressed={scoreSourceFor(definition, score.key).some(candidate => candidate.itemCode === item.itemCode)} disabled={controlsDisabled} onClick={() => toggleScoreItem(score.key, item.itemCode)}><span aria-hidden="true">{scoreSourceFor(definition, score.key).some(candidate => candidate.itemCode === item.itemCode) ? '☑ ' : '☐ '}</span>{item.itemCode}</button>)}</div></div>
        </article>)}</div>
        {!definition.scoring.scores.length && <p className="scale-score-empty">尚未设置计分项。请先添加总分或维度分，再选择参与计分的题目。</p>}
        <footer className="scale-scoring-footer"><p>保存前请核对纳入题目、分数范围和报告文案。</p><button onClick={() => void saveDefinition()} disabled={controlsDisabled || mediaUploadCount > 0 || pending} className="hui-button hui-button--primary">保存计分定义</button></footer>
      </section>}


      {activeTab === 'report' && <section className="staff-panel staff-panel--padded p-6"><label className="block text-sm text-gray-700">自有内容 / 授权声明<textarea disabled={controlsDisabled} value={definition.license.note || ''} onChange={(event) => setDefinition((current) => ({ ...current, license: { ...current.license, note: event.target.value } }))} className="input mt-1 w-full min-h-20" placeholder="说明题目内容由谁提供，以及允许在本系统中使用的范围" /></label><p className="scale-edit-multiset-note">授权声明属于量表定义，请使用“保存报告定义”或“保存草稿”保存。</p><h2 className="font-semibold mb-2">量表专属解释</h2><p className="text-sm text-gray-500 mb-5">自定义量表仅能写描述性解释；可按原始总分或维度分设置区间图文反馈；不提供正常/异常、常模或百分位配置。</p><div className="space-y-4">{definition.scoring.scores.map((score) => { const entry = definition.report.interpretations.find((candidate) => candidate.scoreKey === score.key); if (!entry) return null; return <article key={score.key} className="border rounded-lg p-4 space-y-2"><h3 className="font-medium">{score.label}</h3><input disabled={controlsDisabled} value={entry.headline} onChange={(event) => updateInterpretation(score.key, { headline: event.target.value })} className="input w-full" placeholder="标题" /><textarea disabled={controlsDisabled} value={entry.summary} onChange={(event) => updateInterpretation(score.key, { summary: event.target.value })} className="input w-full min-h-20" placeholder="描述性解释" /><TrainingRawScoreFeedbackEditor renderContent={renderFeedbackContent} renderPreview={renderFeedbackPreview} imageAdapter={imageAdapter} mediaEnabled={mediaEnabled} onUploadBusy={onUploadBusy} scoreKey={score.key} rule={definition.report.rawScoreFeedback?.rules.find(rule => rule.scoreKey === score.key)} disabled={controlsDisabled} onChange={rule => updateRawFeedback(score.key, rule)} /></article> })}</div><label className="block text-sm text-gray-700 mt-5">免责声明<textarea disabled={controlsDisabled} value={definition.report.disclaimer} onChange={(event) => setDefinition((current) => ({ ...current, report: { ...current.report, disclaimer: event.target.value } }))} className="input mt-1 w-full min-h-20" /></label><div className="flex justify-end mt-5"><button onClick={() => void saveDefinition()} disabled={controlsDisabled || mediaUploadCount > 0 || pending} className="hui-button hui-button--primary">保存报告定义</button></div></section>}

  </>
}
