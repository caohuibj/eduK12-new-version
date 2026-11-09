import './cognitive-digit-entry.css'

/** Editable participant response only. Never receives or displays the stimulus sequence. */
export function CognitiveDigitEntry({ values, length, onDigit, onBackspace, onClear, onSubmit, disabled = false, busy = false, reverse = false, submitLabel = '提交' }: {
  values: number[]
  length: number
  onDigit: (digit: number) => void
  onBackspace: () => void
  onClear: () => void
  onSubmit: () => void
  disabled?: boolean
  busy?: boolean
  reverse?: boolean
  submitLabel?: string
}) {
  const locked = disabled || busy
  return <section className="cognitive-digit-entry" aria-label="数字答案输入区">
    <header className="cognitive-digit-entry__header">
      <h2>{reverse ? '按相反顺序输入' : '按原顺序输入'}</h2>
      <p role="status" aria-live="polite">已输入 {values.length} / {length}</p>
    </header>
    <div className="cognitive-digit-entry__slots" role="group" aria-label="已输入数字">
      {Array.from({ length }, (_, index) => <span className="cognitive-digit-entry__slot" key={index}
        data-filled={index < values.length} data-next={index === values.length && !locked}
        aria-label={`第 ${index + 1} 位：${values[index] ?? '未输入'}`}>
        {values[index] ?? '·'}
      </span>)}
    </div>
    <p className="cognitive-digit-entry__hint">{reverse ? '从最后出现的数字开始倒着输入。' : '从最先出现的数字开始依次输入。'}提交前可退格修改或清空重填。</p>
    <div className="cognitive-digit-entry__keypad" role="group" aria-label="数字键盘">
      {[1,2,3,4,5,6,7,8,9].map(digit => <button type="button" key={digit} disabled={locked || values.length >= length} onClick={() => onDigit(digit)}>{digit}</button>)}
      <button type="button" className="cognitive-digit-entry__edit" onClick={onClear} disabled={locked || values.length === 0}>清空</button>
      <button type="button" onClick={() => onDigit(0)} disabled={locked || values.length >= length}>0</button>
      <button type="button" className="cognitive-digit-entry__edit" aria-label="退格" onClick={onBackspace} disabled={locked || values.length === 0}>⌫ 退格</button>
    </div>
    <button type="button" className="btn-primary cognitive-digit-entry__submit" onClick={onSubmit} disabled={locked || values.length !== length}>{busy ? '提交中…' : submitLabel}</button>
    <p className="cognitive-digit-entry__keyboard">键盘：数字键输入 · Backspace 退格 · Enter 提交</p>
  </section>
}
