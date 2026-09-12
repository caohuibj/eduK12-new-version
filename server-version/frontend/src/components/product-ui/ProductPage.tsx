import type { HTMLAttributes } from 'react'

export interface ProductPageProps extends HTMLAttributes<HTMLDivElement> {
  width?: 'reading' | 'assessment' | 'report' | 'management'
}

/** Content scope only; the route shell owns the main landmark and navigation. */
export function ProductPage({ width = 'reading', className = '', children, ...props }: ProductPageProps) {
  return <div {...props} className={`hui-product hui-page hui-page--${width} ${className}`.trim()}>{children}</div>
}
