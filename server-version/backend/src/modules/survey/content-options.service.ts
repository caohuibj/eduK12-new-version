import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {authorizedProject} from './builder.service'
import {catalogSnapshotsForDrafts,compileCatalogUnit} from './catalog.service'
import {recheckCatalogScaleSourceExpiry} from './catalog.sources'
import {compileFrozenResearchUnit,resolveSurveyMeasurementUnit} from './publication.service'
import {SurveyWaveError} from './waves.service'
import {surveyContentReleaseInScope,surveyContentReleaseMatchesMeasurement} from './content-selection'
import {getContentReleaseBatch,type StoredRelease} from '../measurement-content/repository'
import {referenceEntryKey} from '../measurement-content/reference-candidate'
import type {AssessmentReferenceEntry} from '../assessment-reference/reference'

export const surveyContentOptionsQuerySchema=z.object({instrumentId:z.string().guid(),
  layer:z.enum(['REPORT','REFERENCE']),page:z.coerce.number().int().min(1).max(1000).default(1)}).strict()
const fail=(message:string):never=>{throw new SurveyWaveError(409,message)}
const pageSize=25
/** Metadata only: no templates, statistics, private sample manifests or scorer input. */
export function surveyContentOption(release:StoredRelease){
  const base={releaseId:release.releaseId,key:release.key,version:release.version,contentHash:release.contentHash,status:release.status}
  if(release.layer==='REPORT')return {...base,title:release.content.template.title,audience:release.content.audience,
    language:release.content.language,metricKeys:release.content.metricKeys}
  if(release.layer!=='REFERENCE')return fail('候选内容类型不匹配')
  return {...base,entries:release.content.entries.map(entry=>{
    const definition=entry.definition as unknown as AssessmentReferenceEntry
    return {entryKey:referenceEntryKey(definition),metricKey:entry.metricKey,referenceKind:entry.referenceKind,
      population:definition.population}
  })}
}
/** Read-only discovery; existing freeze remains the final authorization boundary.
 * Resolves an already published exact draft revision, never publishes on GET. */
export async function listSurveyContentOptions(actorId:string,projectId:string,waveId:string,raw:unknown){
  const input=surveyContentOptionsQuerySchema.parse(raw)
  return prisma.$transaction(async tx=>{
    await authorizedProject(tx,actorId,projectId,true)
    const wave=await tx.surveyWave.findFirst({where:{id:waveId,projectId}})
    if(!wave)throw new SurveyWaveError(404,'研究波次不存在')
    if(wave.status!=='DRAFT'||wave.publicationId)fail('波次已冻结或不可编辑，请查看冻结版本')
    if(!Array.isArray(wave!.instrumentIds)||!wave!.instrumentIds.includes(input.instrumentId))fail('研究工具不在此波次中')
    const draft=await tx.surveyInstrumentDraft.findFirst({where:{id:input.instrumentId,projectId,status:{in:['DRAFT','PUBLISHED']}}})
    if(!draft)fail('研究工具不存在或已归档')
    if(draft!.kind==='FORM')fail('普通表单不选择测量报告或参考版本')
    const sources=await catalogSnapshotsForDrafts(tx,actorId,draft!.catalogGrantId?[draft!.catalogGrantId]:[])
    const unit=draft!.catalogGrantId?compileCatalogUnit(draft!,sources.get(draft!.catalogGrantId)!):compileFrozenResearchUnit(draft!)
    const measurement=await resolveSurveyMeasurementUnit(tx,unit,actorId,projectId)
    unit.measurementRelease={releaseId:measurement.releaseId,contentHash:measurement.contentHash,measurementHash:measurement.content.measurementHash}
    const pointer=JSON.stringify({releaseId:measurement.releaseId,contentHash:measurement.contentHash})
    const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM measurement_content_releases
      WHERE layer=${input.layer} AND family=${unit.kind} AND status='PUBLISHED'
        AND scope->>'kind'='PRIVATE' AND scope->>'product'='SURVEY'
        AND scope->>'ownerId'=${actorId} AND scope->>'resourceId'=${projectId}
        AND ${input.layer==='REFERENCE'?Prisma.sql`content->'measurement'=${pointer}::jsonb`
          :Prisma.sql`content->'measurements'=${'['+pointer+']'}::jsonb`}
      ORDER BY published_at DESC,id LIMIT ${pageSize+1} OFFSET ${(input.page-1)*pageSize}`)
    const releases=await getContentReleaseBatch(tx,rows.map(row=>row.id))
    const options=rows.slice(0,pageSize).map(row=>{
      const release=releases.get(row.id)
      // Discovery may become stale; freeze always rechecks under its own locks.
      if(!release||release.layer!==input.layer||!surveyContentReleaseInScope(release,actorId,projectId)
        ||!surveyContentReleaseMatchesMeasurement(release,unit))return fail('候选版本已变化，请重新加载')
      return surveyContentOption(release)
    })
    await authorizedProject(tx,actorId,projectId,true)
    await recheckCatalogScaleSourceExpiry(tx,sources.values())
    return {instrumentId:draft!.id,instrumentKey:draft!.instrumentKey,title:draft!.title,kind:unit.kind,
      draftRevision:draft!.revision,waveRevision:wave!.revision,
      measurement:{releaseId:measurement.releaseId,contentHash:measurement.contentHash,version:measurement.version},
      layer:input.layer,page:input.page,pageSize,hasMore:rows.length>pageSize,options}
  })
}
