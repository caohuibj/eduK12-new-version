import {CognitiveScoringInputError,type CognitiveScoreResult,type ScoringTrial} from '../cognitive.types'
import type {EmbeddedfiguresConfig} from '../schemas/embeddedfigures.config'
import {embeddedfiguresTrialSchema,type EmbeddedfiguresTrial} from '../schemas/embeddedfigures.trial'
import {embeddedfiguresItemV2,EMBEDDEDFIGURES_V2_STIMULUS} from '../tasks/embeddedfigures/generator.v2'
import {embeddedfiguresV2ConfigSchema} from '../schemas/embeddedfigures.v2.config'

/** 1.1.0 regenerates genuine line-context choices; V1 scoring stays untouched. */
export function scoreEmbeddedfiguresV2(input:{config:EmbeddedfiguresConfig;trials:ScoringTrial<EmbeddedfiguresTrial>[];randomSeed?:string}):CognitiveScoreResult{
 const {config}=input
 if(!embeddedfiguresV2ConfigSchema.safeParse(config).success||config.stimulusSetVersion!==EMBEDDEDFIGURES_V2_STIMULUS||!input.randomSeed)throw new CognitiveScoringInputError('embeddedfigures1.1.0 requires its exact stimulus set and seed')
 const trials=[...input.trials].sort((a,b)=>a.trialIndex-b.trialIndex)
 if(trials.length!==config.totalTrials)throw new CognitiveScoringInputError('embeddedfigures1.1.0 requires the complete planned sequence')
 const results=trials.map((trial,i)=>{
  const parsed=embeddedfiguresTrialSchema.safeParse(trial.payload)
  if(!parsed.success||trial.trialIndex!==i||trial.payload.itemIndex!==i)throw new CognitiveScoringInputError('Invalid embeddedfigures1.1.0 trial facts/order')
  const p=parsed.data,item=embeddedfiguresItemV2(input.randomSeed!,i)
  if(p.clickedShapeId!==null&&(!item.field.some(f=>f.id===p.clickedShapeId)||p.rtMs===null||p.rtMs>=config.timeoutMs))throw new CognitiveScoringInputError('Invalid embeddedfigures1.1.0 choice or late response')
  return {p,correct:p.clickedShapeId!==null&&p.clickedShapeId===item.targetId}
 })
 const correct=results.filter(r=>r.correct).length,accuracy=correct/trials.length
 const rts=results.filter(r=>r.correct&&r.p.rtMs!==null&&r.p.rtMs>=config.validRtFloorMs).map(r=>r.p.rtMs!).sort((a,b)=>a-b)
 const median=rts.length?(rts.length%2?rts[Math.floor(rts.length/2)]:(rts[rts.length/2-1]+rts[rts.length/2])/2):null
 const timeouts=results.filter(r=>r.p.clickedShapeId===null).length
 return {score:Math.round(accuracy*100),metrics:{accuracy,medianRtMs:median,errorCount:trials.length-correct-timeouts,timeoutCount:timeouts,validRtCount:rts.length},
  qualityFlags:{interpretable:true,insufficientValidRt:rts.length<2,lowAccuracy:accuracy<0.5,interrupted:results.some(r=>r.p.interrupted)}}
}
