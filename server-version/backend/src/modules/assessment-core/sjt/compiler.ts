import { canonicalHash } from '../../assessment-runtime/canonical'
import { validateBranchingSituationDefinition, type SituationDefinitionV2 } from '../../situational/situation-branching'
import { SjtDraftError, type SjtDraftV2 } from './definition'
import { expandedSjtOptions } from './selection'
import { sjtQuestionEntries } from './structure'

/** Fixed-scene SJT compiler. Reuses the checked measurement plane without importing
 * platform author-upload CORE, node-size, narrative, or review workflow rules. */
export interface SjtCompileContext {
  compilerVersion:string; physicalPrefix:string; scoringPrefix:string; reportVersion:string;
  metricChannelKey:string; packageKey:string; instrumentVersion:string
}
export function compileSjtV2(instrumentKey:string,d:SjtDraftV2,context:SjtCompileContext) {
  const entries=sjtQuestionEntries(d)
  const physical=(questionKey:string)=>context.physicalPrefix+questionKey
  const expanded=new Map(entries.map(({question:q})=>[
    q.questionKey,expandedSjtOptions(q).filter(o=>!o.nonanswerReason),
  ]))
  const definition:SituationDefinitionV2={
    schemaVersion:2,respondentType:d.respondentType,
    source:{title:d.title,citation:[d.author,d.sourceNote,d.scoring.sourceNote].filter(Boolean).join('；')},
    license:{status:d.licenseStatus,redistribution:d.redistribution,note:d.sourceNote},
    sampling:{strategy:'BRANCH_REACHABLE'},
    scenes:entries.map(({scene,question:q},index)=>({
      sceneKey:physical(q.questionKey),title:scene.title,sortOrder:index,
      stimulus:scene.image?{type:'IMAGE',text:scene.stimulus,asset:scene.image.asset,
        altText:scene.image.altText,...(scene.image.caption?{caption:scene.image.caption}:{})}
        :{type:'TEXT_V1',text:scene.stimulus},
      primaryConstruct:d.metrics[0].metricKey,
      secondaryConstructs:d.metrics.slice(1).map(m=>m.metricKey),situationFeatures:{},
      channels:[{channelKey:q.questionKey,purpose:'BEHAVIOR_TENDENCY',responseType:'SINGLE_CHOICE',
        prompt:q.prompt,options:expanded.get(q.questionKey)!.map(o=>({optionKey:o.optionKey,label:o.label}))}],
    })),
    flow:{strategy:'BRANCHING_DAG_V1',entryNodeKey:physical(entries[0].question.questionKey),
      nodes:[...entries.map(({scene,question:q},index)=>({
        nodeType:'SCENE' as const,nodeKey:physical(q.questionKey),sceneKey:physical(q.questionKey),
        motherSceneKey:scene.sceneKey,roundKey:scene.sceneKey,stepKey:q.questionKey,
        channelPolicies:[{channelKey:q.questionKey,measurementRole:'SCORED' as const,
          // Refusal is a valid Survey response; its absence from scorer inputs is intentional.
          required:!!q.required&&!q.allowRefusal&&!q.options.some(o=>o.nonanswerReason)}],
        transition:{type:'NEXT' as const,nextNodeKey:entries[index+1]
          ?physical(entries[index+1].question.questionKey):'END'},
      })),{nodeType:'TERMINAL',nodeKey:'END'}]},
    scoring:{scoringVersion:context.scoringPrefix+(d.scoring.modelKey==='AUTHOR_KEY_SUM'?'author-sum':'expert-mean')+'-1',
      choiceScores:[],model:{contractVersion:'situational-model-v1',modelKey:d.scoring.modelKey,
        modelVersion:d.scoring.modelVersion,
        expertKey:entries.flatMap(({question:q})=>expanded.get(q.questionKey)!.flatMap(o=>d.metrics.map(m=>({
          sceneKey:physical(q.questionKey),channelKey:q.questionKey,optionKey:o.optionKey,
          metricKey:m.metricKey,contribution:o.contributions[m.metricKey],
        })))),
      },
      publishedMetrics:d.metrics.map((m,i)=>({key:m.metricKey,label:m.label,construct:m.metricKey,
        channelKey:context.metricChannelKey,direction:'descriptive',role:i===0?'primary':'secondary',displayPrecision:2})),
    },
    report:{reportVersion:context.reportVersion,primaryMetricKeys:[d.metrics[0].metricKey],
      metricOrder:d.metrics.map(m=>m.metricKey),interpretations:d.metrics.map(m=>({
        metricKey:m.metricKey,headline:m.label,summary:'描述本次研究作答的冻结贡献；不作常模、诊断或等级解释。',
        bands:[],guidance:[],
      })),
      limitations:[d.scoring.modelKey==='EXPERT_KEY'
        ?'专家键来源由研究者提供；本版本跨问题按均值聚合，并非平台认证或效度证明。'
        :'作者贡献按问题求和；不提供自动跨维度总分或部分作答校正。',
      '缺失、拒答或不适用使相关指标不可计算，不补零；独立情境按原情境分组统计。'],
      disclaimer:'研究自编探索性工具，仅描述本次研究条件下的作答；不提供常模、诊断或能力等级。'},
    referencePolicy:{type:'none'},
  }
  const validation=validateBranchingSituationDefinition(definition)
  const errors=validation.issues.filter(i=>i.severity==='error')
  if(!validation.definition||errors.length)throw new SjtDraftError(errors)
  const pkg={key:context.packageKey,instrumentVersion:context.instrumentVersion,
    releaseStatus:'DRAFT' as const,definition:validation.definition,goldenCases:[]}
  const compilerVersion=context.compilerVersion
  return {package:pkg,compilerVersion,
    contentDigest:canonicalHash(JSON.parse(JSON.stringify({compilerVersion,definition:d,package:pkg}))),
    definitionHash:canonicalHash(validation.definition)}
}
