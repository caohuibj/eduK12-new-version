import {createHmac,timingSafeEqual} from 'node:crypto'
import {SurveyAnalyticsError} from './analytics.read'
const fail=():never=>{throw new SurveyAnalyticsError(400,'研究导出分页凭证无效或已过期')}
export interface SurveyExportCursor {
  /** V1 timestamp, V2 stable UUID, V3 separate expanded attendance, V4 compact attendance and adaptive FINAL pages. */
  v:1|2|3|4;projectId:string;waveId:string;format:'RAW_WAVE'|'RAW_LONG'|'SCORE_LONG'
  phase?:'FINALS'|'ATTENDANCE'
  attendanceCount?:number
  /** Signed upper bound for FINALs on the following page; V4 only. */
  pageLimit?:number
  afterAttemptId?:string|null
  after:{id:string;completedAt:string}
  cutOff:string;sourceRevision:number;page:number;issuedAt:number
  completedFrom:string|null;completedBefore:string|null
  freeTextIncluded:boolean
  finalCount:number
}
const signer=()=>{
  const key=process.env.ASSET_SIGNING_SECRET
  if(!key||key.length<32)throw new SurveyAnalyticsError(503,'研究导出分页签名服务尚未配置')
  return key
}
export function encodeSurveyExportCursor(data:SurveyExportCursor):string{
  const body=Buffer.from(JSON.stringify(data),'utf8').toString('base64url')
  const signature=createHmac('sha256',signer()).update(body).digest('base64url')
  return body+'.'+signature
}
export function decodeSurveyExportCursor(raw:string,projectId:string,
  format:SurveyExportCursor['format'],waveId:string):SurveyExportCursor{
  if(!raw||raw.length>1300||!raw.includes('.'))fail()
  const [body,mac,...rest]=raw.split('.')
  if(rest.length||!body||!mac)fail()
  const expected=createHmac('sha256',signer()).update(body).digest()
  let supplied:Buffer
  try{supplied=Buffer.from(mac,'base64url')}catch{return fail()}
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))fail()
  try{
    const token=JSON.parse(Buffer.from(body,'base64url').toString('utf8')) as SurveyExportCursor
    if((token.v!==1&&token.v!==2&&token.v!==3&&token.v!==4)||token.projectId!==projectId||token.waveId!==waveId||
      token.format!==format||!token.after||!token.after.id
      ||!/^[a-f0-9-]{36}$/i.test(token.after.id)
      ||!Number.isFinite(Date.parse(token.after.completedAt))
      ||!Number.isFinite(Date.parse(token.cutOff))
      ||!Number.isSafeInteger(token.sourceRevision)||token.sourceRevision<0
      ||!Number.isSafeInteger(token.finalCount)||token.finalCount<0
      ||!Number.isSafeInteger(token.page)||token.page<1||token.page>(token.v===4?500:token.v===3?200:100)
      ||((token.v===3||token.v===4)&&(
        (token.phase!=='FINALS'&&token.phase!=='ATTENDANCE')
        ||typeof token.attendanceCount!=='number'
        ||!Number.isSafeInteger(token.attendanceCount)
        ||token.attendanceCount<0||token.attendanceCount>25000
        ||(token.v===4&&(!Number.isSafeInteger(token.pageLimit)
          ||token.pageLimit!<1||token.pageLimit!>250))
        ||(token.phase==='FINALS'&&token.afterAttemptId!==undefined)
        ||(token.phase==='ATTENDANCE'&&token.afterAttemptId!==null
          &&token.afterAttemptId!==undefined
          &&(typeof token.afterAttemptId!=='string'
            ||!/^[a-f0-9-]{36}$/i.test(token.afterAttemptId)))
      ))
      ||!Number.isFinite(token.issuedAt)||token.issuedAt>Date.now()
      ||Date.now()-token.issuedAt>60*60*1000)fail()
    return token
  }catch{return fail()}
}
