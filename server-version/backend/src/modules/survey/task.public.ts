import { readSurveyCognitiveProgressFromVerifiedAttempt } from './cognitive.service'
import { surveySjtScenes } from './sjt-structure'
import { parseFrozenSurveyCognitive } from './cognitive.definition'
import { assertSurveyDraft, type FormDraft, type ScaleDraft, type AnySjtDraft } from './builder.definition'
import { verifiedSurveyAttempt } from './admission.service'
import { prisma } from '../../config/database'
import { ensureSurveyFlowAssignment } from './flow.assignment'
import { buildSurveyFlowPublicProjection } from './flow.runtime'
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
  // A lost screen-out response must be recoverable without revealing the
  // qualifying answers or allocating/reopening an already terminal Flow.
  if(own.status==='SCREENED_OUT')return {
    attemptId:own.attemptId,waveId:own.waveId,status:'SCREENED_OUT' as const,
    definitionDigest:own.definitionDigest,reportMode:'GENERAL_ONLY' as const,units:[],
  }
  if(!['STARTED','COMPLETED'].includes(own.status))
    throw new SurveyWaveError(403,'研究作答已经关闭')
  // Recheck current identity under Attempt/participant locks; this persists
  // cryptographic assignment before revealing any selected stimulus.
  const assignment=own.compiledSnapshot.flow
    ?await prisma.$transaction(tx=>ensureSurveyFlowAssignment(tx,{
      projectId:own.projectId,waveId:own.waveId,attemptId:own.attemptId,
      participantId:own.participantId,researchCode:input.researchCode,
      accessCredential:input.accessCredential,snapshot:own.compiledSnapshot,
    })):null
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
            min:q.min,max:q.max,integerOnly:q.integerOnly,step:q.step,precision:q.precision,
            total:q.total,minSelections:q.minSelections,maxSelections:q.maxSelections,
            otherOptionKey:q.otherOptionKey,otherMaxLength:q.otherMaxLength,
            exclusiveOptionKeys:q.exclusiveOptionKeys,
            timeZone:q.timeZone,textValidation:q.textValidation,
            maxLength:q.maxLength,displayIf:q.displayIf,
          }))}))}
    }
    if(unit.kind==='SCALE'){
      const d=assertSurveyDraft('SCALE',unit.displayDefinition,true) as ScaleDraft
      return {kind:'SCALE',instrumentKey:unit.instrumentKey,title:unit.title,
        presentationMode:d.presentationMode??'ALL_AT_ONCE',
        responseOptions:d.responseOptions.map(o=>({optionKey:o.optionKey,label:o.label})),
        items:d.items.map(q=>({itemKey:q.itemKey,prompt:q.prompt,required:q.required}))}
    }
    if(unit.kind==='COGNITIVE'){
      const frozen=parseFrozenSurveyCognitive(unit.compiledDefinition)
      return {kind:'COGNITIVE',instrumentKey:unit.instrumentKey,title:unit.title,
        templateKey:frozen.templateKey,measurementDigest:frozen.measurementDigest,
        devicePolicy:frozen.devicePolicy,timingPolicy:frozen.timingPolicy,
        maturity:frozen.maturity,restartLimit:frozen.restartLimit,
        totalTrials:120,estimatedDurationSeconds:180,
        feedback:{mode:frozen.feedback.mode,release:frozen.feedback.release},
        partialRetentionDays:frozen.partialRetentionDays}
    }
    const d=assertSurveyDraft('SJT',unit.displayDefinition,true) as AnySjtDraft
    const scenes=surveySjtScenes(d).map(scene=>({sceneKey:scene.sceneKey,
      title:scene.title,stimulus:scene.stimulus,image:projectPublicSurveyImage(scene.image),
      questions:scene.questions.map(q=>({questionKey:q.questionKey,prompt:q.prompt,
        responseType:q.responseType??'SINGLE',required:q.required??true,
        allowRefusal:q.allowRefusal??false,exclusiveOptionKeys:q.exclusiveOptionKeys,
        minSelections:q.responseType==='MULTIPLE'?(q.minSelections??1):undefined,
        maxSelections:q.responseType==='MULTIPLE'?(q.maxSelections??q.options.length):undefined,
        options:q.options.map(o=>({optionKey:o.optionKey,label:o.label,
          ...('nonanswerReason' in o&&o.nonanswerReason?{nonanswerReason:o.nonanswerReason}:{})}))}))}))
    if(d.schemaVersion===1)return {kind:'SJT',instrumentKey:unit.instrumentKey,title:unit.title,
      stimulus:d.stimulus,scenarioTitle:d.title,image:projectPublicSurveyImage(d.image),
      questions:scenes[0].questions}
    return {kind:'SJT',schemaVersion:2,instrumentKey:unit.instrumentKey,title:unit.title,
      orderPolicy:'FIXED',scenes}

  })
  const cognitiveProgress=own.status==='STARTED'&&own.compiledSnapshot.units.some(unit=>unit.kind==='COGNITIVE')
    ?await readSurveyCognitiveProgressFromVerifiedAttempt(input,own):null
  return {attemptId:own.attemptId,waveId:own.waveId,status:own.status,
    ...(cognitiveProgress??{}),
    definitionDigest:own.definitionDigest,reportMode:'GENERAL_ONLY',units,
    ...(own.compiledSnapshot.checkpointPolicy?{
      checkpointPolicy:{enabled:true,ttlHours:own.compiledSnapshot.checkpointPolicy.ttlHours},
    }:{}),
    ...(assignment&&own.compiledSnapshot.flow?{
      flow:buildSurveyFlowPublicProjection(own.compiledSnapshot.flow,assignment),
    }:{}),}
}
