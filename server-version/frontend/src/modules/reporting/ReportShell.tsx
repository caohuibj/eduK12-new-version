import type { ReactNode } from 'react'
import {
  ActionBar,
  PageHeader,
  ProductPage,
  ProductStatus,
  type ProductStatusProps,
} from '../../components/product-ui'

export interface ReportFact {
  label: string
  value: ReactNode
}

export interface ReportShellStatus {
  kind: ProductStatusProps['kind']
  title: string
  description?: ReactNode
  announce?: ProductStatusProps['announce']
}

export interface ReportShellProps {
  title: string
  description?: ReactNode
  backAction?: ReactNode
  facts?: ReportFact[]
  status?: ReportShellStatus
  actions?: ReactNode
  limitations?: ReactNode[]
  children?: ReactNode
  testId?: string
}

/**
 * Product-level report frame only.
 *
 * Domain report components remain responsible for metrics, interpretation,
 * scientific quality rules and audience-safe projection. ReportShell only
 * owns page hierarchy, completion facts, status presentation, action grouping
 * and limitations layout.
 */
export function ReportShell({
  title,
  description,
  backAction,
  facts = [],
  status,
  actions,
  limitations = [],
  children,
  testId = 'report-shell',
}: ReportShellProps) {
  return (
    <ProductPage width="report" data-testid={testId}>
      {backAction && <div className="mb-4">{backAction}</div>}
      <PageHeader title={title} description={description} />

      {facts.length > 0 && (
        <section className="card p-5 mb-5" aria-label="完成信息" data-testid="report-completion-facts">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <dt className="text-xs text-gray-500">{fact.label}</dt>
                <dd className="mt-1 text-sm text-gray-800 break-words">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {status && (
        <div className="mb-5">
          <ProductStatus kind={status.kind} title={status.title} announce={status.announce}>
            {status.description}
          </ProductStatus>
        </div>
      )}

      {children && <div className="space-y-5">{children}</div>}

      {limitations.length > 0 && (
        <section className="card p-5 mt-5" aria-labelledby="report-limitations-title" data-testid="report-limitations">
          <h2 id="report-limitations-title" className="text-base font-semibold text-gray-800">阅读限制</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-600">
            {limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}
          </ul>
        </section>
      )}

      {actions && (
        <ActionBar label="报告操作" className="mt-5">
          {actions}
        </ActionBar>
      )}
    </ProductPage>
  )
}

export default ReportShell
