import { Clock3, Moon, Sun } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTrainingAppearance } from './appearanceContext'

const modes = [
  { value: 'auto', label: '自动', Icon: Clock3 },
  { value: 'light', label: '浅色', Icon: Sun },
  { value: 'dark', label: '深色', Icon: Moon },
] as const

export default function TrainingAppearanceControl() {
  const { enabled, mode, theme, storageError, select } = useTrainingAppearance()
  const hintId = useId()
  const [hintOpen, setHintOpen] = useState(false)
  const hintTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(hintTimer.current), [])
  const stopHintTimer = () => { window.clearTimeout(hintTimer.current); hintTimer.current = undefined }
  const showHint = () => { stopHintTimer(); setHintOpen(true) }
  const hideHint = () => { stopHintTimer(); setHintOpen(false) }
  if (!enabled) return null
  const index = modes.findIndex(item => item.value === mode)
  const { label, Icon } = modes[index]
  const next = modes[(index + 1) % modes.length]
  const description = mode === 'auto'
    ? `按本机时间，7:00–19:00 浅色，其余时间深色；当前${theme === 'dark' ? '深色' : '浅色'}`
    : '已记住此浏览器中当前账户的选择'
  return <span className="training-appearance-control" data-hint-open={hintOpen}
    onPointerEnter={event => { if (event.pointerType !== 'touch') showHint() }} onPointerLeave={hideHint}>
    <button type="button" className="training-appearance-trigger"
      aria-label={`外观：${label}，点击切换为${next.label}`} aria-describedby={hintId}
      onFocus={event => { if (event.currentTarget.matches(':focus-visible')) showHint() }}
      onBlur={hideHint} onKeyDown={event => { if (event.key === 'Escape') hideHint() }}
      onClick={() => {
        select(next.value)
        showHint()
        hintTimer.current = window.setTimeout(() => { setHintOpen(false); hintTimer.current = undefined }, 1600)
      }}>
      <Icon size={19} aria-hidden="true" />
    </button>
    <span className="training-appearance-hint" role="tooltip" id={hintId}>
      <strong>外观：{label}</strong>
      <span>{storageError ? '外观已生效，但浏览器未能保存' : description}。</span>
      <span>点击切换为{next.label} · 自动 → 浅色 → 深色</span>
    </span>
  </span>
}
