import { assertSurveyDraft, type FormDraft, type ScaleDraft, type SjtDraft } from './builder.definition'
import { verifiedSurveyAttempt } from './admission.service'
import { SurveyWaveError } from './waves.service'
type SurveyFrozenImage=NonNullable<FormDraft['pages'][number]['questions'][number]['image']>
export function projectPublicSurveyImage(image:SurveyFrozenImage|undefined){
  if(!image)return undefined
  return {asset:{assetId:image.asset.assetId,contentHash:image.asset.contentHash,
    mimeType:image.asset.mimeType},altText:image.altText,
    ...(image.caption?{caption:image.caption}:{})}
}

/** No public API may return authored score rules, dimension contributions or
 * frozen private result snapshots. Only the participant's task projection.
 */
export async function getOwnResearchTask(input:{
  publicId:string;attemptId:string;researchCode?:string;accessCredential:string
}){
  const own=await verifiedSurveyAttempt(input)
  if(!['STARTED','COMPLETED'].includes(own.status))
    throw new SurveyWaveError(403,'研究作答已经关闭')
  const units=own.compiledSnapshot.units.map(unit=>{
    if(unit.kind==='FORM'){
      // Published definitions are immutable; do not retroactively invalidate an
      // older Wave solely for an operator combination newly restricted in Builder.
      const d=assertSurveyDraft('FORM',unit.displayDefinition,true,true) as FormDraft
      return {kind:'FORM',instrumentKey:unit.instrumentKey,title:unit.title,
        pages:d.pages.map(page=>({pageKey:page.pageKey,title:page.title,
          questions:page.questions.map(q=>({
            itemKey:q.itemKey,type:q.type,prompt:q.prompt,image:projectPublicSurveyImage(q.image),required:q.required,allowRefusal:q.allowRefusal===true,
            options:q.options.map(o=>({optionKey:o.optionKey,label:o.label})),
            rows:q.rows.map(row=>({rowKey:row.rowKey,label:row.label})),
            min:q.min,max:q.max,maxLength:q.maxLength,displayIf:q.displayIf,
          }))}))}
    }
    if(unit.kind==='SCALE'){
      const d=assertSurveyDraft('SCALE',unit.displayDefinition,true) as ScaleDraft
      return {kind:'SCALE',instrumentKey:unit.instrumentKey,title:unit.title,
        responseOptions:d.responseOptions.map(o=>({optionKey:o.optionKey,label:o.label})),
        items:d.items.map(q=>({itemKey:q.itemKey,prompt:q.prompt,required:q.required}))}
    }
    const d=assertSurveyDraft('SJT',unit.displayDefinition,true) as SjtDraft
    return {kind:'SJT',instrumentKey:unit.instrumentKey,title:unit.title,
      stimulus:d.stimulus,scenarioTitle:d.title,image:projectPublicSurveyImage(d.image),
      questions:d.questions.map(q=>({questionKey:q.questionKey,prompt:q.prompt,
        responseType:q.responseType??'SINGLE',
        minSelections:q.responseType==='MULTIPLE'?(q.minSelections??1):undefined,
        maxSelections:q.responseType==='MULTIPLE'?(q.maxSelections??q.options.length):undefined,
        options:q.options.map(o=>({optionKey:o.optionKey,label:o.label}))}))}
  })
  return {attemptId:own.attemptId,waveId:own.waveId,status:own.status,
    definitionDigest:own.definitionDigest,reportMode:'GENERAL_ONLY',units}
}
