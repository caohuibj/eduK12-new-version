import { FormChoiceExtras, toggleFormMultiple } from '../../modules/assessment-core/form/FormChoiceExtras'
import type { TrainingFormPolicy } from '../../modules/assessment-core/form/training-policy'
import { ProfessionalFormAnswer } from '../../modules/assessment-core/form/ProfessionalFormAnswer'
import type { ProfessionalAnswer } from '../../modules/assessment-core/form/types'
import { BasicFormAnswer } from '../../modules/assessment-core/form/BasicFormAnswer'
import type { FormQuestion } from '../../modules/assessment-core/form/types'
import {useEffect,useRef,type ChangeEvent,type MouseEvent} from 'react'
import {useScaleAutoAdvance} from '../../hooks/useScaleAutoAdvance'

export type FormPlayerValue = string | number | string[] | Record<string, string | number | string[] | {_surveyRefusal:true}> | {_surveyRefusal:true} | null

export interface FormPlayerOption {
  value: string
  label: string
}

export interface FormPlayerItem {
  id: string
  type: 'fill_blank' | 'single_choice' | 'multiple_choice' | 'text_input' | 'year_month' | string
  label: string
  placeholder?: string | null
  required: boolean
  formDefinition?: FormQuestion<never> | null
  formPolicy?: TrainingFormPolicy | null
}

export interface FormPlayerProps {
  item: FormPlayerItem
  options: FormPlayerOption[]
  value: FormPlayerValue | undefined
  otherText?: string
  onOtherTextChange?: (text:string)=>void
  disabled?: boolean
  answerDisabled?: boolean
  navigationDisabled?: boolean
  submitDisabled?: boolean
  errorMessage?: string | null
  position: number
  total: number
  onChange: (value: FormPlayerValue) => void | boolean | Promise<void | boolean>
  autoAdvance?: boolean
  scopeKey?: string
  onPrevious: () => void
  onNext?: () => void
  onSubmit?: () => void | Promise<void>
  submitLabel?: string
  submitting?: boolean
  allowSkip?: boolean
}

const inputId = (itemId: string) => `form-player-${itemId}`
const errorId = (itemId: string) => `form-player-${itemId}-error`

