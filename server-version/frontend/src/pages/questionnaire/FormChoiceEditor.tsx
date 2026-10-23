import { useId, useState } from 'react'
import { ProductButton } from '../../components/product-ui'
import {FormBulkPanel} from '../../modules/assessment-core/form/FormBulkPanel'
import {FormChoiceRows} from '../../modules/assessment-core/form/FormChoiceRows'
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
  return <section className="qt-choices" aria-labelledby={id + '-title'}>
    <div className="qt-choices-heading">
      <h3 id={id + '-title'}>{title}<span>{filledChoices(choices).length} 项</span></h3>
      <ProductButton aria-expanded={bulkOpen} onClick={() => { setBulkOpen(!bulkOpen); setNotice('') }}>批量粘贴{title}</ProductButton>
    </div>
    <FormChoiceRows appearance="training" title={title} choices={choices} onChange={onChange} max={max} codesVisible={codesVisible}
      createChoice={(existing,label)=>newChoice(existing,prefix,label)} validate={next=>choiceError(next,max,portableKeys)}
      onNotice={setNotice} onPasteFailure={(text,error)=>{setNotice(error);setBulkText(text);setBulkOpen(true)}}
      toolbarExtras={<><ProductButton aria-expanded={codesVisible} onClick={()=>setCodesVisible(!codesVisible)}>{codesVisible?'收起编码':'编辑编码'}</ProductButton><span>最多 {max} 项；空白行不添加。</span></>}/>
    {codesVisible && <p className="qt-form-hint">编码自动生成，排序和修改文字不会改变编码。{portableKeys ? '自定义编码以小写字母开头，可用数字、下划线和短横线，最多 80 个字符。' : '背景题请保留系统提供的编码。'}</p>}
    {error && <p className="qt-choice-error" role="alert">{error}</p>}
    {bulkOpen && <FormBulkPanel appearance="training" title={title} text={bulkText} onTextChange={setBulkText}
      mode={replace?'replace':'append'} onModeChange={mode=>setReplace(mode==='replace')}
      codeFormat={{coded,onChange:setCoded}}
      help={<>从 Excel 复制一列，或粘贴每行一个{title}的文本。应用前可在下方预览。</>}
      error={bulkError} summary={!bulkError&&preview.length>0?<>将{replace?'替换为':'追加'} {preview.length} 项{replace?'（当前列表会被替换）':`，共 ${existing.length+preview.length} 项`}。</>:null}
      preview={preview.map(choice=>({label:choice.label,...(coded?{code:choice.value}:{})}))}
      ready={!!preview.length} applyLabel={'应用'+(preview.length?` ${preview.length} 项`:'')}
      onApply={()=>{
        onChange(replace?preview:[...existing,...preview])
        setNotice(`已${replace?'替换':'追加'} ${preview.length} 项，可继续逐项编辑。`)
        setBulkOpen(false);setBulkText('')
      }} secondary={{label:'取消',onClick:()=>{setBulkOpen(false);setBulkText('')}}}/>}
    {notice && <p className="qt-form-hint" role="status">{notice}</p>}
  </section>
}
