import React from 'react'

type ProductPageWidth = 'reading' | 'assessment' | 'report' | 'wide'
type ProductStatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const widthClass: Record<ProductPageWidth, string> = {
  reading: 'max-w-3xl',
  assessment: 'max-w-2xl',
  report: 'max-w-4xl',
  wide: 'max-w-7xl',
}

const statusClass: Record<ProductStatusTone, string> = {
  neutral: 'border-gray-200 bg-white text-gray-700',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-red-200 bg-red-50 text-red-800',
}

export const ProductPage: React.FC<{
  children: React.ReactNode
  width?: ProductPageWidth
  className?: string
}> = ({ children, width = 'wide', className = '' }) => (
  <div className={`mx-auto w-full ${widthClass[width]} ${className}`.trim()}>
    {children}
  </div>
)

export const ProductPageHeader: React.FC<{
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
}> = ({ title, description, eyebrow, actions }) => (
  <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0">
      {eyebrow && <div className="mb-2 text-sm font-medium text-primary">{eyebrow}</div>}
      <h1 className="text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">{title}</h1>
      {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 sm:text-base">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>
)

export const ProductSurface: React.FC<{
  children: React.ReactNode
  className?: string
}> = ({ children, className = '' }) => (
  <section className={`rounded-xl border border-gray-200 bg-white shadow-sm ${className}`.trim()}>
    {children}
  </section>
)

export const ProductStatus: React.FC<{
  children: React.ReactNode
  tone?: ProductStatusTone
  className?: string
}> = ({ children, tone = 'neutral', className = '' }) => (
  <div
    role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
    className={`rounded-xl border px-4 py-3 text-sm leading-6 ${statusClass[tone]} ${className}`.trim()}
  >
    {children}
  </div>
)
