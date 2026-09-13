import type { ChangeEvent } from 'react'

export type FormPlayerValue = string | string[] | null

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
}

export interface FormPlayerProps {
  item: FormPlayerItem
  options: FormPlayerOption[]
  value: FormPlayerValue | undefined
  disabled?: boolean
  answerDisabled?: boolean
  navigationDisabled?: boolean
  submitDisabled?: boolean
  errorMessage?: string | null
  position: number
  total: number
  onChange: (value: FormPlayerValue) => void | Promise<void>
  onPrevious: () => void
  onNext?: () => void
  onSubmit?: () => void | Promise<void>
  submitting?: boolean
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
  onChange,
}: {
  type: 'radio' | 'checkbox'
  name: string
  option: FormPlayerOption
  checked: boolean
  disabled: boolean
  describedBy?: string
  onChange: () => void
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
      className="h-5 w-5 shrink-0 accent-blue-700"
    />
    <span>{option.label}</span>
  </label>
)

export function FormPlayer({
  item,
  options,
  value,
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
  onSubmit,
  submitting = false,
}: FormPlayerProps) {
  const describedBy = errorMessage ? errorId(item.id) : undefined
  const choiceName = `form-player-choice-${item.id}`
  const textValue = typeof value === 'string' ? value : ''
  const multipleValues = Array.isArray(value) ? value : []
  const answerControlsDisabled = disabled || answerDisabled || submitting
  const navigationControlsDisabled = disabled || navigationDisabled || submitting
  const submitControlsDisabled = disabled || submitDisabled || submitting

  const handleTextChange = (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    void onChange(event.target.value)
  }

  const prompt = (
    <>
      {item.label}
      {item.required ? <span className="ml-2 text-sm font-normal text-red-600">必填</span> : null}
    </>
  )

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-label={`表单字段 ${position} / ${total}`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">字段 {position} / {total}</p>
      </div>

      {item.type === 'single_choice' ? (
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
                onChange={() => void onChange(option.value)}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      {item.type === 'multiple_choice' ? (
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
                  onChange={() => void onChange(checked
                    ? multipleValues.filter((entry) => entry !== option.value)
                    : [...multipleValues, option.value])}
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
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
          />
        </div>
      ) : null}

      {(item.type === 'fill_blank' || item.type === 'text_input' || !['single_choice', 'multiple_choice', 'year_month'].includes(item.type)) ? (
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
            className="min-h-32 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
          />
        </div>
      ) : null}

      {errorMessage ? <p id={errorId(item.id)} role="alert" className="mt-3 text-sm text-red-700">{errorMessage}</p> : null}

      <div className="mt-6 flex flex-wrap justify-between gap-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={position <= 1 || navigationControlsDisabled}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          上一字段
        </button>
        {position < total && onNext ? (
          <button
            type="button"
            onClick={onNext}
            disabled={navigationControlsDisabled}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            下一字段
          </button>
        ) : onSubmit ? (
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={submitControlsDisabled}
            className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '提交区段中…' : '提交整个区段'}
          </button>
        ) : null}
      </div>
    </section>
  )
}

export default FormPlayer
