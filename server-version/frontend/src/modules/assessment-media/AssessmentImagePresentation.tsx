import React from 'react'
import type { AssessmentImageAssetLoadState } from './useAssessmentImageAssets'
import type { AssessmentImagePresentationItem } from './types'

export interface AssessmentImagePresentationProps {
  items: readonly AssessmentImagePresentationItem[]
  state: AssessmentImageAssetLoadState
  ordered?: boolean
  ariaLabel?: string
}

const AssessmentImagePresentation: React.FC<AssessmentImagePresentationProps> = ({
  items,
  state,
  ordered = false,
  ariaLabel = '视觉内容',
}) => {
  if (!items.length) return null
  if (state.status === 'loading') {
    return <div role="status" className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-5 text-sm text-indigo-800">加载视觉内容…</div>
  }
  if (state.status === 'error') {
    return (
      <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
        <p>视觉内容加载失败，当前内容暂不能作答。</p>
        <button type="button" onClick={state.retry} className="mt-3 rounded-lg bg-white px-4 py-2 font-medium text-red-700 shadow-sm">重试</button>
      </div>
    )
  }

  if (items.length === 1 && !ordered) {
    const item = items[0]!
    return (
      <figure className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4">
        <img
          src={state.urls[item.asset.assetId]}
          alt={item.altText}
          data-asset-id={item.asset.assetId}
          className="mx-auto max-h-[min(60vh,560px)] w-full object-contain"
        />
        {item.caption && <figcaption className="text-center text-sm text-slate-600">{item.caption}</figcaption>}
      </figure>
    )
  }

  return (
    <ol aria-label={ariaLabel} className="mt-4 grid list-none grid-cols-1 gap-4 rounded-xl bg-slate-50 p-4">
      {items.map((item, index) => (
        <li key={`${item.asset.assetId}-${index}`} className="space-y-2">
          <img
            src={state.urls[item.asset.assetId]}
            alt={item.altText}
            data-asset-id={item.asset.assetId}
            className="mx-auto max-h-[min(60vh,560px)] w-full object-contain"
          />
          {item.caption && <p className="text-center text-sm text-slate-600">{item.caption}</p>}
        </li>
      ))}
    </ol>
  )
}

export default AssessmentImagePresentation
