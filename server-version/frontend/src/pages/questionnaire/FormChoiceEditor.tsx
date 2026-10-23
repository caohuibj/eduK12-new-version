import { useId, useState } from 'react'
import { ProductButton } from '../../components/product-ui'
import {FormBulkPanel} from '../../modules/assessment-core/form/FormBulkPanel'
import {FormChoiceRows} from '../../modules/assessment-core/form/FormChoiceRows'
import { choiceError, filledChoices, newChoice, type ChoiceDraft } from './formChoices'
import {parseFormBulkLines,type FormBulkLine} from '../../modules/assessment-core/form/bulkLines'
import {choiceReferenceError,planFormBulkChoices} from '../../modules/assessment-core/form/choiceSafety'
import {useFormBulkDraft,type FormPendingChange} from '../../modules/assessment-core/form/useFormBulkDraft'

type Props = {
  title: string
  prefix: string
  choices: ChoiceDraft[]
  onChange: (choices: ChoiceDraft[]) => void
  max: number
  portableKeys: boolean
  protectedKeys?: readonly string[]
  onPendingChange?: FormPendingChange
}

export function FormChoiceEditor({ title, prefix, choices, onChange, max, portableKeys, protectedKeys=[], onPendingChange }: Props) {
  const id = useId()
  const [codesVisible, setCodesVisible] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const {text:bulkText,update:setBulkText,coded,setCoded,mode,setMode,pending}=useFormBulkDraft(id,onPendingChange)
  const replace=mode==='replace'
  const [notice, setNotice] = useState(''),[referenceError,setReferenceError]=useState('')
  let lines:FormBulkLine[]=[],parseError=''
  try{lines=parseFormBulkLines(bulkText,coded)}catch(error){parseError=(error as Error).message}
  const plan=planFormBulkChoices({existing:choices,lines,mode,coded,create:(rows,label)=>newChoice(rows,prefix,label),maximum:max,protectedKeys})
  const preview=plan.next
  const bulkError=pending?(parseError||plan.error||choiceError(preview,max,portableKeys)):''
  const error = choiceError(choices, max, portableKeys)
  const safeChange=(next:ChoiceDraft[])=>{
    const problem=choiceReferenceError(choices,next,protectedKeys)
    if(problem){setReferenceError(problem);return false}
    setReferenceError('');onChange(next);return true
  }
  return <section className="qt-choices" aria-labelledby={id + '-title'}>
    <div className="qt-choices-heading">
      <h3 id={id + '-title'}>{title}<span>{filledChoices(choices).length} 项</span></h3>
      <ProductButton aria-expanded={bulkOpen} onClick={() => { setBulkOpen(!bulkOpen); setNotice('') }}>批量粘贴{title}</ProductButton>
    </div>
    <FormChoiceRows appearance="training" title={title} choices={choices} onChange={safeChange} max={max} codesVisible={codesVisible}
      createChoice={(existing,label)=>newChoice(existing,prefix,label)} validate={next=>choiceError(next,max,portableKeys)}
      onNotice={setNotice} onPasteFailure={(text,error)=>{setNotice(error);setBulkText(text);setBulkOpen(true)}}
      toolbarExtras={<><ProductButton aria-expanded={codesVisible} onClick={()=>setCodesVisible(!codesVisible)}>{codesVisible?'收起编码':'编辑编码'}</ProductButton><span>最多 {max} 项；空白行不添加。</span></>}/>
    {codesVisible && <p className="qt-form-hint">编码自动生成，排序和修改文字不会改变编码。{portableKeys ? '自定义编码以小写字母开头，可用数字、下划线和短横线，最多 80 个字符。' : '背景题请保留系统提供的编码。'}</p>}
    {referenceError&&<p className="qt-choice-error" role="alert">{referenceError}</p>}
    {error && <p className="qt-choice-error" role="alert">{error}</p>}
    {bulkOpen && <FormBulkPanel appearance="training" title={title} text={bulkText} onTextChange={setBulkText}
      mode={mode} onModeChange={setMode}
      codeFormat={{coded,onChange:setCoded}}
      help={<>从 Excel 复制一列，或粘贴每行一个{title}的文本。应用前可在下方预览。纯文字替换按行保留原编码；调整顺序时请留意选项引用。</>}
      error={bulkError} summary={!bulkError&&lines.length>0?<>识别 {lines.length} 项 · 应用后 {preview.length}/{max} 项。{replace&&'按行保留原编码；不覆盖已发布版本。'}</>:null}
      preview={lines.map(line=>({label:line.label,...(coded?{code:line.code}:{})}))}
      ready={!!lines.length} applyLabel={'应用'+(lines.length?` ${lines.length} 项`:'')}
      onApply={()=>{
        if(!safeChange(preview))return
        setNotice(`已${replace?'替换':'追加'} ${lines.length} 项，可继续逐项编辑。`)
        setBulkOpen(false);setBulkText('')
      }} onLoadExisting={()=>{setMode('replace');setBulkText(choices.filter(row=>row.label.trim()).map(row=>coded?row.value+'\t'+row.label:row.label).join('\n'))}}
      pendingNote="批量内容尚未应用。应用后，再保存题目；取消只清空本次批量输入。" secondary={{label:'取消',onClick:()=>{setBulkOpen(false);setBulkText('')}}}/>}
    {!bulkOpen&&pending&&<p className="qt-form-hint" role="status">批量内容尚未应用，请展开“批量粘贴”后应用或取消。</p>}
    {notice && <p className="qt-form-hint" role="status">{notice}</p>}
  </section>
}
