import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import type {ResearchFrozenPublication,ResearchFrozenUnit} from './publication.service'
import {SurveyWaveError} from './waves.service'

/** Resolve the existing immutable publication pointer; never copy or reopen a
 * mutable tool draft to recover T1. The caller retains current owner/grant and
 * published-release checks at its ordinary authoring/publication boundary. */
export async function loadSurveyTrackingSource(tx:Prisma.TransactionClient,projectId:string,sourceWaveId:string|null){
  if(!sourceWaveId)return undefined
  const source=await tx.surveyWave.findFirst({where:{id:sourceWaveId,projectId},include:{publication:true}})
  if(!source?.publication||canonicalHash(source.publication.compiledSnapshot)!==source.publication.definitionDigest)
    throw new SurveyWaveError(409,'续轮来源缺失或摘要不一致')
  const snapshot=source.publication.compiledSnapshot as unknown as ResearchFrozenPublication
  if(snapshot.projectId!==projectId||snapshot.waveId!==sourceWaveId||!snapshot.longitudinal)
    throw new SurveyWaveError(409,'续轮来源没有冻结追踪计划')
  return snapshot
}

/** A tracked fixed Bundle keeps all required slots; ordinary compositions
 * inherit only tracked leaves and keep their other draft content editable. */
export function inheritedSurveyTrackingUnit(source:ResearchFrozenPublication|undefined,draft:{id:string;instrumentKey:string;catalogGrantId?:string|null}):ResearchFrozenUnit|undefined{
  if(!source?.longitudinal)return undefined
  const tracked=new Set(source.longitudinal.metrics.map(m=>m.draftId))
  for(const pack of source.governedPackages??[]){
    if(pack.family==='BUNDLE'&&pack.slots.some(slot=>tracked.has(slot.draftId)))
      for(const slot of pack.slots)tracked.add(slot.draftId)
  }
  if(!tracked.has(draft.id))return undefined
  const matches=source.units.filter(unit=>unit.draftId===draft.id&&unit.instrumentKey===draft.instrumentKey)
  if(matches.length!==1)throw new SurveyWaveError(409,'冻结追踪工具位置不唯一或已变化')
  const unit=matches[0]
  if((unit.sourceProvenance?.sourceGrantId??null)!==(draft.catalogGrantId??null))
    throw new SurveyWaveError(409,'冻结追踪工具的当前来源授权不一致')
  return structuredClone(unit)
}
