import React from 'react'
import type { ScaleUnitReport } from './types'

const levelColor = (level: string | null) => {
  if (level === 'high') return 'text-green-600 bg-green-100'
  if (level === 'medium') return 'text-yellow-600 bg-yellow-100'
  if (level === 'low') return 'text-blue-600 bg-blue-100'
  return 'text-gray-600 bg-gray-100'
}

const levelLabel = (level: string | null, explicit?: string) => {
  if (explicit) return explicit
  if (level === 'high') return '较高'
  if (level === 'medium') return '中等'
  if (level === 'low') return '较低'
  return level || '—'
}

const ScaleUnitReportCard: React.FC<{ report: ScaleUnitReport }> = ({ report }) => {
  if (report.decryptError) {
    return <p className="text-amber-700">该量表结果无法解密，分数未展示。</p>
  }

  return (
    <div data-testid={`scale-unit-report-${report.itemId || report.scaleId}`}>
      <p className="text-xs text-gray-500 mb-4">
        {report.scaleName} · 结果定义 {report.method.reportDefinitionVersion}
      </p>
      <div className="space-y-4">
        {report.feedback.dimensions.map((dimension) => {
          const minScore = dimension.minScore ?? 0
          const maxScore = dimension.maxScore ?? 100
          const score = dimension.score
          const progress = score !== null && maxScore > minScore
            ? Math.max(0, Math.min(100, ((score - minScore) / (maxScore - minScore)) * 100))
            : 0
          return (
            <div key={dimension.dimensionId || dimension.dimensionName}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-gray-700">{dimension.dimensionName}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${levelColor(dimension.level)}`}>
                  {levelLabel(dimension.level, dimension.levelName)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className="h-3 rounded-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{minScore}</span>
                <span className="font-medium">{score === null ? '—' : `${score.toFixed(1)}分`}</span>
                <span>{maxScore}</span>
              </div>
              {dimension.interpretation && <p className="text-sm text-gray-600 mt-2">{dimension.interpretation}</p>}
              {dimension.suggestions.length > 0 && (
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 mt-1">
                  {dimension.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}
                </ul>
              )}
            </div>
          )
        })}
      </div>
      {report.feedback.overall && <p className="text-sm text-gray-600 mt-4 p-3 bg-gray-50 rounded-lg">{report.feedback.overall}</p>}
      {(report.caveats || []).length > 0 && <ul className="list-disc list-inside text-sm text-amber-700 mt-4 space-y-1" data-testid="scale-caveats">
        {(report.caveats || []).map((caveat) => <li key={caveat}>{caveat}</li>)}
      </ul>}
      {report.disclaimer && <p className="text-xs text-gray-500 mt-3" data-testid="scale-disclaimer">{report.disclaimer}</p>}
    </div>
  )
}

export default ScaleUnitReportCard
