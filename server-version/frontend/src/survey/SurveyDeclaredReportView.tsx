import { useEffect, useState } from 'react'
import { getDeclaredActionBand } from '../modules/reporting/declaredReportActionBand'
import { DeclaredBandFeedback, DeclaredReportIllustration } from '../modules/reporting/DeclaredReportIllustration'
import type { SurveyImageProof } from './SurveyParticipantImage'

export interface SurveyDeclaredReport {
  generatorVersion: 'DECLARATIVE_REPORT_V1'
  title?: string | null
  illustrationKey?: string
  blocks: unknown[]
  limitations?: string[]
  disclaimer?: string | null
}

export const SURVEY_TRIAL_SCORE_SUFFIX = '（试用版）'

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

function SurveyDeclaredReportImage({ assetId, alt, proof }: { assetId: string; alt: string; proof: SurveyImageProof }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''
    setUrl('')
    setError('')
    const endpoint = '/api/public/survey/r/' + encodeURIComponent(proof.publicId)
      + '/attempts/' + encodeURIComponent(proof.attemptId)
      + '/report-images/' + encodeURIComponent(assetId)
    void fetch(endpoint, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessCredential: proof.accessCredential,
        ...(proof.researchCode ? { researchCode: proof.researchCode } : {}),
      }),
    }).then(async (response) => {
      if (!response.ok) throw new Error('报告图片不可用或无读取权限')
      const mime = response.headers.get('Content-Type')?.split(';')[0] ?? ''
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
        throw new Error('报告图片类型不受支持')
      }
      return response.blob()
    }).then((blob) => {
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch((err) => {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : '报告图片加载失败')
      }
    })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [assetId, proof.publicId, proof.attemptId, proof.accessCredential, proof.researchCode, retry])

  return (
    <figure className="my-3">
      {url ? (
        <img
          src={url}
          className="max-w-full max-h-80 object-contain rounded-lg border"
          alt={alt || '报告配图'}
          loading="lazy"
          onError={() => {
            setUrl('')
            setError('图片解码失败，请重试')
          }}
        />
      ) : (
        <p className="text-xs text-slate-600" role="status">{error || '正在读取报告配图…'}</p>
      )}
      {error && (
        <button type="button" className="btn-secondary mt-1" onClick={() => setRetry((n) => n + 1)}>
          重试图片
        </button>
      )}
      {alt && <figcaption className="text-xs text-slate-600 mt-1">{alt}</figcaption>}
    </figure>
  )
}

function MetricCell({ value }: { value: Record<string, unknown> }) {
  const available = value.status === 'INTERPRETABLE'
    && value.display !== 'REFERENCE_RESULT'
    && typeof value.value === 'number'
    && Number.isFinite(value.value)
  const unit = str(value.unit)
  const trialScore = str(value.label).trimEnd().endsWith(SURVEY_TRIAL_SCORE_SUFFIX)
  return (
    <>
      <span>{available ? String(value.value) : '暂不可用'}</span>
      {unit && <span> {trialScore && unit === 'points' ? '分' : unit}</span>}
      {value.status === 'INVALID' && <span>（质量无效）</span>}
    </>
  )
}

export function isSurveyDeclaredReport(value: unknown): value is SurveyDeclaredReport {
  if (!isObj(value)) return false
  if (value.generatorVersion !== 'DECLARATIVE_REPORT_V1' || !Array.isArray(value.blocks)) return false
  if (value.title !== undefined && value.title !== null && typeof value.title !== 'string') return false
  if (value.disclaimer !== undefined && value.disclaimer !== null && typeof value.disclaimer !== 'string') return false
  if (value.limitations !== undefined && (!Array.isArray(value.limitations) || value.limitations.some((line) => typeof line !== 'string'))) {
    return false
  }
  return true
}

export function SurveyDeclaredReportView({
  report,
  proof,
}: {
  report: SurveyDeclaredReport
  proof?: SurveyImageProof
}) {
  const action = getDeclaredActionBand(report.illustrationKey, report.blocks)
  return (
    <section className="border-l-2 border-sky-300 pl-3 space-y-2" aria-label="完整工具报告">
      {typeof report.title === 'string' && report.title && <h5 className="font-semibold text-sm">{report.title}</h5>}
      <DeclaredReportIllustration illustrationKey={report.illustrationKey} />
      {report.blocks.map((raw, index) => {
        if (!isObj(raw)) return null
        switch (raw.type) {
          case 'TEXT':
            return <p key={index} className="whitespace-pre-wrap text-sm">{str(raw.text)}</p>
          case 'METRIC':
            return (
              <p key={index} className="text-sm">
                {str(raw.label) || '测评指标'}：<MetricCell value={raw} />
              </p>
            )
          case 'REFERENCE_BAND':
            return (
              <DeclaredBandFeedback key={index} band={action?.index === index ? action.band : undefined}>
                <div className="rounded bg-slate-50 p-2.5 space-y-1.5 text-sm">
                  <p className="whitespace-pre-wrap">{str(raw.text)}</p>
                  {Array.isArray(raw.guidance) && raw.guidance.length > 0 && (
                    <ul className="list-disc pl-5 space-y-1 text-slate-700">
                      {raw.guidance.filter((line): line is string => typeof line === 'string').map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </DeclaredBandFeedback>
            )
          case 'ASSET':
            return proof && typeof raw.assetId === 'string' ? (
              <SurveyDeclaredReportImage key={index} assetId={raw.assetId} alt={str(raw.alt)} proof={proof} />
            ) : (
              <p key={index} className="text-xs text-slate-600">{str(raw.alt) || '报告配图'}</p>
            )
          case 'CHART': {
            const metrics = Array.isArray(raw.metrics) ? raw.metrics.filter(isObj) : []
            return (
              <div key={index} className="space-y-1">
                {str(raw.caption) && <p className="text-xs text-slate-600">{str(raw.caption)}</p>}
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th scope="col" className="py-1 pr-3">指标</th>
                      <th scope="col" className="py-1">结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map((metric, i) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <th scope="row" className="py-1 pr-3 font-normal">{str(metric.label) || str(metric.metricKey) || '指标'}</th>
                        <td className="py-1"><MetricCell value={metric} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
          default:
            return null
        }
      })}
      {(Boolean(report.limitations?.length) || Boolean(report.disclaimer)) && (
        <details className="text-xs text-slate-600 pt-1">
          <summary>阅读说明与解释边界</summary>
          {Array.isArray(report.limitations) && report.limitations.length > 0 && (
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              {report.limitations.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          )}
          {typeof report.disclaimer === 'string' && report.disclaimer && <p className="mt-1">{report.disclaimer}</p>}
        </details>
      )}
    </section>
  )
}
