import { Clock3, Moon, Sun } from 'lucide-react'
import type { ProductAppearanceState } from './useProductTheme'
import './product-theme.css'

const modes = [
  { value: 'auto', label: '自动', Icon: Clock3 },
  { value: 'light', label: '浅色', Icon: Sun },
  { value: 'dark', label: '深色', Icon: Moon },
] as const

export function ProductThemeControl({ appearance, product }: { appearance: ProductAppearanceState; product: 'School' | 'Teacher' }) {
  const index = modes.findIndex(mode => mode.value === appearance.mode)
  const { label, Icon } = modes[index]
  const next = modes[(index + 1) % modes.length]
  const description = appearance.mode === 'auto'
    ? `按本机时间，07:00–19:00 浅色，其余时间深色；当前${appearance.theme === 'dark' ? '深色' : '浅色'}`
    : '已记住此浏览器中当前账户的选择'
  return <div className="product-theme-control">
    <button type="button" className="product-theme-trigger"
      aria-label={`${product} 外观：${label}，点击切换为${next.label}`}
      title={`外观：${label}。${description}。点击切换为${next.label} · 自动 → 浅色 → 深色`}
      onClick={() => appearance.select(next.value)}>
      <Icon size={19} aria-hidden="true" />
    </button>
    {appearance.storageError && <span className="product-theme-warning" role="alert">外观已生效，但浏览器未能保存。刷新后请重新选择。</span>}
  </div>
}
