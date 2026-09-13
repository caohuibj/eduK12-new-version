import { CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react'

export type ScalePlayerValue = string | number

export interface ScalePlayerOption {
  value: ScalePlayerValue
  label: string
}

export interface ScalePlayerItem {
  itemCode: string
  content: string
  required: boolean
  options: ScalePlayerOption[]
}

export interface ScalePlayerProps {
  item: ScalePlayerItem
  value: ScalePlayerValue | undefined
  disabled?: boolean
  position: number
  total: number
  onChange: (value: ScalePlayerValue) => void | Promise<void>
  onPrevious: () => void | Promise<void>
  onNext?: () => void | Promise<void>
  onSubmit?: () => void | Promise<void>
  submitting?: boolean
}

export function ScalePlayer({
  item,
  value,
  disabled = false,
  position,
  total,
  onChange,
  onPrevious,
  onNext,
  onSubmit,
  submitting = false,
}: ScalePlayerProps) {
  const controlsDisabled = disabled || submitting

  return (
    <section aria-label={`量表题目 ${position} / ${total}`}>
      <h3 className="mb-5 text-lg font-medium text-slate-900">
        {item.content}
        {item.required ? <span className="ml-2 text-sm text-red-600">必答</span> : null}
      </h3>

      <div className="space-y-2" role="group" aria-label={item.content}>
        {item.options.map((option) => {
          const selected = value === option.value
          return (
            <button
              type="button"
              key={`${typeof option.value}:${String(option.value)}`}
              aria-pressed={selected}
              onClick={() => void onChange(option.value)}
              disabled={controlsDisabled}
              className={`block min-h-11 w-full rounded-lg border px-4 py-3 text-left ${selected ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-slate-300 hover:border-slate-400'}`}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <div className="mt-6 flex flex-wrap justify-between gap-3">
        <button
          type="button"
          onClick={() => void onPrevious()}
          disabled={position <= 1 || controlsDisabled}
          className="btn-secondary min-h-11"
        >
          <ChevronLeft className="inline h-4 w-4" />上一题
        </button>
        {position < total && onNext ? (
          <button
            type="button"
            onClick={() => void onNext()}
            disabled={controlsDisabled}
            className="btn-secondary min-h-11"
          >
            下一题<ChevronRight className="inline h-4 w-4" />
          </button>
        ) : onSubmit ? (
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={controlsDisabled}
            className="btn-primary min-h-11"
          >
            <CheckCircle className="mr-1 inline h-4 w-4" />
            {submitting ? '提交量表中...' : '提交整份量表'}
          </button>
        ) : null}
      </div>
    </section>
  )
}

export default ScalePlayer
