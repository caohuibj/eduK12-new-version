import type {PrivacyOptions} from '../report-privacy/schema'

type Metric={
  state?:string;validN?:number;missingN?:number;
  aggregations?:Record<string,unknown>;
}
type Source={
  kind?:string;state?:string;eligibleN?:number;resultContributorN?:number;
  metrics?:Record<string,Metric>;
}
export type CampusGeneralProjection={
  artifactId:string;kind:'SCHOOL_GENERAL_GROUP';state:'READY'|'WITHHELD';
  participantN:number|null;completedN:number|null;
  metrics:Record<string,{mean:number;validN?:number;missingN?:number;
    median?:number;sdPopulation?:number;sdSample?:number}>;
  limitations:string[];
}
const round=(value:number,places:number)=>
  Math.round((value+Number.EPSILON)*10**places)/10**places
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)
/**
 * No individual-level answer leaves this pure source-backed projection.
 * All metrics already passed independently published scientific rules.
 * SMALL_CELL and item distribution controls cannot be used to create
 * distributions here; this projection deliberately contains NO cells.
 */
export function projectCampusGeneralGroupV2(input:{
  artifactId:string;projection:unknown;options:PrivacyOptions;
  minimumN:number;metricMinimums:Readonly<Record<string,number>>
}):CampusGeneralProjection{
  const withheld=(why:string):CampusGeneralProjection=>({
    artifactId:input.artifactId,kind:'SCHOOL_GENERAL_GROUP',state:'WITHHELD',
    participantN:null,completedN:null,metrics:{},
    limitations:['该群体当前不满足正式科学与报告保护要求。',why],
  })
  const p=input.projection as Source
  if(!p||p.kind!=='GROUP'||p.state!=='present'
    ||!Number.isInteger(p.eligibleN)||!Number.isInteger(p.resultContributorN)
    ||(p.eligibleN??0)<input.minimumN
    ||(p.resultContributorN??0)<input.minimumN
    ||p.resultContributorN!>p.eligibleN!
    ||!p.metrics||typeof p.metrics!=='object')return withheld('GROUP_SOURCE_NOT_READY')
  const N=p.eligibleN!,n=p.resultContributorN!
  if(input.options.requireAllCompleted&&n!==N)
    return withheld('ALL_COMPLETED_REQUIRED')
  if(input.options.protectSmallNonrespondentComplement
    &&n!==N&&N-n<5)return withheld('NONRESPONDENT_COMPLEMENT_SMALL')
  const metrics:CampusGeneralProjection['metrics']={}
  for(const [key,m] of Object.entries(p.metrics)){
    if(m?.state!=='present')continue
    const floor=Math.max(input.minimumN,input.metricMinimums[key]??input.minimumN)
    const v=m.validN??0,missing=m.missingN??-1
    if(!Number.isInteger(v)||!Number.isInteger(missing)||v>n
      ||missing!==N-v||v<floor)continue
    if(input.options.requireAllCompleted&&v!==N)continue
    if(input.options.protectSmallNonrespondentComplement
      &&missing>0&&missing<5)continue
    const mean=m.aggregations?.mean
    if(!finite(mean))continue
    const record:CampusGeneralProjection['metrics'][string]={
      mean:round(mean,input.options.restrictedStatisticsProjection?1:2),
    }
    if(!input.options.restrictedStatisticsProjection){
      record.validN=v
      record.missingN=missing
      const median=m.aggregations?.median
      const sd=m.aggregations?.sdPopulation
      const sampleSd=m.aggregations?.sdSample
      if(finite(median))record.median=round(median,2)
      if(finite(sd))record.sdPopulation=round(sd,2)
      if(finite(sampleSd))record.sdSample=round(sampleSd,2)
    }
    metrics[key]=record
  }
  if(Object.keys(metrics).length===0)return withheld('NO_REVIEWED_METRICS')
  return {
    artifactId:input.artifactId,kind:'SCHOOL_GENERAL_GROUP',state:'READY',
    participantN:input.options.restrictedStatisticsProjection?null:N,
    completedN:input.options.restrictedStatisticsProjection?null:n,
    metrics,limitations:[
      '仅限获授权的校内一般教育群体研究，不向普通教师、家长或学生披露个人心理资料。',
      '使用独立审核的 GROUP 科学方案；非诊断、非因果证据，也不直接用于个人绩效或学生排名。',
      '不公开姓名、学号、个人原始得分、作答时间、答卷或可用于识别学生的筛选条件。',
    ],
  }
}
