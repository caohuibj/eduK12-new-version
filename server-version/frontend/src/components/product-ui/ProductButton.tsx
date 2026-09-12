import { forwardRef, type ButtonHTMLAttributes } from 'react'

export interface ProductButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
}

/** Use an actual link for navigation. Callers own pending state and event locks. */
export const ProductButton = forwardRef<HTMLButtonElement, ProductButtonProps>(function ProductButton(
  { variant = 'secondary', type = 'button', className = '', children, ...props }, ref,
) {
  return <button {...props} ref={ref} type={type} className={`hui-button hui-button--${variant} ${className}`.trim()}>{children}</button>
})