const ChoiceRow = ({
  type,
  name,
  option,
  checked,
  disabled,
  describedBy,
  onChange, onClick,
}: {
  type: 'radio' | 'checkbox'
  name: string
  option: FormPlayerOption
  checked: boolean
  disabled: boolean
  describedBy?: string
  onChange: () => void
  onClick?: (event:MouseEvent<HTMLInputElement>)=>void
}) => (
  <label className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${checked ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
    <input
      type={type}
      name={name}
      value={option.value}
      checked={checked}
      disabled={disabled}
      aria-describedby={describedBy}
      onChange={onChange}
      onClick={onClick}
      className="h-5 w-5 shrink-0 accent-blue-700"
    />
    <span>{option.label}</span>
  </label>
)

export function FormPlayer({
  item,
  options,
  value,
  otherText, onOtherTextChange,
  disabled = false,
  answerDisabled = false,
  navigationDisabled = false,
  submitDisabled = false,
  errorMessage,
  position,
  total,
  onChange,
  onPrevious,
  onNext,
  onSubmit, submitLabel='提交整个区段',
  submitting = false,
  allowSkip = false,
  autoAdvance = false, scopeKey = '',
}: FormPlayerProps) {
  const describedBy = errorMessage ? errorId(item.id) : undefined
  const choiceName = `form-player-choice-${item.id}`
  const textValue = typeof value === 'string' ? value : ''
  const multipleValues = Array.isArray(value) ? value : []

  const q = item.formDefinition
  // Immutable private FORM versions retain their typed wire names. Normalize
  // only the matching typed choice presentation, never the stored definition.
  const choiceType = q?.type === item.type && q.type === 'SINGLE' ? 'single_choice'
    : q?.type === item.type && q.type === 'MULTIPLE' ? 'multiple_choice' : item.type
  const automatic=autoAdvance&&choiceType==='single_choice'
  const arrowSelection=useRef(false),suppressedClick=useRef(false),questionRef=useRef<HTMLElement>(null)
  const selection=useScaleAutoAdvance<FormPlayerValue>({
    questionKey:scopeKey+':'+item.id,enabled:automatic,
    disabled:disabled||answerDisabled||navigationDisabled||submitting,
    hasNext:position<total,onSave:onChange,onNext,
  })
  useEffect(()=>{
    arrowSelection.current=false;suppressedClick.current=false
    if(autoAdvance)questionRef.current?.focus({preventScroll:true})
  },[autoAdvance,item.id,scopeKey])
  const answerControlsDisabled=disabled||answerDisabled||submitting||selection.busy
  const navigationControlsDisabled=disabled||navigationDisabled||submitting||selection.busy
  const submitControlsDisabled=disabled||submitDisabled||submitting||selection.busy
  const chooseSingle=(next:FormPlayerValue)=>{
    if(suppressedClick.current)return
    if(automatic&&!arrowSelection.current&&next!==q?.otherOptionKey)void selection.select(next)
    else void onChange(next)
  }
  const matrix = q?.type === 'MATRIX' || q?.type === 'MATRIX_MULTIPLE'
  // The shared renderer uses independent row keys; Training wire/storage uses one
  // typed object per DB item. Preserve row keys rather than serializing the object.
  const rowValues: Record<string,string|number|string[]|{_surveyRefusal:true}> = value && typeof value === 'object' && !Array.isArray(value) && !('_surveyRefusal' in value) ? value : {}
  const professionalAnswers: Record<string, ProfessionalAnswer> = q
    ? matrix ? Object.fromEntries(Object.entries(rowValues).map(([key, answer]) => [q.itemKey + ':' + key, answer]))
      : { [q.itemKey]: value as ProfessionalAnswer ?? null }
    : {}
  const professionalChange = (key: string, next: ProfessionalAnswer) => {
    if (!q) return
    if (matrix) {
      const row = q.rows.find(row => key === q.itemKey + ':' + row.rowKey)
      if (!row || (next !== null && typeof next !== 'string' && !Array.isArray(next) && !(typeof next==='object' && '_surveyRefusal' in next))) return
      const updated = { ...rowValues }
      if (next === null) delete updated[row.rowKey]
      else updated[row.rowKey] = next as string|string[]|{_surveyRefusal:true}
      void onChange(Object.keys(updated).length ? updated : null)
    } else void onChange(next as FormPlayerValue)
  }

  const handleTextChange = (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    void onChange(event.target.value)
  }

  const prompt = (
    <>
      {item.label}
      {item.required ? <span className="ml-2 text-sm font-normal text-red-600">必填</span> : allowSkip ? <span className="ml-2 text-sm font-normal text-slate-600">选填</span> : null}
    </>
  )

  return (
    <section className="form-player rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" ref={questionRef} tabIndex={autoAdvance?-1:undefined} aria-label={`表单题目 ${position} / ${total}`}
      onPointerDownCapture={()=>{arrowSelection.current=false;suppressedClick.current=false}}
      onKeyDownCapture={event=>{if(event.target instanceof HTMLInputElement&&event.target.type==='radio')arrowSelection.current=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)}}
      onKeyUpCapture={()=>{arrowSelection.current=false}}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        {allowSkip && !item.required ? <button type="button" disabled={answerControlsDisabled} onClick={() => void onChange(null)} className="form-player-skip min-h-11 rounded border px-3 py-2 text-sm">清空本题（不作答）</button> : null}
        <p className="text-sm font-medium text-slate-500">题目 {position} / {total}</p>
      </div>

      {choiceType === 'single_choice' ? (
        <fieldset aria-describedby={describedBy} disabled={answerControlsDisabled}>
          <legend className="mb-4 text-lg font-semibold text-slate-900">{prompt}</legend>
          <div className="space-y-2">
            {options.map((option) => (
              <ChoiceRow
                key={option.value}
                type="radio"
                name={choiceName}
                option={option}
                checked={value === option.value}
                disabled={answerControlsDisabled}
                describedBy={describedBy}
                onChange={() => chooseSingle(option.value)}
                onClick={event=>{
                  if(!automatic)return
                  suppressedClick.current=event.detail>1
                  if(suppressedClick.current){event.preventDefault();return}
                  if(value===option.value&&!arrowSelection.current&&option.value!==q?.otherOptionKey)void selection.select(option.value)
                }}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      {choiceType === 'multiple_choice' ? (
        <fieldset aria-describedby={describedBy} disabled={answerControlsDisabled}>
          <legend className="mb-4 text-lg font-semibold text-slate-900">{prompt}</legend>
          <div className="space-y-2">
            {options.map((option) => {
              const checked = multipleValues.includes(option.value)
              return (
                <ChoiceRow
                  key={option.value}
                  type="checkbox"
                  name={choiceName}
                  option={option}
                  checked={checked}
                  disabled={answerControlsDisabled}
                  describedBy={describedBy}
                  onChange={() => void onChange(toggleFormMultiple(multipleValues,option.value,!checked,q?.exclusiveOptionKeys))}
                />
              )
            })}
          </div>
        </fieldset>
      ) : null}

      {item.type === 'year_month' ? (
        <div>
          <label htmlFor={inputId(item.id)} className="mb-3 block text-lg font-semibold text-slate-900">{prompt}</label>
          <input
            id={inputId(item.id)}
            type="month"
            value={textValue}
            disabled={answerControlsDisabled}
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={describedBy}
            onChange={handleTextChange}
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
          />
        </div>
      ) : null}

      {item.formDefinition && ['NUMBER', 'SHORT_TEXT', 'LONG_TEXT', 'DATE', 'TIME'].includes(item.formDefinition.type) ? (
        <div>
          <label htmlFor={inputId(item.id)} className="mb-3 block text-lg font-semibold text-slate-900">{prompt}</label>
          <BasicFormAnswer question={item.formDefinition} id={inputId(item.id)}
            value={typeof value === 'string' || typeof value === 'number' ? value : null}
            disabled={answerControlsDisabled} describedBy={describedBy} invalid={Boolean(errorMessage)}
            placeholder={item.placeholder || '请输入'} onChange={next => void onChange(next)}
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100" />
        </div>
      ) : null}

      {q && ['LIKERT', 'MATRIX', 'MATRIX_MULTIPLE', 'RANK_ORDER', 'SLIDER', 'CONSTANT_SUM'].includes(q.type) ? (
        <fieldset disabled={answerControlsDisabled} aria-describedby={describedBy}>
          <legend className="mb-3 text-lg font-semibold text-slate-900">{prompt}</legend>
          <ProfessionalFormAnswer question={q} answers={professionalAnswers}
            prefix={inputId(item.id)} onAnswer={professionalChange} />
        </fieldset>
      ) : null}

      {(!item.formDefinition && (item.type === 'fill_blank' || item.type === 'text_input' || !['single_choice', 'multiple_choice', 'year_month'].includes(item.type))) ? (
        <div>
          <label htmlFor={inputId(item.id)} className="mb-3 block text-lg font-semibold text-slate-900">{prompt}</label>
          <textarea
            id={inputId(item.id)}
            value={textValue}
            disabled={answerControlsDisabled}
            placeholder={item.placeholder || '请输入'}
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={describedBy}
            onChange={handleTextChange}
            className="min-h-32 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
          />
        </div>
      ) : null}

      {q?.otherOptionKey && onOtherTextChange ? <fieldset disabled={answerControlsDisabled}><FormChoiceExtras question={q} answers={{[q.itemKey]:value as ProfessionalAnswer,[q.itemKey+':other']:otherText??''}} onChange={(_,next)=>onOtherTextChange(typeof next==='string'?next:'')} /></fieldset> : null}
      {q?.allowRefusal && !matrix ? <label className="mt-4 flex gap-2"><input type="checkbox" disabled={answerControlsDisabled} checked={Boolean(value && typeof value==='object' && '_surveyRefusal' in value)} onChange={e=>void onChange(e.target.checked?{_surveyRefusal:true}:null)}/>我选择不回答这一题</label> : null}
      {q?.allowRefusal ? <p className="mt-2 text-sm text-slate-600">明确拒答会单独记录，不计有效回答。{item.required ? item.formPolicy?.requiredRefusal==='ALLOW_SUBMIT'?'此必答题可拒答交卷，但本次任务不会标记为达成。':'此必答题拒答后不能交卷。':''}</p> : null}
      {errorMessage ? <p id={errorId(item.id)} role="alert" className="mt-3 text-sm text-red-700">{errorMessage}</p> : null}

      <div className="mt-6 flex flex-wrap justify-between gap-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={position <= 1 || navigationControlsDisabled}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          上一题
        </button>
        {position < total && onNext ? (
          <button
            type="button"
            onClick={onNext}
            disabled={navigationControlsDisabled}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            下一题
          </button>
        ) : onSubmit ? (
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={submitControlsDisabled}
            className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '正在提交…' : submitLabel}
          </button>
        ) : null}
      </div>
    </section>
  )
}

export default FormPlayer
