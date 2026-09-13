import type { ReactNode } from 'react'
import { ProductPage, ProductStatus } from '../product-ui'

export type AssessmentProgress =
  | { kind: 'count'; completed: number; total: number; label?: string }
  | { kind: 'position'; current: number; total: number; label?: string }
  | { kind: 'phase'; phase: string; detail?: string; label?: string }
  | { kind: 'open-path'; visited: number; current?: string; label?: string }

export type AssessmentSaveStatus =
  | { state: 'idle' }
  | { state: 'saving'; message?: string }
  | { state: 'saved'; message?: string }
  | { state: 'error'; message: string }

export type AssessmentSubmissionStatus =
  | { state: 'idle' | 'ready' }
  | { state: 'submitting'; message?: string }
  | { state: 'reconciling'; message?: string }
  | { state: 'pending'; message?: string }
  | { state: 'committed'; message?: string }

export type AssessmentRecoveryState =
  | { state: 'none' }
  | { state: 'resumed'; message: string }
  | { state: 'blocked'; message: string }
  | { state: 'error'; message: string }

export type AssessmentInteractionReadiness =
  | { state: 'ready' }
  | { state: 'preparing'; message?: string }
  | { state: 'blocked'; message: string }

export interface AssessmentShellProps {
  title: string
  eyebrow?: string
  instructions?: ReactNode
  estimatedMinutes?: number | null
  progress?: AssessmentProgress
  saveStatus?: AssessmentSaveStatus
  submissionStatus?: AssessmentSubmissionStatus
  recoveryState?: AssessmentRecoveryState
  interactionReadiness?: AssessmentInteractionReadiness
  children: ReactNode
  actions?: ReactNode
  navigation?: ReactNode
  className?: string
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function ProgressView({ progress }: { progress: AssessmentProgress }) {
  const label = progress.label ?? '测评进度'

  if (progress.kind === 'phase') {
    return (
      <section aria-label={label} className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-1 font-semibold text-slate-900">{progress.phase}</p>
        {progress.detail ? <p className="mt-1 text-sm text-slate-600">{progress.detail}</p> : null}
      </section>
    )
  }

  if (progress.kind === 'open-path') {
    return (
      <section aria-label={label} className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-1 font-semibold text-slate-900">已完成 {Math.max(0, progress.visited)} 个步骤</p>
        {progress.current ? <p className="mt-1 text-sm text-slate-600">当前：{progress.current}</p> : null}
      </section>
    )
  }

  const total = Math.max(1, progress.total)
  const rawValue = progress.kind === 'count' ? progress.completed : progress.current
  const value = clamp(rawValue, 0, total)
  const percentage = Math.round((value / total) * 100)
  const valueLabel = progress.kind === 'count'
    ? `${Math.max(0, progress.completed)} / ${Math.max(0, progress.total)}`
    : `第 ${Math.max(0, progress.current)} / ${Math.max(0, progress.total)}`

  return (
    <section aria-label={label} className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-4 text-sm text-slate-600">
        <span>{label}</span>
        <span>{valueLabel}</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, progress.total)}
        aria-valuenow={clamp(rawValue, 0, Math.max(0, progress.total))}
      >
        <div className="h-full rounded-full bg-blue-700 transition-[width] motion-reduce:transition-none" style={{ width: `${percentage}%` }} />
      </div>
    </section>
  )
}

