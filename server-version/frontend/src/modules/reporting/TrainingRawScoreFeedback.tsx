import {TrainingMaterials} from '../assessment-media/TrainingMaterials'
import type {PublicMaterial} from '../assessment-media/material'
import { useCallback, useMemo } from 'react'
import { sessionFetch } from '../../api/client'
import { useAssessmentImageAssets } from '../assessment-media/useAssessmentImageAssets'
import type { RawScoreFeedbackImage, MatchedRawScoreFeedback } from '../scale/rawScoreFeedback'
import { ReportSection } from './ReportPrimitives'

export type { MatchedRawScoreFeedback } from '../scale/rawScoreFeedback'

/** Only renders the server's already-authorized selection, never receives interval rules. */
export function TrainingRawScoreFeedback({ entries, assessmentId, labels, loadReportImage }: {
  entries: MatchedRawScoreFeedback[]; assessmentId?: string; labels: Record<string, string>; loadReportImage?: (assetId: string) => Promise<Blob>
}) {
  return <ReportSection title="描述性反馈" eyebrow="本次原始分结果">
    <div className="report-feedback-list">{entries.map(entry => <article className="report-feedback" key={entry.scoreKey}>
      <h4>{labels[entry.scoreKey] || '本次结果'}</h4>
      <p className="whitespace-pre-line leading-relaxed">{entry.text}</p>
      {!!entry.materials?.length&&<FeedbackMaterials items={entry.materials} assessmentId={assessmentId} loadReportImage={loadReportImage}/>}
      {entry.images?.length ? <FeedbackImages images={entry.images} assessmentId={assessmentId} loadReportImage={loadReportImage} /> : null}
    </article>)}</div>
  </ReportSection>
}

function FeedbackImages({ images, assessmentId, loadReportImage }: { images: RawScoreFeedbackImage[]; assessmentId?: string; loadReportImage?: (assetId: string) => Promise<Blob> }) {
  const ordered = useMemo(() => [...images].sort((a, b) => a.order - b.order), [images])
  const load = useCallback(async (assetId: string) => {
    if (loadReportImage) return loadReportImage(assetId)
    if (!assessmentId) throw new Error('当前报告未提供图片访问标识')
    const response = await sessionFetch(`/api/scales/assessments/${encodeURIComponent(assessmentId)}/report-assets/${encodeURIComponent(assetId)}`)
    if (!response.ok) throw new Error('反馈图片暂时无法读取')
    return response.blob()
  }, [assessmentId, loadReportImage])
  const state = useAssessmentImageAssets(ordered, load)
  if (state.status === 'loading') return <p role="status">正在加载反馈图片…</p>
  if (state.status === 'error') return <div role="alert"><p>反馈图片暂时无法读取，以上文字反馈仍可查看。</p><button type="button" className="hui-button hui-button--secondary" onClick={state.retry}>重试图片</button></div>
  return <div>{ordered.map((image, index) => <figure key={`${image.asset.assetId}-${index}`} className="my-4">
    <img src={state.urls[image.asset.assetId]} alt={image.altText} className="max-h-96 max-w-full object-contain" />
    {image.caption && <figcaption className="text-sm text-gray-600">{image.caption}</figcaption>}
  </figure>)}</div>
}

function FeedbackMaterials({items,assessmentId,loadReportImage}:{items:PublicMaterial[];assessmentId?:string;loadReportImage?:(assetId:string)=>Promise<Blob>}){
  const load=useCallback(async(assetId:string)=>{
    if(loadReportImage)return loadReportImage(assetId)
    if(!assessmentId)throw new Error('当前报告未提供素材访问标识')
    const response=await sessionFetch(`/api/scales/assessments/${encodeURIComponent(assessmentId)}/report-assets/${encodeURIComponent(assetId)}`)
    if(!response.ok)throw new Error('反馈素材暂时无法读取')
    return response.blob()
  },[assessmentId,loadReportImage])
  return <TrainingMaterials items={items} loadAsset={load}/>
}
