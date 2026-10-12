import type { PrivacyOptions, PrivacyScenario, PrivacyPreset, EducationProduct } from './schema'
import { requireScenarioProduct } from './schema'

export type OptionKey = keyof PrivacyOptions
export type OptionGroup = 'COHORT' | 'DIFFERENCING' | 'CONTENT' | 'RELEASE'
export const optionGroups: ReadonlyArray<{key:OptionGroup;label:string}> = [
  {key:'COHORT',label:'群体统计附加保护'},
  {key:'DIFFERENCING',label:'跨轮与差分附加保护'},
  {key:'CONTENT',label:'报告内容附加保护'},
  {key:'RELEASE',label:'报告发布附加保护'},
]
export const optionsCatalog: ReadonlyArray<{key:OptionKey;group:OptionGroup;label:string;detail:string}> = [
  {key:'minRespondentsProfile',group:'COHORT',label:'提高群体最低人数至 10 人',detail:'仅作为可选附加人数门槛；不能降低工具自身的最低人数。'},
  {key:'requireAllCompleted',group:'COHORT',label:'必须全体完成后才披露群体报告',detail:'不改变原始 FINAL 的合法性和去重规则。'},
  {key:'withholdSmallCells',group:'COHORT',label:'少量选项人数不足时隐藏整题',detail:'避免披露很小的选项人数。'},
  {key:'protectSmallNonrespondentComplement',group:'COHORT',label:'未作答补集人数过小时阻止报告',detail:'附加的未完成者补集保护。'},
  {key:'crossReleaseOverlapGuard',group:'DIFFERENCING',label:'跨轮有效群体交叉差分保护',detail:'仅针对受支持的正式报告来源，不代表绝对匿名。'},
  {key:'restrictedStatisticsProjection',group:'CONTENT',label:'仅显示受限精度的统计摘要',detail:'不得突破已发布的科学统计方案。'},
  {key:'restrictItemDistributions',group:'CONTENT',label:'隐藏逐题选项分布',detail:'不授权开放任何原始个人作答。'},
  {key:'releaseDelayHours',group:'RELEASE',label:'正式关闭后附加等待 24 小时',detail:'不改变 Run/活动自身的发布和关闭状态。'},
]
export const scenarioNames: Record<PrivacyScenario,string> = {
  TEACHER_STUDENT_EVALUATION:'学生评教教师',
  TEACHER_ADULT_FORM_GROUP:'教师问卷与学校发展调查',
  SCHOOL_GENERAL_EDUCATION_GROUP:'学校氛围与一般教育调查',
  SCHOOL_SENSITIVE_WELLBEING_GROUP:'学生心理健康与敏感测评',
}

export const STANDARD: PrivacyOptions = Object.freeze({
  minRespondentsProfile:'BASELINE',
  requireAllCompleted:false,
  withholdSmallCells:false,
  protectSmallNonrespondentComplement:false,
  crossReleaseOverlapGuard:false,
  restrictedStatisticsProjection:false,
  restrictItemDistributions:false,
  releaseDelayHours:0,
})
export const ENHANCED: PrivacyOptions = Object.freeze({
  minRespondentsProfile:'N10',
  requireAllCompleted:true,
  withholdSmallCells:true,
  protectSmallNonrespondentComplement:true,
  crossReleaseOverlapGuard:true,
  restrictedStatisticsProjection:true,
  restrictItemDistributions:true,
  releaseDelayHours:24,
})
export function presetOptions(preset: Exclude<PrivacyPreset,'CUSTOM'>): PrivacyOptions {
  return {...(preset==='ENHANCED'?ENHANCED:STANDARD)}
}
export function recognizePreset(options: PrivacyOptions): PrivacyPreset {
  const match=(b:PrivacyOptions)=>optionsCatalog.every(item=>options[item.key]===b[item.key])
  return match(STANDARD)?'STANDARD':match(ENHANCED)?'ENHANCED':'CUSTOM'
}
export function reportPrivacyCatalog(product:EducationProduct, scenario:PrivacyScenario) {
  requireScenarioProduct(product,scenario)
  const sensitive=scenario==='SCHOOL_SENSITIVE_WELLBEING_GROUP'
  return {
    schemaVersion:1 as const,product,scenario,title:scenarioNames[scenario],
    groups:optionGroups,options:optionsCatalog,
    baselineAlwaysOn:[
      '当前教育产品及发布人授权','当前任教与学生身份关系',
      '个人作答及敏感心理数据隔离','加密和正式 FINAL 完整性',
      '工具科学许可、参与者告知和审计',
    ],
    // PR1 saves future preferences; PR2/PR3 alone activate the reporting consumers.
    reportConsumerActive:false as const,
    status:'PREFERENCES_ONLY' as const,
    sensitiveEnforced:sensitive,
    baselineNote:'此版本仅提供默认偏好保存与预览。现有报告门禁未改变。',
  }
}
