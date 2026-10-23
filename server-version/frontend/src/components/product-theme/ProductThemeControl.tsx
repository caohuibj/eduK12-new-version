import { Moon, Sun, SunMoon } from 'lucide-react'
import { useId } from 'react'
import type { ProductAppearanceState } from './useProductTheme'
import './product-theme.css'

export function ProductThemeControl({ appearance, product }: { appearance: ProductAppearanceState; product: 'School' | 'Teacher' }) {
  const id = useId()
  const Icon = appearance.mode === 'auto' ? SunMoon : appearance.theme === 'dark' ? Moon : Sun
  return <div className="product-theme-control">
    <label htmlFor={id} title="按本机时间：07:00 正常色，19:00 暗色；也可手动选择。">
      <Icon size={18} aria-hidden="true" />
      <span className="product-theme-sr-only">{product} 外观</span>
      <select id={id} value={appearance.mode} onChange={event => {
        const value = event.target.value
        if (value === 'auto' || value === 'light' || value === 'dark') appearance.select(value)
      }}>
        <option value="auto">昼夜自动</option><option value="light">正常色</option><option value="dark">暗色</option>
      </select>
    </label>
    {appearance.storageError && <span className="product-theme-warning" role="alert">外观已生效，但浏览器未能保存。刷新后请重新选择。</span>}
  </div>
}
