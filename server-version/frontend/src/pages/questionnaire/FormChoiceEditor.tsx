import { useId, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { ProductButton } from '../../components/product-ui'
import { choiceError, filledChoices, newChoice, parseChoicePaste, type ChoiceDraft } from './formChoices'

type Props = {
  title: string
  prefix: string
  choices: ChoiceDraft[]
  onChange: (choices: ChoiceDraft[]) => void
  max: number
  portableKeys: boolean
}

export function FormChoiceEditor({ title, prefix, choices, onChange, max, portableKeys }: Props) {
  const id = useId()
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const [codesVisible, setCodesVisible] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [coded, setCoded] = useState(false)
  const [replace, setReplace] = useState(false)
  const [notice, setNotice] = useState('')
  const existing = choices.filter(choice => choice.label.trim())
  let preview: ChoiceDraft[] = []
  let bulkError = ''
  try {
    preview = parseChoicePaste(bulkText, coded, replace ? [] : existing, prefix)
    bulkError = choiceError(replace ? preview : [...existing, ...preview], max, portableKeys)
  } catch (error) {
    bulkError = (error as Error).message
  }
  const error = choiceError(choices, max, portableKeys)
  const focus = (choice: ChoiceDraft) => requestAnimationFrame(() => inputs.current.get(choice.id)?.focus())
  const insert = (index: number) => {
    if (choices.length >= max) return
    const choice = newChoice(choices, prefix)
    onChange([...choices.slice(0, index + 1), choice, ...choices.slice(index + 1)])
    focus(choice)
  }
  const move = (index: number, direction: number) => {
    const next = [...choices]
    ;[next[index], next[index + direction]] = [next[index + direction], next[index]]
    onChange(next)
    focus(next[index + direction])
  }
  const pasteAt = (index: number, text: string) => {
    try {
      const replacingEmpty = !choices[index].label.trim()
      const keep = replacingEmpty ? choices.filter((_, i) => i !== index) : choices
      const pasted = parseChoicePaste(text, false, keep, prefix)
      const at = index + (replacingEmpty ? 0 : 1)
      const inserted = [...keep.slice(0, at), ...pasted, ...keep.slice(at)]
      // Spare blank input rows must not make a valid full-size paste exceed the limit.
      const next = inserted.length > max ? inserted.filter(choice => choice.label.trim()) : inserted
      const problem = choiceError(next, max, portableKeys)
      if (problem) throw new Error(problem)
      onChange(next)
      setNotice(`已粘贴 ${pasted.length} 项，可继续逐项编辑。`)
      if (pasted.length) focus(pasted[pasted.length - 1])
    } catch (error) {
      setNotice((error as Error).message)
      setBulkText(text)
      setBulkOpen(true)
    }
  }
  return <section className="qt-choices" aria-labelledby={id + '-title'}>
    <div className="qt-choices-heading">
      <h3 id={id + '-title'}>{title}<span>{filledChoices(choices).length} 项</span></h3>
      <ProductButton aria-expanded={bulkOpen} onClick={() => { setBulkOpen(!bulkOpen); setNotice('') }}>批量粘贴{title}</ProductButton>
    </div>
    <p id={id + '-hint'} className="qt-form-hint">每项单独填写，按 Enter 继续下一项。也可直接粘贴多行文字；逗号和等号会保留。</p>
    <ol className="qt-choice-list" aria-label={title + '列表'}>
      {choices.map((choice, index) => <li key={choice.id} className={'qt-choice-row' + (codesVisible ? ' has-code' : '')}>
        <span className="qt-choice-number" aria-hidden="true">{index + 1}</span>
        {codesVisible && <input aria-label={`${title} ${index + 1} 编码`} className="qt-choice-code" value={choice.value}
          onChange={event => onChange(choices.map((row, i) => i === index ? { ...row, value: event.target.value } : row))} />}
        <input aria-label={`${title} ${index + 1} 文字`} aria-describedby={id + '-hint'} placeholder={`填写${title} ${index + 1}`}
          ref={element => { if (element) inputs.current.set(choice.id, element); else inputs.current.delete(choice.id) }}
          value={choice.label} onChange={event => onChange(choices.map((row, i) => i === index ? { ...row, label: event.target.value } : row))}
          onKeyDown={event => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return
            event.preventDefault()
            if (index < choices.length - 1) focus(choices[index + 1]); else insert(index)
          }}
          onPaste={event => {
            const text = event.clipboardData.getData('text/plain')
            if (!/[\r\n\t]/.test(text)) return
            event.preventDefault()
            pasteAt(index, text)
          }} />
        <div className="qt-choice-actions">
          <ProductButton aria-label={`上移${title} ${index + 1}`} title="上移" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></ProductButton>
          <ProductButton aria-label={`下移${title} ${index + 1}`} title="下移" disabled={index === choices.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></ProductButton>
          <ProductButton aria-label={`删除${title} ${index + 1}`} title="删除" onClick={() => {
            const next = choices.filter((_, i) => i !== index)
            onChange(next.length ? next : [newChoice(choices, prefix)])
            if (next.length) focus(next[Math.min(index, next.length - 1)])
          }}><Trash2 size={16} /></ProductButton>
        </div>
      </li>)}
    </ol>
    <div className="qt-choice-toolbar">
      <ProductButton disabled={choices.length >= max} onClick={() => insert(choices.length - 1)}><Plus size={16} />添加{title}</ProductButton>
      <ProductButton aria-expanded={codesVisible} onClick={() => setCodesVisible(!codesVisible)}>{codesVisible ? '收起编码' : '编辑编码'}</ProductButton>
      <span>最多 {max} 项；空白行不添加。</span>
    </div>
    {codesVisible && <p className="qt-form-hint">编码自动生成，排序和修改文字不会改变编码。{portableKeys ? '自定义编码以小写字母开头，可用数字、下划线和短横线，最多 80 个字符。' : '背景题请保留系统提供的编码。'}</p>}
    {error && <p className="qt-choice-error" role="alert">{error}</p>}
    {bulkOpen && <div className="qt-choice-bulk" role="region" aria-label={'批量粘贴' + title}>
      <h3>批量录入{title}</h3>
      <p className="qt-form-hint">从 Excel 复制一列，或粘贴每行一个{title}的文本。应用前可在下方预览。</p>
      <div className="qt-choice-bulk-settings">
        <label>粘贴格式<select aria-label={title + '粘贴格式'} value={coded ? 'coded' : 'labels'} onChange={event => setCoded(event.target.value === 'coded')}>
          <option value="labels">仅文字（一列）</option><option value="coded">编码 + 文字（两列）</option>
        </select></label>
        <label>应用方式<select aria-label={title + '应用方式'} value={replace ? 'replace' : 'append'} onChange={event => setReplace(event.target.value === 'replace')}>
          <option value="append">追加到现有列表</option><option value="replace">替换当前列表</option>
        </select></label>
      </div>
      <label htmlFor={id + '-paste'}>粘贴内容</label>
      <textarea id={id + '-paste'} aria-label={title + '批量内容'} rows={5} value={bulkText} placeholder={coded ? 'yes\t是\nno\t否' : '非常不同意\n不同意\n一般\n同意\n非常同意'} onChange={event => setBulkText(event.target.value)} />
      {bulkError ? <p className="qt-choice-error" role="alert">{bulkError}</p> : preview.length > 0 && <>
        <p className="qt-form-hint">将{replace ? '替换为' : '追加'} {preview.length} 项{replace ? '（当前列表会被替换）' : `，共 ${existing.length + preview.length} 项`}。</p>
        <ol className="qt-choice-preview" aria-label={title + '粘贴预览'}>{preview.map(choice => <li key={choice.id}>{choice.label}{coded && <small>{choice.value}</small>}</li>)}</ol>
      </>}
      <div className="qt-choice-toolbar">
        <ProductButton variant="primary" disabled={!preview.length || Boolean(bulkError)} onClick={() => {
          onChange(replace ? preview : [...existing, ...preview])
          setNotice(`已${replace ? '替换' : '追加'} ${preview.length} 项，可继续逐项编辑。`)
          setBulkOpen(false); setBulkText('')
        }}>应用{preview.length ? ` ${preview.length} 项` : ''}</ProductButton>
        <ProductButton onClick={() => { setBulkOpen(false); setBulkText('') }}>取消</ProductButton>
      </div>
    </div>}
    {notice && <p className="qt-form-hint" role="status">{notice}</p>}
  </section>
}
