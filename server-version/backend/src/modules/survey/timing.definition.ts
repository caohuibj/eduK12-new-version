import {z} from 'zod'
import type {ResearchFrozenPublication} from './publication.service'
import type {ScaleDraft} from './builder.definition'

export {scaleTimingItemSchema as surveyScaleTimingItemSchema} from '../assessment-core/scale/item-timing'
import {scaleTimingItemSchema as surveyScaleTimingItemSchema,type ScaleItemTimingV1 as SurveyScaleItemTimingV1} from '../assessment-core/scale/item-timing'
export type {ScaleItemTimingV1 as SurveyScaleItemTimingV1} from '../assessment-core/scale/item-timing'
export type SurveyScaleTimings=Record<string,Record<string,SurveyScaleItemTimingV1>>
export class SurveyScaleTimingError extends Error{
  constructor(readonly path:string,message:string){super(message)}
}
const reject=(path:string,message:string):never=>{throw new SurveyScaleTimingError(path,message)}
const isRecord=(o:unknown):o is Record<string,unknown>=>
  !!o&&typeof o==='object'&&!Array.isArray(o)
/** Validate the exact frozen Scale set and answer IDs, including a legacy
 * ALL_AT_ONCE fallback. No unshown instrument may carry timing telemetry.
 */
export function validateSurveyScaleTimings(
  snapshot:ResearchFrozenPublication,
  answers:Record<string,unknown>,
  raw:unknown,
  requireCompleted:boolean,
):SurveyScaleTimings|undefined{
  const active=Object.keys(answers).filter(key=>{
    const unit=snapshot.units.find(u=>u.instrumentKey===key)
    return unit?.kind==='SCALE'&&
      (unit.displayDefinition as ScaleDraft).presentationMode==='ONE_BY_ONE'
  })
  if(raw===undefined){
    if(requireCompleted&&active.length)reject('itemTimings','逐题施测必须提供每题计时状态')
    return undefined
  }
  if(!isRecord(raw)||Object.keys(raw).length>30)
    throw new SurveyScaleTimingError('itemTimings','逐题时间必须按研究量表分组')
  if(Buffer.byteLength(JSON.stringify(raw),'utf8')>400000)
    reject('itemTimings','逐题计时元数据超过 400KB 安全预算')
  const validated:SurveyScaleTimings={}
  let count=0
  for(const [instrumentKey,items] of Object.entries(raw)){
    const unit=snapshot.units.find(u=>u.instrumentKey===instrumentKey)
    if(!unit||unit.kind!=='SCALE'||
      (unit.displayDefinition as ScaleDraft).presentationMode!=='ONE_BY_ONE'||
      !isRecord(answers[instrumentKey]))
      throw new SurveyScaleTimingError('itemTimings.'+instrumentKey,
        '只有本次实际作答的逐题 Scale 可以提交计时')
    if(!isRecord(items))
      throw new SurveyScaleTimingError('itemTimings.'+instrumentKey,'量表时间必须以题目编码索引')
    const frozen=new Set((unit.displayDefinition as ScaleDraft).items.map(q=>q.itemKey))
    const answered=answers[instrumentKey] as Record<string,unknown>
    const projected:Record<string,SurveyScaleItemTimingV1>={}
    for(const [itemKey,timing] of Object.entries(items)){
      count++
      if(count>3000)reject('itemTimings','单次研究逐题计时超过 3000 题容量预算')
      if(!frozen.has(itemKey)||!Object.prototype.hasOwnProperty.call(answered,itemKey))
        reject('itemTimings.'+instrumentKey+'.'+itemKey,'未知、未答或未展示题目不允许计时')
      const parsed=surveyScaleTimingItemSchema.safeParse(timing)
      if(!parsed.success)
        throw new SurveyScaleTimingError('itemTimings.'+instrumentKey+'.'+itemKey,
          '逐题时间字段不符合整数毫秒与质量标记契约')
      const row=parsed.data
      if(row.firstResponseMs!==null&&
        (row.activeTimeMs<row.firstResponseMs||row.visits<1))
        reject('itemTimings.'+instrumentKey+'.'+itemKey,'首次反应时间不能超过有效前台停留时间')
      if(row.firstResponseMs===null&&!row.recoveredWithoutClock)
        reject('itemTimings.'+instrumentKey+'.'+itemKey,'缺少历史首次计时必须明确标记恢复不完整')
      if(row.revisitCount>Math.max(0,row.visits-1))
        reject('itemTimings.'+instrumentKey+'.'+itemKey,'重复进入次数与展示次数不一致')
      projected[itemKey]=row
    }
    if(requireCompleted&&Object.keys(answered).some(key=>!Object.prototype.hasOwnProperty.call(projected,key)))
      reject('itemTimings.'+instrumentKey,'本次逐题 Scale 的每一项回答必须关联明确计时或恢复缺失状态')
    validated[instrumentKey]=projected
  }
  if(requireCompleted&&active.some(key=>!Object.prototype.hasOwnProperty.call(validated,key)))
    reject('itemTimings','已完成的逐题量表缺少计时工具记录')
  return validated
}
