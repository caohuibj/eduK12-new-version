import type { ReactNode } from 'react'

export interface PageHeaderProps {
  title: string
  titleId?: string
  description?: ReactNode
  actions?: ReactNode
  headingLevel?: 1 | 2
}

export function PageHeader({ title, titleId, description, actions, headingLevel = 1 }: PageHeaderProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <header className="hui-page-header">
      <div className="hui-page-header__text">
        <Heading id={titleId} className="hui-page-header__title">{title}</Heading>
        {description && <div className="hui-page-header__description">{description}</div>}
      </div>
      {actions && <div className="hui-page-header__actions">{actions}</div>}
    </header>
  )
}
