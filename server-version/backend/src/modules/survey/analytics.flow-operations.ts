import type { Request } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { assertRecentSurveyMfa } from './analytics.export.service'
import { SurveyAnalyticsError } from './analytics.read'
import type { SurveyFlowAssignment } from './flow.assignment'
import type { SurveyComputedFinal } from './final.compute'
import type { ResearchFrozenPublication } from './publication.service'
import type { FormDraft } from './builder.definition'

const fail=(code:number,message:string):never=>{throw new SurveyAnalyticsError(code,message)}
const MAX_ATTEMPTS=6000
const PAGE=200
type Count={starts:number;assigned:number;completedFinal:number;analysisIncluded:number;
  qualityExcluded:number;withdrawn:number;screenedOut:number;inProgress:number}
const init=():Count=>({
  starts:0,assigned:0,completedFinal:0,analysisIncluded:0,
  qualityExcluded:0,withdrawn:0,screenedOut:0,inProgress:0,
})
const increase=(counts:Count,row:{hasAssignment:boolean;hasFinal:boolean;
  status:string;excludedAt:Date|null;participant:{status:string}|null;
  sampleReview:{verdict:string}|null})=>{
  counts.starts++
  if(row.hasAssignment)counts.assigned++
  const withdrawn=row.status==='WITHDRAWN'||row.excludedAt!==null||
    row.participant?.status==='WITHDRAWN'
  if(withdrawn){counts.withdrawn++;return}
  if(row.status==='SCREENED_OUT'){counts.screenedOut++;return}
  if(row.status==='STARTED'){counts.inProgress++;return}
  if(row.hasFinal&&row.status==='COMPLETED'){
    counts.completedFinal++
    if(row.sampleReview?.verdict==='EXCLUDED')counts.qualityExcluded++
    else counts.analysisIncluded++
  }
}
type FormCategory={instrumentKey:string;itemKey:string}
type ScoreSelection={instrumentKey:string;scoreKey:string}
type ScoreAccumulator={n:number;mean:number;m2:number}
const emptyScore=():ScoreAccumulator=>({n:0,mean:0,m2:0})
export async function describeSurveyFlowOperations(req:Request,input:{
  projectId:string;waveId:string;category?:FormCategory;score?:ScoreSelection;
}){
  assertRecentSurveyMfa(req)
  const uid=req.user!.userId
  return prisma.$transaction(async tx=>{
    const [project]=await tx.$queryRaw<Array<{id:string;revision:number;sourceCutOff:Date}>>`
      SELECT p.id,p.revision,transaction_timestamp() AS "sourceCutOff"
      FROM survey_projects p
      JOIN users u ON u.id=p.owner_user_id
      JOIN survey_researcher_grants g ON g.user_id=u.id
      JOIN survey_mfa_credentials m ON m.user_id=u.id
      WHERE p.id=${input.projectId} AND p.owner_user_id=${uid}
        AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
        AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
        AND g.status='ACTIVE' AND m.enabled
      FOR SHARE OF p,u,g,m
    `
    if(!project)fail(404,'研究项目不可访问')
    const wave=await tx.surveyWave.findFirst({where:{
      id:input.waveId,projectId:input.projectId,publicationId:{not:null},
    },include:{publication:true,quotaBuckets:true}})
    if(!wave?.publication)fail(404,'研究波次或冻结定义不存在')
    const frozen=wave.publication.compiledSnapshot as unknown as ResearchFrozenPublication
    if(!frozen.flow||frozen.waveId!==wave.id||
      canonicalHash(JSON.parse(JSON.stringify(frozen)))!==wave.publication.definitionDigest)
      fail(409,'当前波次未使用可核验的冻结 Survey Flow')
    if(input.score){
      if(!frozen.flow.experiment)
        fail(409,'实验条件分组计分必须由已冻结的随机研究定义提供')
      const selected=frozen.units.find(u=>u.instrumentKey===input.score?.instrumentKey)
      if(!selected||!['SCALE','SJT'].includes(selected.kind))
        fail(400,'实验组得分必须来自本波次冻结 Scale 或 SJT')
      const scoring=(selected.compiledDefinition as {
        scoring?:{scores?:{key:string}[];publishedMetrics?:{key:string}[]}
      }).scoring
      const keys=selected.kind==='SCALE'?scoring?.scores:scoring?.publishedMetrics
      if(!keys?.some(x=>x.key===input.score?.scoreKey))
        fail(400,'实验组统计指标不存在或未被研究冻结计分器发布')
    }
    let categories:string[]=[]
    if(input.category){
      const unit=frozen.units.find(u=>u.instrumentKey===input.category?.instrumentKey)
      if(!unit||unit.kind!=='FORM')fail(400,'分类变量必须来自本波次的 Form 工具')
      const item=(unit.displayDefinition as FormDraft).pages.flatMap(p=>p.questions)
        .find(q=>q.itemKey===input.category?.itemKey)
      if(!item||!['SINGLE','LIKERT'].includes(item.type))
        fail(400,'分类变量须是明确的单选或 Likert 选项，不允许导出敏感文本')
      categories=item.options.map(o=>o.optionKey)
      if(categories.length>30)fail(413,'条件分类取值过多')
    }
    const attempts=await tx.surveyWaveAttempt.count({where:{
      projectId:input.projectId,waveId:wave.id,
    }})
    if(attempts>MAX_ATTEMPTS)
      fail(413,'此波次已超过 6000 个 Attempt 的交互式统计预算；请使用分批科研导出')
    const global=init()
    const byGroup=new Map<string,Count>()
    const categorySummary=new Map<string,number>()
    for(const category of categories)categorySummary.set(category,0)
    if(categories.length)for(const special of ['NOT_SHOWN','SHOWN_MISSING','REFUSED'])
      categorySummary.set(special,0)
    const attemptsWithFinal:string[]=[]
    const groupByAttempt=new Map<string,string>()
    const groupsByCategory=new Map<string,Map<string,number>>()
    const scoreGroups=new Map<string,ScoreAccumulator>()
    if(categories.length)for(const group of frozen.flow.experiment?.groups??[])
      groupsByCategory.set(group.groupKey,new Map([...categories,
        'NOT_SHOWN','SHOWN_MISSING','REFUSED'].map(category=>[category,0])))
    // UUID keyset pagination avoids PostgreSQL microsecond → JS millisecond
    // truncation that can repeat or skip adjacent concurrent Attempt rows.
    // REPEATABLE READ fixes the cohort while walking this immutable keyset.
    let afterId:string|undefined
    let processed=0
    while(true){
      const rows=await tx.surveyWaveAttempt.findMany({where:{
        projectId:input.projectId,waveId:wave.id,
        ...(afterId?{id:{gt:afterId}}:{}),
      },orderBy:[{id:'asc'}],take:PAGE,select:{
        id:true,status:true,excludedAt:true,
        flowAssignmentCipher:true,participant:{select:{status:true}},
        final:{select:{id:true}},
        sampleReview:{select:{verdict:true}},
      }})
      if(!rows.length)break
      for(const row of rows){
        let group:string|null=null
        if(row.flowAssignmentCipher){
          const assignment=decryptUnifiedRuntimePayload<SurveyFlowAssignment>(
            row.flowAssignmentCipher)
          if(assignment.schemaVersion!==1||assignment.flowDigest!==frozen.flow.flowDigest||
            assignment.experimentKey!==(frozen.flow.experiment?.experimentKey??null)||
            (assignment.groupKey!==null&&!frozen.flow.experiment?.groups.some(
              g=>g.groupKey===assignment.groupKey)))
            fail(409,'研究分组与此 Wave 的冻结 Flow 来源不一致')
          group=assignment.groupKey
        }
        if(row.status!=='WITHDRAWN'&&row.excludedAt===null
          &&row.participant?.status!=='WITHDRAWN'
          &&!row.flowAssignmentCipher)
          fail(409,'正在参与或已经完成的 Flow Attempt 缺少持久化实验分配')
        const status={...row,hasAssignment:!!row.flowAssignmentCipher,
          hasFinal:!!row.final}
        increase(global,status)
        if(group){
          const count=byGroup.get(group)??init()
          increase(count,status)
          byGroup.set(group,count)
        }
        if((categories.length||input.score)&&row.final&&row.status==='COMPLETED'
          &&!row.excludedAt&&row.participant?.status!=='WITHDRAWN'
          &&row.sampleReview?.verdict!=='EXCLUDED'){
          attemptsWithFinal.push(row.id)
          if(group)groupByAttempt.set(row.id,group)
        }
      }
      processed+=rows.length
      if(processed>MAX_ATTEMPTS)fail(413,'统计波次读取发生超出限制的新增作答')
      afterId=rows[rows.length-1].id
      if(rows.length<PAGE)break
    }
    if(processed!==attempts)fail(409,'研究波次参与计数在读取期间不一致')
    if(categories.length||input.score){
      const wanted=new Set(attemptsWithFinal)
      for(let start=0;start<attemptsWithFinal.length;start+=PAGE){
        const ids=attemptsWithFinal.slice(start,start+PAGE)
        const finals=await tx.surveyWaveFinal.findMany({where:{
          projectId:input.projectId,waveId:wave.id,attemptId:{in:ids},
          publicationId:wave.publication.id,
        },select:{attemptId:true,definitionDigest:true,resultsCipher:true,
          resultsHash:true}})
        for(const final of finals){
          if(final.definitionDigest!==wave.publication.definitionDigest)
            fail(409,'分类数据使用了另一冻结 Publication')
          const result=decryptUnifiedRuntimePayload<SurveyComputedFinal>(final.resultsCipher)
          if(result.definitionDigest!==final.definitionDigest||
            canonicalHash(JSON.parse(JSON.stringify(result)))!==final.resultsHash)
            fail(409,'统计源 FINAL 的完整性校验失败')
          const group=groupByAttempt.get(final.attemptId)
          if(input.score&&group){
            const unit=result.units.find(u=>u.instrumentKey===input.score!.instrumentKey)
            if(unit&&unit.kind!=='FORM'&&!unit.notExecuted){
              const metrics=unit.privateScoring as
                |{scores?:{key:string;value:number|null}[];
                  metrics?:{key:string;value:number|null}[]}|null
              const score=(metrics?.scores??metrics?.metrics??[])
                .find(x=>x.key===input.score!.scoreKey)
              if(score&&typeof score.value==='number'&&Number.isFinite(score.value)){
                const running=scoreGroups.get(group)??emptyScore()
                running.n++
                const delta=score.value-running.mean
                running.mean+=delta/running.n
                running.m2+=delta*(score.value-running.mean)
                scoreGroups.set(group,running)
              }
            }
          }
          if(categories.length){
          const unit=result.units.find(u=>u.instrumentKey===input.category!.instrumentKey)
          const answer=unit?.rawAnswers[input.category!.itemKey]
          const missing=unit?.missing.find(x=>x.itemKey===input.category!.itemKey)?.reason
          const category=typeof answer==='string'&&categories.includes(answer)
            ?answer:missing??'SHOWN_MISSING'
          categorySummary.set(category,(categorySummary.get(category)??0)+1)
          if(group){
            const counts=groupsByCategory.get(group)
            if(!counts)fail(409,'存在未声明的研究实验组')
            counts!.set(category,(counts!.get(category)??0)+1)
          }
          }
          wanted.delete(final.attemptId)
        }
      }
      if(wanted.size)fail(409,'部分有效 FINAL 缺少来源；拒绝生成不完整分类统计')
      const sum=[...categorySummary.values()].reduce((a,b)=>a+b,0)
      if(categories.length&&sum!==global.analysisIncluded)
        fail(409,'Form 分类统计与有效 FINAL 样本分母不一致')
    }
    const assignmentReservations=wave.quotaBuckets.map(b=>({
      groupKey:b.groupKey,maxAssigned:b.maxAssigned,everAssigned:b.assignedCount,
      available:b.maxAssigned-b.assignedCount,
    })).sort((a,b)=>a.groupKey.localeCompare(b.groupKey))
    if(frozen.quotaPolicy&&(
      assignmentReservations.length!==frozen.flow.experiment?.groups.length||
      assignmentReservations.some(b=>frozen.quotaPolicy!.groupLimits[b.groupKey]!==b.maxAssigned)
    ))fail(409,'实验配额账本与冻结 Publication 不一致')
    return {
      projectId:input.projectId,waveId:wave.id,
      waveStatus:wave.status,publicationVersion:wave.publication.version,
      definitionDigest:wave.publication.definitionDigest,flowDigest:frozen.flow.flowDigest,
      experimentalAssignment:'ENCRYPTED_ATTEMPT_LEVEL',
      asOf:project.sourceCutOff,sourceProjectRevision:project.revision,
      total:global,quotaReservations:assignmentReservations,
      groups:frozen.flow.experiment?.groups.map(group=>({
        groupKey:group.groupKey,counts:byGroup.get(group.groupKey)??init(),
      }))??[],
      ...(input.score?{
        score:{
          ...input.score,denominator:'ANALYSIS_INCLUDED_FINAL',
          minGroupN:5,
          groups:(frozen.flow.experiment?.groups??[]).flatMap(group=>{
            const expected=byGroup.get(group.groupKey)?.analysisIncluded??0
            const summary=scoreGroups.get(group.groupKey)??emptyScore()
            if(expected<5||summary.n<5)return []
            return [{groupKey:group.groupKey,respondentN:expected,scoreValidN:summary.n,
              mean:summary.mean,sampleSd:summary.n>1?Math.sqrt(summary.m2/(summary.n-1)):null}]
          }),
          suppressedGroups:(frozen.flow.experiment?.groups??[]).filter(group=>{
            const n=byGroup.get(group.groupKey)?.analysisIncluded??0
            const valid=scoreGroups.get(group.groupKey)?.n??0
            return n<5||valid<5
          }).length,
          note:'随机实验分组的受控描述统计；小于5份有效答案的组不显示均值，不构成因果推断。',
        },
      }:{}),
      ...(input.category?{
        category:{...input.category,denominator:'ANALYSIS_INCLUDED_FINAL',
          counts:Object.fromEntries(categorySummary),
          byExperimentGroup:[...groupsByCategory].map(([groupKey,counts])=>({
            groupKey,counts:Object.fromEntries(counts),
          }))},
      }:{}),
      limits:{maxAttempts:MAX_ATTEMPTS,pageSize:PAGE,
        complete:true,noTruncation:true,rawAnswersIncluded:false},
    }
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:45000})
}