function ShellStatuses({
  saveStatus,
  submissionStatus,
  recoveryState,
  interactionReadiness,
}: Pick<AssessmentShellProps, 'saveStatus' | 'submissionStatus' | 'recoveryState' | 'interactionReadiness'>) {
  return (
    <div className="mb-5 space-y-3" data-assessment-shell-statuses>
      {interactionReadiness?.state === 'preparing' ? (
        <ProductStatus kind="pending" title="正在准备交互" announce="polite">
          {interactionReadiness.message ?? '正在准备本单元所需内容。'}
        </ProductStatus>
      ) : null}
      {interactionReadiness?.state === 'blocked' ? (
        <ProductStatus kind="warning" title="暂时无法继续">
          {interactionReadiness.message}
        </ProductStatus>
      ) : null}
      {recoveryState?.state === 'resumed' ? (
        <ProductStatus kind="info" title="已恢复本机进度">{recoveryState.message}</ProductStatus>
      ) : null}
      {recoveryState?.state === 'blocked' ? (
        <ProductStatus kind="warning" title="需要处理恢复状态">{recoveryState.message}</ProductStatus>
      ) : null}
      {recoveryState?.state === 'error' ? (
        <ProductStatus kind="error" title="恢复失败" announce="assertive">{recoveryState.message}</ProductStatus>
      ) : null}
      {saveStatus?.state === 'saving' ? (
        <ProductStatus kind="pending" title="正在保存到本机" announce="polite">{saveStatus.message ?? '请勿关闭当前页面。'}</ProductStatus>
      ) : null}
      {saveStatus?.state === 'saved' ? (
        <ProductStatus kind="success" title="已保存到本机">{saveStatus.message ?? '可以继续作答。'}</ProductStatus>
      ) : null}
      {saveStatus?.state === 'error' ? (
        <ProductStatus kind="error" title="本机保存失败" announce="assertive">{saveStatus.message}</ProductStatus>
      ) : null}
      {submissionStatus?.state === 'submitting' ? (
        <ProductStatus kind="pending" title="正在提交" announce="polite">{submissionStatus.message ?? '答案已锁定，正在提交同一份 FINAL。'}</ProductStatus>
      ) : null}
      {submissionStatus?.state === 'reconciling' ? (
        <ProductStatus kind="pending" title="正在确认提交状态" announce="polite">{submissionStatus.message ?? '正在核对服务器终态，不会重新生成答案。'}</ProductStatus>
      ) : null}
      {submissionStatus?.state === 'pending' ? (
        <ProductStatus kind="warning" title="提交状态尚未确认">{submissionStatus.message ?? '答案保持锁定；稍后继续核对同一份提交。'}</ProductStatus>
      ) : null}
      {submissionStatus?.state === 'committed' ? (
        <ProductStatus kind="success" title="已提交">{submissionStatus.message ?? '服务器已确认本单元的权威结果。'}</ProductStatus>
      ) : null}
    </div>
  )
}

/**
 * Presentation-only assessment frame. Domain controllers remain responsible for
 * answers, trials, trajectory, persistence, APIs, FINAL payloads and navigation.
 */
export function AssessmentShell({
  title,
  eyebrow = '测评',
  instructions,
  estimatedMinutes,
  progress,
  saveStatus = { state: 'idle' },
  submissionStatus = { state: 'idle' },
  recoveryState = { state: 'none' },
  interactionReadiness = { state: 'ready' },
  children,
  actions,
  navigation,
  className = '',
}: AssessmentShellProps) {
  return (
    <ProductPage width="assessment" className={className}>
      <header className="mb-6 space-y-3" data-assessment-shell-header>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500">{eyebrow}</p>
            <h1 className="mt-1 text-2xl font-bold leading-tight text-slate-900">{title}</h1>
          </div>
          {estimatedMinutes ? <p className="text-sm text-slate-500 sm:text-right">预计约 {estimatedMinutes} 分钟</p> : null}
        </div>
        {instructions ? <div className="max-w-prose whitespace-pre-wrap text-sm text-slate-600">{instructions}</div> : null}
      </header>

      {progress ? <ProgressView progress={progress} /> : null}
      <ShellStatuses
        saveStatus={saveStatus}
        submissionStatus={submissionStatus}
        recoveryState={recoveryState}
        interactionReadiness={interactionReadiness}
      />

      <div data-assessment-shell-content>{children}</div>
      {actions ? <div className="mt-5" data-assessment-shell-actions>{actions}</div> : null}
      {navigation ? <div className="mt-6" data-assessment-shell-navigation>{navigation}</div> : null}
    </ProductPage>
  )
}
